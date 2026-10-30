// Funciones puras de agregación (sin BD): fáciles de testear y O(n).
import { lastMonths, monthKey, shiftMonth } from '../../lib/dates.js';

export const WARNING_THRESHOLD = 0.8;

/** Estado de un presupuesto: none | ok | warning (>=80 %) | exceeded (>100 %). */
export function budgetStatus(spentCents, budgetCents) {
  if (budgetCents === null || budgetCents === undefined) return 'none';
  if (budgetCents === 0) return spentCents > 0 ? 'exceeded' : 'ok';
  if (spentCents > budgetCents) return 'exceeded';
  if (spentCents >= budgetCents * WARNING_THRESHOLD) return 'warning';
  return 'ok';
}

export function summarize(expenses) {
  let totalCents = 0;
  for (const e of expenses) totalCents += e.amountCents;
  const count = expenses.length;
  return { totalCents, count, avgCents: count ? Math.round(totalCents / count) : 0 };
}

/**
 * Agrupa gastos por categoría en una sola pasada e incluye el estado del presupuesto.
 * Las categorías sin gastos aparecen con 0 si tienen presupuesto (para verlas en Presupuestos).
 */
export function aggregateByCategory(expenses, categories) {
  const totals = new Map();
  for (const e of expenses) {
    const t = totals.get(e.categoryId) ?? { totalCents: 0, count: 0 };
    t.totalCents += e.amountCents;
    t.count += 1;
    totals.set(e.categoryId, t);
  }

  const grandTotal = expenses.reduce((s, e) => s + e.amountCents, 0);
  const rows = [];
  for (const c of categories) {
    const t = totals.get(c.id);
    const budgetCents = c.monthlyBudgetCents ?? null;
    if (!t && budgetCents === null) continue;
    const totalCents = t?.totalCents ?? 0;
    rows.push({
      categoryId: c.id,
      name: c.name,
      color: c.color,
      icon: c.icon,
      totalCents,
      count: t?.count ?? 0,
      sharePct: grandTotal ? Math.round((totalCents / grandTotal) * 1000) / 10 : 0,
      budgetCents,
      budgetUsedPct: budgetCents ? Math.round((totalCents / budgetCents) * 1000) / 10 : null,
      budgetStatus: budgetStatus(totalCents, budgetCents),
    });
  }
  return rows.sort((a, b) => b.totalCents - a.totalCents || a.name.localeCompare(b.name));
}

/** Total por mes para los meses indicados (los meses sin gastos salen a 0). */
export function monthlyTrend(expenses, months) {
  const byMonth = new Map(months.map((m) => [m, 0]));
  for (const e of expenses) {
    const key = monthKey(e.date);
    if (byMonth.has(key)) byMonth.set(key, byMonth.get(key) + e.amountCents);
  }
  return months.map((month) => ({ month, totalCents: byMonth.get(month) }));
}

export function pctChange(current, previous) {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/** Construye la respuesta de /api/stats a partir de 12 meses de gastos. */
export function buildStats({ month, expenses, categories, trendMonths = 12 }) {
  const prevMonth = shiftMonth(month, -1);
  const current = expenses.filter((e) => monthKey(e.date) === month);
  const previous = expenses.filter((e) => monthKey(e.date) === prevMonth);
  const totals = summarize(current);
  const prevTotals = summarize(previous);
  const byCategory = aggregateByCategory(current, categories);

  return {
    month,
    totals,
    previous: {
      month: prevMonth,
      ...prevTotals,
      deltaPct: pctChange(totals.totalCents, prevTotals.totalCents),
    },
    byCategory,
    budgets: {
      warning: byCategory.filter((r) => r.budgetStatus === 'warning').length,
      exceeded: byCategory.filter((r) => r.budgetStatus === 'exceeded').length,
    },
    trend: monthlyTrend(expenses, lastMonths(month, trendMonths)),
  };
}

/** Top comercios por gasto (para el resumen que se envía a la IA). */
export function topMerchants(expenses, limit = 8) {
  const map = new Map();
  for (const e of expenses) {
    const name = (e.merchant || e.description || '').trim();
    if (!name) continue;
    const m = map.get(name) ?? { merchant: name, totalCents: 0, count: 0 };
    m.totalCents += e.amountCents;
    m.count += 1;
    map.set(name, m);
  }
  return [...map.values()].sort((a, b) => b.totalCents - a.totalCents).slice(0, limit);
}
