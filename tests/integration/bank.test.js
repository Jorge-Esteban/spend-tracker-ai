import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma, registerUser, resetDb } from '../helpers.js';

vi.mock('../../src/modules/ai/claude.js', () => ({
  categorizeBatch: vi.fn(async (items) => new Map(items.map((it) => [it.i, 'Comida']))),
  generateInsights: vi.fn(),
}));

// Tink simulado: el parser real procesa transacciones con forma v2.
vi.mock('../../src/modules/bank/tink.client.js', async (importOriginal) => ({
  ...(await importOriginal()),
  exchangeCode: vi.fn(async () => 'access-token'),
  fetchAllTransactions: vi.fn(),
}));
const tink = await import('../../src/modules/bank/tink.client.js');
const { categorizeBatch } = await import('../../src/modules/ai/claude.js');

const tx = (id, unscaledValue, booked = '2026-03-10', extra = {}) => ({
  id,
  status: 'BOOKED',
  amount: { value: { unscaledValue, scale: '2' }, currencyCode: 'EUR' },
  descriptions: { display: `Comercio ${id}`, original: `COMPRA ${id}` },
  dates: { booked },
  ...extra,
});

beforeEach(async () => {
  await resetDb();
  vi.clearAllMocks();
});

async function connect(agent) {
  const { body } = await agent.get('/api/bank/connect-url').expect(200);
  return new URL(body.url).searchParams.get('state');
}

// Primero se obtiene el state y después se lanza la importación (dos peticiones, en orden).
async function importWith(agent, code, status) {
  const state = await connect(agent);
  return agent.post('/api/bank/import').send({ code, state }).expect(status);
}

describe('importación bancaria (Tink)', () => {
  it('rechaza un state ausente, inventado o de otro usuario', async () => {
    const a = await registerUser();
    const b = await registerUser();
    await a.agent.post('/api/bank/import').send({ code: 'c' }).expect(400);
    const bad = await a.agent.post('/api/bank/import').send({ code: 'c', state: 'inventado' }).expect(400);
    expect(bad.body.error.code).toBe('INVALID_STATE');
    const stateOfB = await connect(b.agent);
    await a.agent.post('/api/bank/import').send({ code: 'c', state: stateOfB }).expect(400);
    expect(tink.exchangeCode).not.toHaveBeenCalled();
  });

  it('importa cargos e ingresos, categoriza en un lote por tipo y deduplica por externalId', async () => {
    const u = await registerUser();
    tink.fetchAllTransactions.mockResolvedValue({
      accounts: 1,
      transactions: [
        tx('t1', '-1250'),
        tx('t2', '-300'),
        tx('t3', '250000'), // nómina: ingreso
        tx('t4', '-999', '2026-03-11', { status: 'PENDING' }),
      ],
    });

    const first = await importWith(u.agent, 'c1', 200);
    expect(first.body).toMatchObject({
      accounts: 1,
      fetched: 4,
      imported: 3,
      importedExpenses: 2,
      importedIncome: 1,
      duplicates: 0,
      skippedByQuota: 0,
      skipped: { pending: 1 },
    });
    // Un lote para los gastos y otro para los ingresos.
    expect(categorizeBatch).toHaveBeenCalledTimes(2);
    expect(categorizeBatch.mock.calls.map((c) => [c[0].length, c[2]])).toEqual([
      [2, 'EXPENSE'],
      [1, 'INCOME'],
    ]);

    const saved = await prisma.expense.findMany({ where: { userId: u.user.id }, orderBy: { amountCents: 'desc' } });
    expect(saved.map((e) => [e.externalId, e.kind, e.amountCents, e.source, e.categorizedBy])).toEqual([
      ['t3', 'INCOME', 250000, 'BANK', 'FALLBACK'], // el mock no conoce categorías de ingreso
      ['t1', 'EXPENSE', 1250, 'BANK', 'AI'],
      ['t2', 'EXPENSE', 300, 'BANK', 'AI'],
    ]);

    // Segunda importación con los mismos movimientos: nada nuevo.
    const again = await importWith(u.agent, 'c2', 200);
    expect(again.body).toMatchObject({ imported: 0, duplicates: 3 });
    expect(await prisma.expense.count({ where: { userId: u.user.id } })).toBe(3);

    const status = await u.agent.get('/api/bank/status').expect(200);
    expect(status.body).toMatchObject({ enabled: true, bankExpenses: 3 });
    expect(status.body.lastImportAt).toBeTruthy();
  });

  it('respeta la cuota FREE quedándose con los movimientos más recientes', async () => {
    const u = await registerUser();
    tink.fetchAllTransactions.mockResolvedValue({
      accounts: 1,
      transactions: Array.from({ length: 7 }, (_, i) => tx(`q${i}`, '-100', `2026-03-0${i + 1}`)),
    });
    const { body } = await importWith(u.agent, 'c', 200);
    expect(body).toMatchObject({ imported: 5, skippedByQuota: 2 });
    const dates = (await prisma.expense.findMany({ where: { userId: u.user.id } })).map((e) => e.externalId).sort();
    expect(dates).toEqual(['q2', 'q3', 'q4', 'q5', 'q6']);
  });

  it('un error de Tink no filtra detalles internos', async () => {
    const u = await registerUser();
    const { AppError } = await import('../../src/lib/errors.js');
    tink.exchangeCode.mockRejectedValueOnce(new AppError(400, 'La autorización del banco ha caducado', 'BANK_AUTH'));
    const res = await importWith(u.agent, 'c', 400);
    expect(res.body.error.code).toBe('BANK_AUTH');

    tink.exchangeCode.mockRejectedValueOnce(new Error('ECONNRESET 10.0.0.1 detalles internos'));
    const boom = await importWith(u.agent, 'c', 500);
    expect(boom.body.error.message).toBe('Error interno del servidor');
  });
});
