import { createPublicKey } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { describe, expect, it, vi } from 'vitest';
import { decimalToCents } from '../../src/lib/money.js';
import {
  fetchAccountTransactions,
  fetchAllTransactions,
  makeAppToken,
  startAuthorization,
} from '../../src/modules/bank/enablebanking.client.js';
import { externalIdFor, parseEbTransaction, parseEbTransactions } from '../../src/modules/bank/enablebanking.parser.js';

// Transacción con la forma de Enable Banking (Berlin Group).
const tx = (overrides = {}) => ({
  entry_reference: 'REF-001',
  status: 'BOOK',
  transaction_amount: { amount: '23.45', currency: 'EUR' },
  credit_debit_indicator: 'DBIT',
  booking_date: '2026-10-03',
  value_date: '2026-10-04',
  remittance_information: ['COMPRA TARJ. MERCADONA', 'MADRID'],
  creditor: { name: 'MERCADONA SA' },
  ...overrides,
});

describe('decimalToCents', () => {
  it.each([
    ['23.45', 2345],
    ['1080', 108000],
    ['0.5', 50],
    ['12.345', 1235],
    ['-7.1', -710],
  ])('%s -> %s', (input, cents) => expect(decimalToCents(input)).toBe(cents));

  it.each([['12,34'], [''], ['abc'], [null]])('rechaza %s', (input) => expect(() => decimalToCents(input)).toThrow());
});

describe('parseEbTransaction', () => {
  it('cargo (DBIT) -> gasto con el acreedor como comercio', () => {
    expect(parseEbTransaction(tx(), 'acc-1')).toEqual({
      expense: {
        externalId: 'eb:REF-001',
        kind: 'EXPENSE',
        amountCents: 2345,
        currency: 'EUR',
        description: 'COMPRA TARJ. MERCADONA MADRID',
        merchant: 'MERCADONA SA',
        date: new Date('2026-10-03T00:00:00.000Z'),
      },
    });
  });

  it('abono (CRDT) -> ingreso con el deudor como pagador', () => {
    const { expense } = parseEbTransaction(
      tx({ credit_debit_indicator: 'CRDT', remittance_information: ['NOMINA OCTUBRE'], creditor: undefined, debtor: { name: 'ACME SL' }, transaction_amount: { amount: '1850.00', currency: 'EUR' } }),
    );
    expect(expense).toMatchObject({ kind: 'INCOME', amountCents: 185000, merchant: 'ACME SL', description: 'NOMINA OCTUBRE' });
  });

  it('ignora pendientes y marca inválidos los datos incompletos', () => {
    expect(parseEbTransaction(tx({ status: 'PDNG' }))).toEqual({ skip: 'pending' });
    expect(parseEbTransaction(tx({ credit_debit_indicator: undefined }))).toEqual({ skip: 'invalid' });
    expect(parseEbTransaction(tx({ transaction_amount: { amount: '0.00' } }))).toEqual({ skip: 'invalid' });
    expect(parseEbTransaction(tx({ booking_date: undefined, value_date: undefined }))).toEqual({ skip: 'invalid' });
    expect(parseEbTransaction(null)).toEqual({ skip: 'invalid' });
  });

  it('sin concepto usa la contraparte y, si tampoco hay, un texto genérico', () => {
    expect(parseEbTransaction(tx({ remittance_information: [] })).expense.description).toBe('MERCADONA SA');
    expect(parseEbTransaction(tx({ remittance_information: undefined, creditor: undefined })).expense.description).toBe(
      'Movimiento bancario',
    );
  });

  it('sin referencia, el id es un hash estable de los datos fijos', () => {
    const noRef = tx({ entry_reference: undefined });
    expect(externalIdFor(noRef, 'acc-1')).toMatch(/^eb:h:[0-9a-f]{32}$/);
    expect(externalIdFor(noRef, 'acc-1')).toBe(externalIdFor({ ...noRef }, 'acc-1'));
    expect(externalIdFor(noRef, 'acc-1')).not.toBe(externalIdFor(noRef, 'acc-2'));
    expect(externalIdFor(tx({ entry_reference: undefined, transaction_id: 'T9' }))).toBe('eb:T9');
  });

  it('deduplica dentro del lote', () => {
    const { expenses, skipped } = parseEbTransactions([
      { accountUid: 'a', tx: tx() },
      { accountUid: 'a', tx: tx() },
      { accountUid: 'a', tx: tx({ entry_reference: 'REF-002', status: 'PDNG' }) },
    ]);
    expect(expenses).toHaveLength(1);
    expect(skipped).toEqual({ pending: 1, invalid: 0, duplicateInBatch: 1 });
  });
});

const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

describe('cliente Enable Banking', () => {
  it('firma el JWT de aplicación con RS256, kid = id de la app y audiencia correcta', () => {
    const token = makeAppToken(1_800_000_000);
    const { header, payload } = jwt.decode(token, { complete: true });
    expect(header).toMatchObject({ alg: 'RS256', typ: 'JWT', kid: 'test-app-id' });
    expect(payload).toMatchObject({ iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat: 1_800_000_000, exp: 1_800_003_600 });
    // Verifica la firma con la clave pública derivada de la privada de test.
    const pem = process.env.ENABLE_BANKING_PRIVATE_KEY.replace(/\\n/g, '\n');
    expect(() => jwt.verify(token, createPublicKey(pem), { algorithms: ['RS256'], ignoreExpiration: true })).not.toThrow();
  });

  it('inicia la autorización con el banco, el state y la redirect configurada', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({ url: 'https://imagin.example/consent' }));
    const url = await startAuthorization({ aspsp: 'imagin', state: 'st', now: new Date('2026-10-31T00:00:00Z') }, fetchImpl);
    expect(url).toBe('https://imagin.example/consent');
    const [reqUrl, init] = fetchImpl.mock.calls[0];
    expect(String(reqUrl)).toBe('https://api.enablebanking.com/auth');
    expect(init.headers.Authorization).toMatch(/^Bearer /);
    expect(JSON.parse(init.body)).toMatchObject({
      aspsp: { name: 'imagin', country: 'ES' },
      state: 'st',
      redirect_url: 'https://localhost:5173/bank/callback',
      psu_type: 'personal',
      access: { valid_until: '2027-01-29T00:00:00.000Z' },
    });
  });

  it('pagina las transacciones con continuation_key', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json({ transactions: [tx()], continuation_key: 'k2' }))
      .mockResolvedValueOnce(json({ transactions: [tx({ entry_reference: 'REF-002' })], continuation_key: null }));
    const items = await fetchAccountTransactions('uid 1', '2025-10-31', fetchImpl);
    expect(items).toHaveLength(2);
    const second = new URL(fetchImpl.mock.calls[1][0]);
    expect(second.pathname).toBe('/accounts/uid%201/transactions');
    expect(second.searchParams.get('continuation_key')).toBe('k2');
    expect(second.searchParams.get('date_from')).toBe('2025-10-31');
  });

  it('crea la sesión y recorre todas las cuentas', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json({ session_id: 's1', accounts: [{ uid: 'a1' }, { uid: 'a2' }] }))
      .mockResolvedValueOnce(json({ transactions: [tx()] }))
      .mockResolvedValueOnce(json({ transactions: [tx({ entry_reference: 'X' })] }));
    const out = await fetchAllTransactions('code', { since: '2025-10-31' }, fetchImpl);
    expect(out.accounts).toBe(2);
    expect(out.transactions.map((t) => t.accountUid)).toEqual(['a1', 'a2']);
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ code: 'code' });
  });

  it('traduce un 401 a un error 400 seguro', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({ error: 'EXPIRED_SESSION', message: 'detalle interno' }, 401));
    await expect(fetchAccountTransactions('a1', '2025-10-31', fetchImpl)).rejects.toMatchObject({ status: 400, code: 'BANK_AUTH' });
  });
});
