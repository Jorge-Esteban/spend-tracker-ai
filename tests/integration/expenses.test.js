import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma, registerUser, resetDb, today } from '../helpers.js';

// Claude simulado: clasifica por palabras clave; nunca sale a la red.
vi.mock('../../src/modules/ai/claude.js', () => ({
  categorizeBatch: vi.fn(async (items) => {
    const map = new Map();
    for (const it of items) map.set(it.i, /taxi|metro/i.test(it.text) ? 'Transporte' : 'Otros');
    return map;
  }),
  generateInsights: vi.fn(),
}));
const { categorizeBatch } = await import('../../src/modules/ai/claude.js');

beforeEach(async () => {
  await resetDb();
  vi.clearAllMocks();
});

describe('gastos', () => {
  it('crea un gasto con categoría del usuario y lo guarda en céntimos', async () => {
    const { agent, categories } = await registerUser();
    const res = await agent
      .post('/api/expenses')
      .send({ amount: '23,45', description: 'Cena', date: today(), categoryId: categories.Comida.id })
      .expect(201);
    expect(res.body.expense).toMatchObject({ amountCents: 2345, categorizedBy: 'USER', source: 'MANUAL' });
    expect(res.body.expense.category.name).toBe('Comida');
    expect(categorizeBatch).not.toHaveBeenCalled();
  });

  it('sin categoría: IA -> y si la IA no sabe, Otros', async () => {
    const { agent } = await registerUser();
    const taxi = await agent
      .post('/api/expenses')
      .send({ amount: 12, description: 'Taxi al aeropuerto', date: today() })
      .expect(201);
    expect(taxi.body.expense).toMatchObject({ categorizedBy: 'AI' });
    expect(taxi.body.expense.category.name).toBe('Transporte');

    const raro = await agent.post('/api/expenses').send({ amount: 3, description: 'Cosa rara', date: today() }).expect(201);
    expect(raro.body.expense).toMatchObject({ categorizedBy: 'FALLBACK' });
    expect(raro.body.expense.category.name).toBe('Otros');
  });

  it('si Claude falla, el gasto se crea igualmente en Otros', async () => {
    categorizeBatch.mockRejectedValueOnce(new Error('caída'));
    const { agent } = await registerUser();
    const res = await agent.post('/api/expenses').send({ amount: 5, description: 'Taxi', date: today() }).expect(201);
    expect(res.body.expense.categorizedBy).toBe('FALLBACK');
  });

  it('al corregir la categoría aprende una regla y la aplica sin llamar a la IA', async () => {
    const { agent, categories } = await registerUser();
    const first = await agent
      .post('/api/expenses')
      .send({ amount: 30, description: 'Compra', merchant: 'GIMNASIO FIT 0042', date: today() })
      .expect(201);
    await agent.patch(`/api/expenses/${first.body.expense.id}`).send({ categoryId: categories.Salud.id }).expect(200);

    categorizeBatch.mockClear();
    const second = await agent
      .post('/api/expenses')
      .send({ amount: 30, description: 'Cuota', merchant: 'Gimnasio Fit 0043', date: today() })
      .expect(201);
    expect(second.body.expense).toMatchObject({ categorizedBy: 'RULE' });
    expect(second.body.expense.category.name).toBe('Salud');
    expect(categorizeBatch).not.toHaveBeenCalled();
  });

  it('valida importes, fechas e ids', async () => {
    const { agent } = await registerUser();
    for (const amount of ['NaN', 'abc', -3, 0]) {
      const res = await agent.post('/api/expenses').send({ amount, description: 'x', date: today() }).expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
    await agent.post('/api/expenses').send({ amount: 1, description: 'x', date: 'ayer' }).expect(400);
    await agent.get('/api/expenses/no-es-un-id').expect(400);
    await agent.get('/api/expenses/0123456789abcdef01234567').expect(404);
    await agent.patch('/api/expenses/0123456789abcdef01234567').send({ amount: 1 }).expect(404);
  });

  it('lista ordenada por fecha desc, filtra por mes y busca por texto', async () => {
    const { agent, categories } = await registerUser();
    const add = (description, date) =>
      agent.post('/api/expenses').send({ amount: 1, description, date, categoryId: categories.Ocio.id }).expect(201);
    await add('Antiguo', '2026-01-10');
    await add('Reciente', '2026-02-20');
    await add('Medio', '2026-02-05');

    const all = await agent.get('/api/expenses').expect(200);
    expect(all.body.items.map((e) => e.description)).toEqual(['Reciente', 'Medio', 'Antiguo']);
    expect(all.body.total).toBe(3);

    const feb = await agent.get('/api/expenses?month=2026-02').expect(200);
    expect(feb.body.items).toHaveLength(2);

    const q = await agent.get('/api/expenses?q=recien').expect(200);
    expect(q.body.items.map((e) => e.description)).toEqual(['Reciente']);
  });

  it('borra y exporta CSV del mes', async () => {
    const { agent, categories } = await registerUser();
    const a = await agent
      .post('/api/expenses')
      .send({ amount: '9,99', description: 'Libro', date: '2026-02-01', categoryId: categories.Ocio.id })
      .expect(201);
    await agent
      .post('/api/expenses')
      .send({ amount: 1, description: 'Borrar', date: '2026-02-02', categoryId: categories.Ocio.id })
      .then((r) => agent.delete(`/api/expenses/${r.body.expense.id}`).expect(204));

    const csv = await agent.get('/api/expenses/export.csv?month=2026-02').expect(200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.headers['content-disposition']).toContain('gastos-2026-02.csv');
    expect(csv.text).toContain('2026-02-01;Libro;;Ocio;9,99;EUR;manual');
    expect(csv.text).not.toContain('Borrar');
    expect(await prisma.expense.count({ where: { id: a.body.expense.id } })).toBe(1);
  });
});
