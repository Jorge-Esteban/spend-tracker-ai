import { Router } from 'express';
import { badRequest } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { idParams } from '../../middleware/validate.js';
import { markInsightsStale } from '../ai/insights.service.js';
import { createCategorySchema, updateCategorySchema } from './categories.schemas.js';
import { assertOwnCategory, getFallbackCategory } from './categories.service.js';

export const categoriesRouter = Router();

const toData = ({ monthlyBudget, ...rest }) => ({
  ...rest,
  ...(monthlyBudget !== undefined ? { monthlyBudgetCents: monthlyBudget } : {}),
});

categoriesRouter.get('/', async (req, res) => {
  const categories = await prisma.category.findMany({
    where: { userId: req.user.id },
    orderBy: [{ isFallback: 'asc' }, { name: 'asc' }],
  });
  res.json({ categories });
});

categoriesRouter.post('/', async (req, res) => {
  const body = createCategorySchema.parse(req.body);
  const category = await prisma.category.create({ data: { ...toData(body), userId: req.user.id } });
  res.status(201).json({ category });
});

categoriesRouter.patch('/:id', async (req, res) => {
  const { id } = idParams.parse(req.params);
  const body = updateCategorySchema.parse(req.body);
  const current = await assertOwnCategory(req.user.id, id);
  if (current.isFallback && body.name && body.name !== current.name) {
    throw badRequest('La categoría de reserva no se puede renombrar', 'FALLBACK_LOCKED');
  }
  const category = await prisma.category.update({ where: { id }, data: toData(body) });
  await markInsightsStale(req.user.id);
  res.json({ category });
});

// Borrar una categoría reasigna sus gastos a "Otros" y elimina sus reglas de comercio.
categoriesRouter.delete('/:id', async (req, res) => {
  const { id } = idParams.parse(req.params);
  const userId = req.user.id;
  const category = await assertOwnCategory(userId, id);
  if (category.isFallback) throw badRequest('La categoría de reserva no se puede borrar', 'FALLBACK_LOCKED');

  const fallback = await getFallbackCategory(userId);
  const [moved] = await prisma.$transaction([
    prisma.expense.updateMany({
      where: { userId, categoryId: id },
      data: { categoryId: fallback.id, categorizedBy: 'FALLBACK' },
    }),
    prisma.merchantRule.deleteMany({ where: { userId, categoryId: id } }),
    prisma.category.delete({ where: { id } }),
  ]);
  await markInsightsStale(userId);
  res.json({ deleted: id, reassignedExpenses: moved.count, reassignedTo: fallback.id });
});
