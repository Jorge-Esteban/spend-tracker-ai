import { createHash } from 'node:crypto';
import { env } from '../../config/env.js';
import { currentMonthKey, lastMonths, monthKey, monthRange, shiftMonth } from '../../lib/dates.js';
import { badRequest } from '../../lib/errors.js';
import { centsToDecimal, toCents } from '../../lib/money.js';
import { prisma } from '../../lib/prisma.js';
import { aggregateByCategory, monthlyTrend, onlyKind, topMerchants } from '../stats/aggregate.js';
import { planLimits, trackInsightCall } from '../usage/quota.js';
import { generateInsights } from './claude.js';

export const INSIGHT_TTL_MS = 24 * 60 * 60 * 1000;
const euros = (cents) => Number(centsToDecimal(cents));

/**
 * Resumen agregado que se envía a Claude (función pura).
 * Solo cifras agregadas: ni ids, ni emails, ni movimientos individuales.
 */
export function buildInsightInput({ month, expenses, categories }) {
  const spending = onlyKind(expenses, 'EXPENSE');
  const income = onlyKind(expenses, 'INCOME');
  const inMonth = (rows) => rows.filter((e) => monthKey(e.date) === month);
  const last3 = new Set(lastMonths(month, 3));
  const months = lastMonths(month, 6);
  const incomeTrend = monthlyTrend(income, months);
  return {
    currency: 'EUR',
    month,
    // Por mes: gastos, ingresos y balance (ingresos - gastos).
    monthlyTotals: monthlyTrend(spending, months).map((m, i) => ({
      month: m.month,
      spent: euros(m.totalCents),
      income: euros(incomeTrend[i].totalCents),
      balance: euros(incomeTrend[i].totalCents - m.totalCents),
    })),
    currentMonthByCategory: aggregateByCategory(inMonth(spending), onlyKind(categories, 'EXPENSE')).map((r) => ({
      category: r.name,
      total: euros(r.totalCents),
      transactions: r.count,
      budget: r.budgetCents === null ? null : euros(r.budgetCents),
      budgetStatus: r.budgetStatus,
    })),
    currentMonthIncomeByCategory: aggregateByCategory(inMonth(income), onlyKind(categories, 'INCOME')).map((r) => ({
      category: r.name,
      total: euros(r.totalCents),
    })),
    topMerchantsLast3Months: topMerchants(spending.filter((e) => last3.has(monthKey(e.date)))).map((m) => ({
      merchant: m.merchant.slice(0, 40),
      total: euros(m.totalCents),
      transactions: m.count,
    })),
    transactionCount: expenses.length,
  };
}

export const hashInput = (input, pro) =>
  createHash('sha256')
    .update(JSON.stringify({ input, pro }))
    .digest('hex');

/** Convierte los importes en euros que devuelve la IA a céntimos para la API. */
function toApiPayload(data) {
  const out = { ...data };
  if (data.prediction) {
    const { nextMonthTotal, ...rest } = data.prediction;
    out.prediction = { ...rest, nextMonthTotalCents: toCents(nextMonthTotal) };
  }
  if (data.recommendations) {
    out.recommendations = data.recommendations.map(({ estimatedMonthlySavings, ...r }) => ({
      ...r,
      estimatedMonthlySavingsCents: toCents(estimatedMonthlySavings),
    }));
  }
  return out;
}

export async function markInsightsStale(userId) {
  await prisma.aiInsight.updateMany({ where: { userId, stale: false }, data: { stale: true } });
}

const present = (row, cached) => ({
  insights: row.payload,
  generatedAt: row.updatedAt,
  expiresAt: row.expiresAt,
  stale: row.stale,
  cached,
  model: row.model,
});

/** Devuelve el insight en caché si sigue vigente para este usuario y plan. */
export async function getCachedInsight(user) {
  const row = await prisma.aiInsight.findUnique({
    where: { userId_kind: { userId: user.id, kind: 'INSIGHTS' } },
  });
  if (!row || row.expiresAt <= new Date()) return null;
  // Si el usuario sube a PRO, el insight FREE ya no basta.
  if (planLimits(user.plan).proInsights && !row.payload?.prediction) return null;
  return present(row, true);
}

/**
 * Una única llamada de insights por usuario, cacheada 24 h.
 * Con force=true se regenera, salvo que los datos no hayan cambiado (mismo hash).
 */
export async function getOrCreateInsight(user, { force = false } = {}) {
  const cached = await getCachedInsight(user);
  if (cached && !force) return cached;

  const month = currentMonthKey();
  const from = monthRange(shiftMonth(month, -5)).start;
  const to = monthRange(month).end;
  const [expenses, categories] = await Promise.all([
    prisma.expense.findMany({
      where: { userId: user.id, date: { gte: from, lt: to } },
      select: { amountCents: true, categoryId: true, date: true, merchant: true, description: true, kind: true },
    }),
    prisma.category.findMany({ where: { userId: user.id } }),
  ]);
  if (expenses.length === 0) throw badRequest('Añade algunos movimientos antes de pedir un análisis', 'NO_DATA');

  const pro = planLimits(user.plan).proInsights;
  const input = buildInsightInput({ month, expenses, categories });
  const dataHash = hashInput(input, pro);

  if (cached && force) {
    const row = await prisma.aiInsight.findUnique({
      where: { userId_kind: { userId: user.id, kind: 'INSIGHTS' } },
    });
    if (row?.dataHash === dataHash) {
      // Nada ha cambiado: no se gasta otra llamada.
      const fresh = await prisma.aiInsight.update({ where: { id: row.id }, data: { stale: false } });
      return present(fresh, true);
    }
  }

  const { data, model } = await generateInsights(input, pro);
  await trackInsightCall(user.id);

  const fields = {
    dataHash,
    payload: toApiPayload(data),
    model: model ?? env.CLAUDE_MODEL_INSIGHTS,
    stale: false,
    expiresAt: new Date(Date.now() + INSIGHT_TTL_MS),
  };
  const row = await prisma.aiInsight.upsert({
    where: { userId_kind: { userId: user.id, kind: 'INSIGHTS' } },
    update: fields,
    create: { ...fields, userId: user.id, kind: 'INSIGHTS' },
  });
  return present(row, false);
}
