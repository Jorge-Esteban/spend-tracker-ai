import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma, registerUser, resetDb } from '../helpers.js';

vi.mock('../../src/modules/ai/claude.js', () => ({ categorizeBatch: vi.fn(async () => new Map()), generateInsights: vi.fn() }));

// Enable Banking simulado; el parser y el guardado son los reales.
vi.mock('../../src/modules/bank/enablebanking.client.js', () => ({
  listAspsps: vi.fn(async () => [{ name: 'imagin', country: 'ES', logo: null, beta: true }]),
  startAuthorization: vi.fn(async ({ aspsp, state }) => `https://bank.example/${aspsp}?state=${state}`),
  fetchAllTransactions: vi.fn(),
}));
const eb = await import('../../src/modules/bank/enablebanking.client.js');

const tx = (ref, amount, indicator, extra = {}) => ({
  accountUid: 'acc-1',
  tx: {
    entry_reference: ref,
    status: 'BOOK',
    transaction_amount: { amount, currency: 'EUR' },
    credit_debit_indicator: indicator,
    booking_date: '2026-10-10',
    remittance_information: [`Movimiento ${ref}`],
    ...extra,
  },
});

beforeEach(async () => {
  await resetDb();
  vi.clearAllMocks();
});

async function connectImagin(agent) {
  const { body } = await agent.get('/api/bank/connect-url?provider=enablebanking&aspsp=imagin').expect(200);
  return new URL(body.url).searchParams.get('state');
}

describe('Enable Banking', () => {
  it('estado con los dos proveedores y lista de bancos', async () => {
    const u = await registerUser();
    const status = await u.agent.get('/api/bank/status').expect(200);
    expect(status.body.providers).toMatchObject({ tink: { enabled: true }, enablebanking: { enabled: true, country: 'ES' } });
    const list = await u.agent.get('/api/bank/aspsps').expect(200);
    expect(list.body.aspsps.map((a) => a.name)).toContain('imagin');
  });

  it('exige banco para conectar y lo guarda en el state', async () => {
    const u = await registerUser();
    const res = await u.agent.get('/api/bank/connect-url?provider=enablebanking').expect(400);
    expect(res.body.error.code).toBe('ASPSP_REQUIRED');
    await connectImagin(u.agent);
    expect(eb.startAuthorization).toHaveBeenCalledWith(expect.objectContaining({ aspsp: 'imagin' }));
  });

  it('importa cargos e ingresos de imagin y deduplica en la segunda importación', async () => {
    const u = await registerUser();
    eb.fetchAllTransactions.mockResolvedValue({
      accounts: 1,
      transactions: [tx('R1', '23.45', 'DBIT'), tx('R2', '1850.00', 'CRDT'), tx('R3', '5.00', 'DBIT', { status: 'PDNG' })],
    });

    const state = await connectImagin(u.agent);
    const first = await u.agent.post('/api/bank/import').send({ code: 'c1', state }).expect(200);
    expect(first.body).toMatchObject({
      provider: 'enablebanking',
      aspsp: 'imagin',
      imported: 2,
      importedExpenses: 1,
      importedIncome: 1,
      skipped: { pending: 1 },
    });
    expect(eb.fetchAllTransactions).toHaveBeenCalledWith('c1', { since: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });

    const saved = await prisma.expense.findMany({ where: { userId: u.user.id }, orderBy: { amountCents: 'asc' } });
    expect(saved.map((e) => [e.externalId, e.kind, e.amountCents, e.source])).toEqual([
      ['eb:R1', 'EXPENSE', 2345, 'BANK'],
      ['eb:R2', 'INCOME', 185000, 'BANK'],
    ]);

    const state2 = await connectImagin(u.agent);
    const again = await u.agent.post('/api/bank/import').send({ code: 'c2', state: state2 }).expect(200);
    expect(again.body).toMatchObject({ imported: 0, duplicates: 2 });
  });

  it('registra la vuelta sin autorización y valida el cuerpo', async () => {
    const u = await registerUser();
    const state = await connectImagin(u.agent);
    await u.agent
      .post('/api/bank/callback-error')
      .send({ state, error: 'access_denied', description: 'El usuario canceló' })
      .expect(204);
    await u.agent.post('/api/bank/callback-error').send({ description: 'x'.repeat(600) }).expect(400);
    expect(eb.fetchAllTransactions).not.toHaveBeenCalled();
  });

  it('Tink sigue siendo el proveedor por defecto (Demo Bank)', async () => {
    const u = await registerUser();
    const { body } = await u.agent.get('/api/bank/connect-url').expect(200);
    expect(new URL(body.url).origin).toBe('https://link.tink.com');
    expect(eb.fetchAllTransactions).not.toHaveBeenCalled();
  });
});
