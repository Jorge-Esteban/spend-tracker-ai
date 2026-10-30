import { env } from '../../config/env.js';
import { currentMonthKey } from '../../lib/dates.js';
import { forbidden } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';

// Límites por plan. null = ilimitado.
export function planLimits(plan) {
  return plan === 'PRO'
    ? { monthlyExpenses: null, proInsights: true }
    : { monthlyExpenses: env.FREE_MONTHLY_EXPENSES, proInsights: false };
}

async function ensureCounter(userId, period) {
  return prisma.usageCounter.upsert({
    where: { userId_period: { userId, period } },
    update: {},
    create: { userId, period },
  });
}

export async function getUsage(user, period = currentMonthKey()) {
  const counter = await ensureCounter(user.id, period);
  const { monthlyExpenses } = planLimits(user.plan);
  return {
    period,
    plan: user.plan,
    expenses: counter.expenses,
    limit: monthlyExpenses,
    remaining: monthlyExpenses === null ? null : Math.max(0, monthlyExpenses - counter.expenses),
  };
}

/** Transacciones que el usuario aún puede crear este mes (Infinity en PRO). */
export async function remainingExpenseQuota(user) {
  const { remaining } = await getUsage(user);
  return remaining === null ? Infinity : remaining;
}

/**
 * Reserva `n` transacciones de la cuota mensual de forma atómica:
 * el incremento solo se aplica si cabe dentro del límite.
 */
export async function consumeExpenseQuota(user, n = 1) {
  if (n <= 0) return;
  const period = currentMonthKey();
  await ensureCounter(user.id, period);
  const { monthlyExpenses } = planLimits(user.plan);

  const where = { userId: user.id, period };
  if (monthlyExpenses !== null) where.expenses = { lte: monthlyExpenses - n };

  const { count } = await prisma.usageCounter.updateMany({ where, data: { expenses: { increment: n } } });
  if (count === 0) {
    throw forbidden(
      `Has alcanzado el límite de ${monthlyExpenses} transacciones al mes del plan FREE`,
      'QUOTA_EXCEEDED',
    );
  }
}

export async function trackInsightCall(userId) {
  const period = currentMonthKey();
  await ensureCounter(userId, period);
  await prisma.usageCounter.update({
    where: { userId_period: { userId, period } },
    data: { aiInsights: { increment: 1 } },
  });
}
