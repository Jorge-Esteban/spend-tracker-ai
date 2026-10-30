import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerUser, resetDb, today } from '../helpers.js';

vi.mock('../../src/modules/ai/claude.js', () => ({ categorizeBatch: vi.fn(async () => new Map()), generateInsights: vi.fn() }));

beforeEach(resetDb);

describe('aislamiento entre usuarios', () => {
  it('B no puede ver, editar, borrar ni exportar los gastos de A', async () => {
    const a = await registerUser();
    const b = await registerUser();
    const { body } = await a.agent
      .post('/api/expenses')
      .send({ amount: 50, description: 'Secreto de A', date: today(), categoryId: a.categories.Comida.id })
      .expect(201);
    const id = body.expense.id;

    expect((await b.agent.get('/api/expenses').expect(200)).body.items).toEqual([]);
    await b.agent.get(`/api/expenses/${id}`).expect(404);
    await b.agent.patch(`/api/expenses/${id}`).send({ amount: 1 }).expect(404);
    await b.agent.delete(`/api/expenses/${id}`).expect(404);
    const csv = await b.agent.get('/api/expenses/export.csv').expect(200);
    expect(csv.text).not.toContain('Secreto de A');

    const statsB = await b.agent.get('/api/stats').expect(200);
    expect(statsB.body.totals.totalCents).toBe(0);
    const statsA = await a.agent.get('/api/stats').expect(200);
    expect(statsA.body.totals.totalCents).toBe(5000);
  });

  it('B no puede usar ni tocar las categorías de A', async () => {
    const a = await registerUser();
    const b = await registerUser();
    const foreign = a.categories.Ocio.id;

    await b.agent.post('/api/expenses').send({ amount: 1, description: 'x', date: today(), categoryId: foreign }).expect(404);
    await b.agent.patch(`/api/categories/${foreign}`).send({ color: '#000000' }).expect(404);
    await b.agent.delete(`/api/categories/${foreign}`).expect(404);

    const own = await b.agent
      .post('/api/expenses')
      .send({ amount: 1, description: 'x', date: today(), categoryId: b.categories.Ocio.id })
      .expect(201);
    await b.agent.patch(`/api/expenses/${own.body.expense.id}`).send({ categoryId: foreign }).expect(404);

    const names = (await b.agent.get('/api/categories').expect(200)).body.categories.map((c) => c.id);
    expect(names).not.toContain(foreign);
  });

  it('todas las rutas privadas exigen sesión', async () => {
    const { request, app } = await import('../helpers.js');
    for (const path of ['/api/expenses', '/api/categories', '/api/stats', '/api/insights', '/api/bank/status', '/api/usage']) {
      await request(app).get(path).expect(401);
    }
  });
});
