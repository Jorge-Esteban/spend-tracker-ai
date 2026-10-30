import { Router } from 'express';
import { z } from 'zod';
import { currentMonthKey, isMonthKey, monthRange, shiftMonth } from '../../lib/dates.js';
import { prisma } from '../../lib/prisma.js';
import { getUsage } from '../usage/quota.js';
import { buildStats } from './aggregate.js';

export const monthQuery = z.object({
  month: z
    .string()
    .refine(isMonthKey, 'Formato de mes YYYY-MM')
    .optional()
    .transform((m) => m ?? currentMonthKey()),
});

export const statsRouter = Router();

statsRouter.get('/', async (req, res) => {
  const { month } = monthQuery.parse(req.query);
  const userId = req.user.id;
  const from = monthRange(shiftMonth(month, -11)).start;
  const to = monthRange(month).end;

  const [expenses, categories, usage] = await Promise.all([
    prisma.expense.findMany({
      where: { userId, date: { gte: from, lt: to } },
      select: { amountCents: true, categoryId: true, date: true },
    }),
    prisma.category.findMany({ where: { userId } }),
    getUsage(req.user),
  ]);

  res.json({ ...buildStats({ month, expenses, categories }), usage });
});
