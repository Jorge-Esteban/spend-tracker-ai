import { beforeEach, describe, expect, it, vi } from 'vitest';
import { currentMonthKey, shiftMonth } from '../../src/lib/dates.js';
import { prisma, registerUser, resetDb } from '../helpers.js';

vi.mock('../../src/modules/ai/claude.js', () => ({ categorizeBatch: vi.fn(async () => new Map()), generateInsights: vi.fn() }));

beforeEach(resetDb);

describe('categorías', () => {
  it('crea, rechaza duplicados (409) y edita el presupuesto', async () => {
    const { agent } = await registerUser();
    const created = await agent.post('/api/categories').send({ name: 'Gimnasio', monthlyBudget: 40 }).expect(201);
    expect(created.body.category).toMatchObject({ name: 'Gimnasio', monthlyBudgetCents: 4000, isFallback: false });

    const dup = await agent.post('/api/categories').send({ name: 'Gimnasio' }).expect(409);
    expect(dup.body.error.code).toBe('CONFLICT');

    const upd = await agent
      .patch(`/api/categories/${created.body.category.id}`)
      .send({ monthlyBudget: null, color: '#123456' })
      .expect(200);
    expect(upd.body.category).toMatchObject({ monthlyBudgetCents: null, color: '#123456' });
  });

  it('al borrar una categoría sus gastos pasan a Otros; Otros no se puede borrar ni renombrar', async () => {
    const { agent, categories } = await registerUser();
    for (const description of ['Peli', 'Concierto']) {
      await agent
        .post('/api/expenses')
        .send({ amount: 10, description, date: '2026-02-01', categoryId: categories.Ocio.id })
        .expect(201);
    }
    const del = await agent.delete(`/api/categories/${categories.Ocio.id}`).expect(200);
    expect(del.body).toMatchObject({ reassignedExpenses: 2, reassignedTo: categories.Otros.id });

    const left = await prisma.expense.findMany({ where: { categoryId: categories.Otros.id } });
    expect(left).toHaveLength(2);

    await agent.delete(`/api/categories/${categories.Otros.id}`).expect(400);
    await agent.patch(`/api/categories/${categories.Otros.id}`).send({ name: 'Varios' }).expect(400);
    await agent.delete('/api/categories/xyz').expect(400);
  });
});

describe('estadísticas y presupuestos', () => {
  it('/api/stats devuelve totales, presupuestos, tendencia y mes anterior', async () => {
    const { agent, categories } = await registerUser();
    const month = currentMonthKey();
    const prev = shiftMonth(month, -1);
    await agent.patch(`/api/categories/${categories.Comida.id}`).send({ monthlyBudget: 100 }).expect(200);
    await agent.patch(`/api/categories/${categories.Ocio.id}`).send({ monthlyBudget: 50 }).expect(200);

    const add = (amount, date, cat) =>
      agent.post('/api/expenses').send({ amount, description: 'g', date, categoryId: cat.id }).expect(201);
    await add(85, `${month}-01`, categories.Comida); // 85 % -> warning
    await add(60, `${month}-02`, categories.Ocio); // 120 % -> exceeded
    await add(100, `${prev}-15`, categories.Comida);

    const { body } = await agent.get(`/api/stats?month=${month}`).expect(200);
    expect(body.totals).toEqual({ totalCents: 14500, count: 2, avgCents: 7250, incomeCents: 0, incomeCount: 0, balanceCents: -14500 });
    expect(body.previous).toMatchObject({ month: prev, totalCents: 10000, deltaPct: 45 });
    const byName = Object.fromEntries(body.byCategory.map((r) => [r.name, r]));
    expect(byName.Comida).toMatchObject({ budgetStatus: 'warning', budgetUsedPct: 85 });
    expect(byName.Ocio).toMatchObject({ budgetStatus: 'exceeded', budgetUsedPct: 120 });
    expect(body.budgets).toEqual({ warning: 1, exceeded: 1 });
    expect(body.trend).toHaveLength(12);
    expect(body.trend.at(-2)).toEqual({ month: prev, totalCents: 10000, incomeCents: 0 });
    expect(body.usage).toMatchObject({ plan: 'FREE', expenses: 3, limit: 5, remaining: 2 });
  });

  it('valida el parámetro month', async () => {
    const { agent } = await registerUser();
    await agent.get('/api/stats?month=2026-13').expect(400);
  });
});
