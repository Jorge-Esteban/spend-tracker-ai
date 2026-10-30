import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma, registerUser, resetDb, today } from '../helpers.js';

const FREE_RESULT = { summary: 'Gastas sobre todo en comida.', patterns: [{ title: 'Comida', detail: '60 %' }], alerts: [] };
const PRO_RESULT = {
  ...FREE_RESULT,
  prediction: { nextMonthTotal: 123.45, confidence: 'media', rationale: 'Tendencia estable' },
  recommendations: [{ title: 'Cocina más', detail: 'Menos delivery', estimatedMonthlySavings: 40 }],
};

vi.mock('../../src/modules/ai/claude.js', () => ({
  categorizeBatch: vi.fn(async () => new Map()),
  generateInsights: vi.fn(async (_input, pro) => ({ data: pro ? PRO_RESULT : FREE_RESULT, model: 'claude-test' })),
}));
const { generateInsights } = await import('../../src/modules/ai/claude.js');

beforeEach(async () => {
  await resetDb();
  vi.clearAllMocks();
});

const addExpense = (u, n = 1) =>
  u.agent.post('/api/expenses').send({ amount: n, description: `g${n}`, date: today(), categoryId: u.categories.Comida.id });

describe('cuota FREE', () => {
  it('bloquea a partir del límite mensual (5 en test) con 403 QUOTA_EXCEEDED', async () => {
    const u = await registerUser();
    for (let i = 1; i <= 5; i += 1) await addExpense(u, i).expect(201);
    const res = await addExpense(u, 6).expect(403);
    expect(res.body.error.code).toBe('QUOTA_EXCEEDED');
    expect(await prisma.expense.count({ where: { userId: u.user.id } })).toBe(5);

    const usage = await u.agent.get('/api/usage').expect(200);
    expect(usage.body).toMatchObject({ expenses: 5, limit: 5, remaining: 0 });
  });

  it('PRO no tiene límite', async () => {
    const u = await registerUser();
    await prisma.user.update({ where: { id: u.user.id }, data: { plan: 'PRO' } });
    for (let i = 1; i <= 6; i += 1) await addExpense(u, i).expect(201);
    expect((await u.agent.get('/api/usage').expect(200)).body).toMatchObject({ limit: null, remaining: null });
  });
});

describe('insights IA', () => {
  it('sin datos -> 400 NO_DATA y no llama a Claude', async () => {
    const u = await registerUser();
    const res = await u.agent.get('/api/insights').expect(400);
    expect(res.body.error.code).toBe('NO_DATA');
    expect(generateInsights).not.toHaveBeenCalled();
  });

  it('FREE: resumen y patrones, cacheado 24 h; stale al cambiar datos; refresh solo si cambió algo', async () => {
    const u = await registerUser();
    await addExpense(u, 10).expect(201);

    const first = await u.agent.get('/api/insights').expect(200);
    expect(first.body).toMatchObject({ cached: false, stale: false });
    expect(first.body.insights.summary).toBe(FREE_RESULT.summary);
    expect(first.body.insights.prediction).toBeUndefined();
    expect(generateInsights).toHaveBeenCalledTimes(1);
    expect(generateInsights.mock.calls[0][1]).toBe(false);

    const second = await u.agent.get('/api/insights').expect(200);
    expect(second.body.cached).toBe(true);
    expect(generateInsights).toHaveBeenCalledTimes(1);

    // Refrescar sin cambios no gasta otra llamada.
    await u.agent.post('/api/insights/refresh').expect(200);
    expect(generateInsights).toHaveBeenCalledTimes(1);

    await addExpense(u, 20).expect(201);
    const stale = await u.agent.get('/api/insights').expect(200);
    expect(stale.body).toMatchObject({ cached: true, stale: true });

    const refreshed = await u.agent.post('/api/insights/refresh').expect(200);
    expect(refreshed.body).toMatchObject({ cached: false, stale: false });
    expect(generateInsights).toHaveBeenCalledTimes(2);

    const usage = await prisma.usageCounter.findFirst({ where: { userId: u.user.id } });
    expect(usage.aiInsights).toBe(2);
  });

  it('PRO: incluye predicción y recomendaciones en céntimos', async () => {
    const u = await registerUser();
    await prisma.user.update({ where: { id: u.user.id }, data: { plan: 'PRO' } });
    await addExpense(u, 10).expect(201);
    const { body } = await u.agent.get('/api/insights').expect(200);
    expect(generateInsights.mock.calls[0][1]).toBe(true);
    expect(body.insights.prediction).toEqual({ nextMonthTotalCents: 12345, confidence: 'media', rationale: 'Tendencia estable' });
    expect(body.insights.recommendations[0].estimatedMonthlySavingsCents).toBe(4000);
  });

  it('si el usuario pasa de FREE a PRO, el insight FREE en caché no se reutiliza', async () => {
    const u = await registerUser();
    await addExpense(u, 10).expect(201);
    await u.agent.get('/api/insights').expect(200);
    await prisma.user.update({ where: { id: u.user.id }, data: { plan: 'PRO' } });
    const { body } = await u.agent.get('/api/insights').expect(200);
    expect(body.insights.prediction).toBeDefined();
    expect(generateInsights).toHaveBeenCalledTimes(2);
  });
});
