import { Router } from 'express';
import { monthRange } from '../../lib/dates.js';
import { notFound } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { idParams } from '../../middleware/validate.js';
import { categorizeExpenses, learnMerchantRule } from '../ai/categorize.service.js';
import { markInsightsStale } from '../ai/insights.service.js';
import { assertOwnCategory, getFallbackCategory } from '../categories/categories.service.js';
import { monthQuery } from '../stats/stats.routes.js';
import { consumeExpenseQuota } from '../usage/quota.js';
import { toCsv } from './csv.js';
import { createExpenseSchema, listExpensesQuery, updateExpenseSchema } from './expenses.schemas.js';

const withCategory = { category: { select: { id: true, name: true, color: true, icon: true } } };

async function findOwnExpense(userId, id) {
  const expense = await prisma.expense.findFirst({ where: { id, userId } });
  if (!expense) throw notFound('Gasto no encontrado');
  return expense;
}

export const expensesRouter = Router();

expensesRouter.get('/', async (req, res) => {
  const { month, categoryId, kind, q, page, pageSize } = listExpensesQuery.parse(req.query);
  const where = { userId: req.user.id };
  if (month) {
    const { start, end } = monthRange(month);
    where.date = { gte: start, lt: end };
  }
  if (categoryId) where.categoryId = categoryId;
  if (kind) where.kind = kind;
  if (q) {
    where.OR = [
      { description: { contains: q, mode: 'insensitive' } },
      { merchant: { contains: q, mode: 'insensitive' } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.expense.findMany({
      where,
      include: withCategory,
      // Más reciente primero; a igual fecha, el último creado arriba.
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.expense.count({ where }),
  ]);
  res.json({ items, page, pageSize, total });
});

expensesRouter.get('/export.csv', async (req, res) => {
  const { month } = monthQuery.parse(req.query);
  const { start, end } = monthRange(month);
  const expenses = await prisma.expense.findMany({
    where: { userId: req.user.id, date: { gte: start, lt: end } },
    include: withCategory,
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
  });
  res
    .type('text/csv; charset=utf-8')
    .attachment(`movimientos-${month}.csv`)
    .send(toCsv(expenses));
});

expensesRouter.get('/:id', async (req, res) => {
  const { id } = idParams.parse(req.params);
  await findOwnExpense(req.user.id, id);
  const expense = await prisma.expense.findUnique({ where: { id }, include: withCategory });
  res.json({ expense });
});

expensesRouter.post('/', async (req, res) => {
  const { amount, categoryId, ...body } = createExpenseSchema.parse(req.body);
  const userId = req.user.id;

  let category;
  if (categoryId) {
    await assertOwnCategory(userId, categoryId, body.kind);
    category = { categoryId, categorizedBy: 'USER' };
  } else {
    [category] = await categorizeExpenses(userId, [{ ...body, amountCents: amount }]);
  }

  await consumeExpenseQuota(req.user, 1);
  const expense = await prisma.expense.create({
    data: { ...body, amountCents: amount, userId, source: 'MANUAL', ...category },
    include: withCategory,
  });
  await markInsightsStale(userId);
  res.status(201).json({ expense });
});

expensesRouter.patch('/:id', async (req, res) => {
  const { id } = idParams.parse(req.params);
  const { amount, categoryId, ...body } = updateExpenseSchema.parse(req.body);
  const userId = req.user.id;
  const current = await findOwnExpense(userId, id);

  const data = { ...body };
  if (amount !== undefined) data.amountCents = amount;
  const kind = body.kind ?? current.kind;
  if (categoryId && categoryId !== current.categoryId) {
    await assertOwnCategory(userId, categoryId, kind);
    data.categoryId = categoryId;
    data.categorizedBy = 'USER';
    // Corrección del usuario -> regla para el futuro.
    await learnMerchantRule(userId, { ...current, ...body }, categoryId);
  } else if (kind !== current.kind) {
    // Cambia de gasto a ingreso (o al revés) sin nueva categoría: va a la reserva del nuevo tipo.
    const target = categoryId ? await assertOwnCategory(userId, categoryId, kind) : await getFallbackCategory(userId, kind);
    data.categoryId = target.id;
    data.categorizedBy = categoryId ? 'USER' : 'FALLBACK';
  }

  const expense = await prisma.expense.update({ where: { id }, data, include: withCategory });
  await markInsightsStale(userId);
  res.json({ expense });
});

expensesRouter.delete('/:id', async (req, res) => {
  const { id } = idParams.parse(req.params);
  await findOwnExpense(req.user.id, id);
  await prisma.expense.delete({ where: { id } });
  await markInsightsStale(req.user.id);
  res.status(204).end();
});
