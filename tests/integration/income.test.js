import { beforeEach, describe, expect, it, vi } from 'vitest';
import { currentMonthKey } from '../../src/lib/dates.js';
import { prisma, registerUser, resetDb, today } from '../helpers.js';

// Claude simulado: «nómina» -> Nómina (ingresos), «taxi» -> Transporte (gastos).
vi.mock('../../src/modules/ai/claude.js', () => ({
  categorizeBatch: vi.fn(async (items, _names, kind) => {
    const map = new Map();
    for (const it of items) {
      if (kind === 'INCOME' && /nómina|nomina/i.test(it.text)) map.set(it.i, 'Nómina');
      if (kind === 'EXPENSE' && /taxi/i.test(it.text)) map.set(it.i, 'Transporte');
    }
    return map;
  }),
  generateInsights: vi.fn(),
}));
vi.mock('../../src/modules/bank/tink.client.js', async (importOriginal) => ({
  ...(await importOriginal()),
  exchangeCode: vi.fn(async () => 'access-token'),
  fetchAllTransactions: vi.fn(),
}));
const { categorizeBatch } = await import('../../src/modules/ai/claude.js');
const tink = await import('../../src/modules/bank/tink.client.js');

beforeEach(async () => {
  await resetDb();
  vi.clearAllMocks();
});

const add = (u, body) => u.agent.post('/api/expenses').send({ date: today(), ...body });

describe('ingresos', () => {
  it('registra ingresos y calcula ingresos, gastos y balance del mes', async () => {
    const u = await registerUser();
    await add(u, { kind: 'INCOME', amount: '1800', description: 'Nómina octubre', categoryId: u.categories['Nómina'].id }).expect(201);
    await add(u, { amount: '650', description: 'Alquiler', categoryId: u.categories.Vivienda.id }).expect(201);

    const { body } = await u.agent.get(`/api/stats?month=${currentMonthKey()}`).expect(200);
    expect(body.totals).toMatchObject({ totalCents: 65000, count: 1, incomeCents: 180000, incomeCount: 1, balanceCents: 115000 });
    expect(body.trend.at(-1)).toMatchObject({ totalCents: 65000, incomeCents: 180000 });
    // Los ingresos no entran en el reparto de gastos ni en presupuestos.
    expect(body.byCategory.map((r) => r.name)).toEqual(['Vivienda']);
    expect(body.incomeByCategory).toEqual([expect.objectContaining({ name: 'Nómina', totalCents: 180000 })]);

    const incomes = await u.agent.get('/api/expenses?kind=INCOME').expect(200);
    expect(incomes.body.items.map((e) => e.description)).toEqual(['Nómina octubre']);
  });

  it('categoriza ingresos solo entre categorías de ingreso', async () => {
    const u = await registerUser();
    const nomina = await add(u, { kind: 'INCOME', amount: 1500, description: 'NOMINA EMPRESA SL' }).expect(201);
    expect(nomina.body.expense).toMatchObject({ kind: 'INCOME', categorizedBy: 'AI' });
    expect(nomina.body.expense.category.name).toBe('Nómina');

    const otro = await add(u, { kind: 'INCOME', amount: 20, description: 'Bizum de Ana' }).expect(201);
    expect(otro.body.expense.category.name).toBe('Otros ingresos');

    const calls = categorizeBatch.mock.calls.map(([, names, kind]) => ({ names, kind }));
    expect(calls.every((c) => c.kind === 'INCOME')).toBe(true);
    expect(calls[0].names).toEqual(['Nómina', 'Reembolsos', 'Otros ingresos']);
  });

  it('no mezcla tipos: categoría de ingreso en un gasto -> 400; sin presupuesto para ingresos', async () => {
    const u = await registerUser();
    const res = await add(u, { amount: 10, description: 'x', categoryId: u.categories['Nómina'].id }).expect(400);
    expect(res.body.error.code).toBe('CATEGORY_KIND_MISMATCH');

    await u.agent.post('/api/categories').send({ name: 'Alquileres cobrados', kind: 'INCOME', monthlyBudget: 100 }).expect(400);
    const created = await u.agent.post('/api/categories').send({ name: 'Alquileres cobrados', kind: 'INCOME' }).expect(201);
    expect(created.body.category.kind).toBe('INCOME');
    const patch = await u.agent.patch(`/api/categories/${created.body.category.id}`).send({ monthlyBudget: 50 }).expect(400);
    expect(patch.body.error.code).toBe('BUDGET_EXPENSE_ONLY');
  });

  it('cambiar un gasto a ingreso lo mueve a «Otros ingresos»; borrar una categoría de ingreso también', async () => {
    const u = await registerUser();
    const e = await add(u, { amount: 40, description: 'Devolución', categoryId: u.categories.Compras.id }).expect(201);
    const moved = await u.agent.patch(`/api/expenses/${e.body.expense.id}`).send({ kind: 'INCOME' }).expect(200);
    expect(moved.body.expense).toMatchObject({ kind: 'INCOME', categorizedBy: 'FALLBACK' });
    expect(moved.body.expense.category.name).toBe('Otros ingresos');

    await u.agent
      .patch(`/api/expenses/${e.body.expense.id}`)
      .send({ categoryId: u.categories.Ocio.id })
      .expect(400);

    const r = await add(u, { kind: 'INCOME', amount: 15, description: 'Reembolso', categoryId: u.categories.Reembolsos.id }).expect(201);
    const del = await u.agent.delete(`/api/categories/${u.categories.Reembolsos.id}`).expect(200);
    expect(del.body.reassignedTo).toBe(u.categories['Otros ingresos'].id);
    const after = await prisma.expense.findUnique({ where: { id: r.body.expense.id } });
    expect(after.categoryId).toBe(u.categories['Otros ingresos'].id);
  });

  it('Tink: los importes positivos se importan como ingresos', async () => {
    const u = await registerUser();
    const tx = (id, unscaledValue, display) => ({
      id,
      status: 'BOOKED',
      amount: { value: { unscaledValue, scale: '2' }, currencyCode: 'EUR' },
      descriptions: { display },
      dates: { booked: '2026-03-10' },
    });
    tink.fetchAllTransactions.mockResolvedValue({
      accounts: 1,
      transactions: [tx('a', '-1250', 'Taxi aeropuerto'), tx('b', '250000', 'Nómina marzo'), tx('c', '3000', 'Bizum')],
    });
    const { body: link } = await u.agent.get('/api/bank/connect-url').expect(200);
    const state = new URL(link.url).searchParams.get('state');
    const { body } = await u.agent.post('/api/bank/import').send({ code: 'c', state }).expect(200);
    expect(body).toMatchObject({ imported: 3, importedExpenses: 1, importedIncome: 2 });

    const saved = await prisma.expense.findMany({ where: { userId: u.user.id }, include: { category: true } });
    const byId = Object.fromEntries(saved.map((e) => [e.externalId, e]));
    expect(byId.a).toMatchObject({ kind: 'EXPENSE', amountCents: 1250, categorizedBy: 'AI' });
    expect(byId.a.category.name).toBe('Transporte');
    expect(byId.b).toMatchObject({ kind: 'INCOME', amountCents: 250000, categorizedBy: 'AI' });
    expect(byId.b.category.name).toBe('Nómina');
    expect(byId.c.category.name).toBe('Otros ingresos');
  });
});
