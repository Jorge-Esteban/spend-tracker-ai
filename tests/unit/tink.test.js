import { describe, expect, it, vi } from 'vitest';
import { buildTinkLinkUrl, fetchAllTransactions, paginate } from '../../src/modules/bank/tink.client.js';
import { parseTinkTransaction, parseTinkTransactions } from '../../src/modules/bank/tink.parser.js';

// Transacción con la forma documentada de Tink Data v2.
const tx = (overrides = {}) => ({
  id: 'd8f37f7d19c240abb4ef5d5dbebae4ef',
  accountId: 'acc-1',
  status: 'BOOKED',
  amount: { value: { unscaledValue: '-1350', scale: '2' }, currencyCode: 'EUR' },
  descriptions: { original: 'COMPRA TARJ 1234 MERCADONA MADRID', display: 'Mercadona' },
  dates: { booked: '2026-03-15', value: '2026-03-16' },
  merchantInformation: { merchantName: 'Mercadona', merchantCategoryCode: '5411' },
  ...overrides,
});

describe('parseTinkTransaction', () => {
  it('convierte un cargo v2 en gasto en céntimos positivos', () => {
    expect(parseTinkTransaction(tx())).toEqual({
      expense: {
        externalId: 'd8f37f7d19c240abb4ef5d5dbebae4ef',
        amountCents: 1350,
        currency: 'EUR',
        description: 'Mercadona',
        merchant: 'Mercadona',
        date: new Date('2026-03-15T00:00:00.000Z'),
      },
    });
  });

  it('ignora ingresos y movimientos pendientes', () => {
    expect(parseTinkTransaction(tx({ amount: { value: { unscaledValue: '5000', scale: '2' } } }))).toEqual({ skip: 'income' });
    expect(parseTinkTransaction(tx({ status: 'PENDING' }))).toEqual({ skip: 'pending' });
  });

  it('usa la descripción original si no hay display ni comercio', () => {
    const { expense } = parseTinkTransaction(
      tx({ descriptions: { original: 'RECIBO LUZ' }, merchantInformation: undefined }),
    );
    expect(expense).toMatchObject({ description: 'RECIBO LUZ', merchant: null });
  });

  it('usa dates.value si falta booked y marca inválida una fecha mal formada', () => {
    expect(parseTinkTransaction(tx({ dates: { value: '2026-03-16' } })).expense.date.toISOString()).toBe(
      '2026-03-16T00:00:00.000Z',
    );
    expect(parseTinkTransaction(tx({ dates: { booked: '15/03/2026' } }))).toEqual({ skip: 'invalid' });
  });

  it('marca inválidas las transacciones sin id o sin importe', () => {
    expect(parseTinkTransaction(tx({ id: undefined }))).toEqual({ skip: 'invalid' });
    expect(parseTinkTransaction(tx({ amount: {} }))).toEqual({ skip: 'invalid' });
    expect(parseTinkTransaction(null)).toEqual({ skip: 'invalid' });
  });

  it('NO acepta la forma v1 (description / amount numérico / date)', () => {
    expect(parseTinkTransaction({ id: 'x', description: 'Bar', amount: -10, date: 1700000000000 })).toEqual({
      skip: 'invalid',
    });
  });
});

describe('parseTinkTransactions', () => {
  it('deduplica por id dentro del lote y cuenta descartes', () => {
    const { expenses, skipped } = parseTinkTransactions([
      tx(),
      tx(),
      tx({ id: 'b', status: 'PENDING' }),
      tx({ id: 'c', amount: { value: { unscaledValue: '1', scale: '0' } } }),
    ]);
    expect(expenses).toHaveLength(1);
    expect(skipped).toEqual({ income: 1, pending: 1, invalid: 0, duplicateInBatch: 1 });
  });
});

const jsonResponse = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

describe('cliente Tink', () => {
  it('pagina siguiendo nextPageToken', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ transactions: [{ id: 1 }], nextPageToken: 'p2' }))
      .mockResolvedValueOnce(jsonResponse({ transactions: [{ id: 2 }], nextPageToken: '' }));
    const items = await paginate(fetchImpl, '/data/v2/transactions', [['accountIdIn', 'a']], 'transactions', 'tok');
    expect(items).toEqual([{ id: 1 }, { id: 2 }]);
    expect(fetchImpl.mock.calls[1][0]).toContain('pageToken=p2');
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe('Bearer tok');
  });

  it('pide transacciones con un accountIdIn por cuenta', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ accounts: [{ id: 'a1' }, { id: 'a2' }] }))
      .mockResolvedValueOnce(jsonResponse({ transactions: [tx()] }));
    const result = await fetchAllTransactions('tok', fetchImpl);
    expect(result.accounts).toBe(2);
    expect(result.transactions).toHaveLength(1);
    const url = new URL(fetchImpl.mock.calls[1][0]);
    expect(url.pathname).toBe('/data/v2/transactions');
    expect(url.searchParams.getAll('accountIdIn')).toEqual(['a1', 'a2']);
  });

  it('traduce un 401 de Tink a un error 400 seguro', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ errorMessage: 'secreto' }, 401));
    await expect(paginate(fetchImpl, '/data/v2/accounts', [], 'accounts', 'tok')).rejects.toMatchObject({
      status: 400,
      code: 'BANK_AUTH',
    });
  });

  it('construye la URL de Tink Link con state y modo test', () => {
    const url = new URL(buildTinkLinkUrl('estado-firmado'));
    expect(url.origin).toBe('https://link.tink.com');
    expect(url.searchParams.get('state')).toBe('estado-firmado');
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:5173/bank/callback');
    expect(url.searchParams.get('test')).toBe('true');
  });
});
