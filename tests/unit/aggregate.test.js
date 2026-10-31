import { describe, expect, it } from 'vitest';
import {
  aggregateByCategory,
  budgetStatus,
  buildStats,
  monthlyTrend,
  pctChange,
  topMerchants,
} from '../../src/modules/stats/aggregate.js';

const cats = [
  { id: 'food', name: 'Comida', color: '#f00', icon: '🍽️', monthlyBudgetCents: 10000 },
  { id: 'fun', name: 'Ocio', color: '#0f0', icon: '🎬', monthlyBudgetCents: null },
  { id: 'home', name: 'Vivienda', color: '#00f', icon: '🏠', monthlyBudgetCents: 50000 },
  { id: 'misc', name: 'Otros', color: '#999', icon: '🏷️', monthlyBudgetCents: null },
];
const e = (categoryId, amountCents, date, merchant) => ({ categoryId, amountCents, date: new Date(date), merchant });

describe('budgetStatus', () => {
  it.each([
    [0, null, 'none'],
    [7999, 10000, 'ok'],
    [8000, 10000, 'warning'],
    [10000, 10000, 'warning'],
    [10001, 10000, 'exceeded'],
    [0, 0, 'ok'],
    [1, 0, 'exceeded'],
  ])('gastado %s con presupuesto %s -> %s', (spent, budget, status) => {
    expect(budgetStatus(spent, budget)).toBe(status);
  });
});

describe('aggregateByCategory', () => {
  it('suma por categoría en una pasada, ordena y calcula el presupuesto', () => {
    const rows = aggregateByCategory(
      [e('food', 5000, '2026-03-01'), e('food', 4000, '2026-03-02'), e('fun', 1000, '2026-03-03')],
      cats,
    );
    expect(rows.map((r) => r.name)).toEqual(['Comida', 'Ocio', 'Vivienda']);
    expect(rows[0]).toMatchObject({ totalCents: 9000, count: 2, budgetStatus: 'warning', budgetUsedPct: 90, sharePct: 90 });
    expect(rows[1]).toMatchObject({ totalCents: 1000, budgetStatus: 'none', budgetUsedPct: null });
    // Vivienda tiene presupuesto pero no gastos: aparece a 0.
    expect(rows[2]).toMatchObject({ totalCents: 0, count: 0, budgetStatus: 'ok' });
    // Otros no tiene gastos ni presupuesto: no aparece.
    expect(rows.find((r) => r.name === 'Otros')).toBeUndefined();
  });

  it('no divide entre cero sin gastos', () => {
    expect(aggregateByCategory([], cats).every((r) => r.sharePct === 0)).toBe(true);
  });
});

describe('monthlyTrend', () => {
  it('rellena meses vacíos con 0 e ignora meses fuera de rango', () => {
    const trend = monthlyTrend(
      [e('food', 100, '2026-01-15'), e('food', 200, '2026-03-01'), e('food', 999, '2025-06-01')],
      ['2026-01', '2026-02', '2026-03'],
    );
    expect(trend).toEqual([
      { month: '2026-01', totalCents: 100 },
      { month: '2026-02', totalCents: 0 },
      { month: '2026-03', totalCents: 200 },
    ]);
  });
});

describe('buildStats', () => {
  it('compara con el mes anterior y cuenta presupuestos en alerta', () => {
    const stats = buildStats({
      month: '2026-03',
      categories: cats,
      expenses: [e('food', 12000, '2026-03-10'), e('fun', 3000, '2026-03-11'), e('food', 10000, '2026-02-10')],
    });
    expect(stats.totals).toEqual({ totalCents: 15000, count: 2, avgCents: 7500, incomeCents: 0, incomeCount: 0, balanceCents: -15000 });
    expect(stats.previous).toMatchObject({ month: '2026-02', totalCents: 10000, deltaPct: 50 });
    expect(stats.budgets).toEqual({ warning: 0, exceeded: 1 });
    expect(stats.trend).toHaveLength(12);
    expect(stats.trend.at(-1)).toEqual({ month: '2026-03', totalCents: 15000, incomeCents: 0 });
  });

  it('pctChange es null sin mes anterior', () => {
    expect(pctChange(100, 0)).toBeNull();
  });
});

describe('topMerchants', () => {
  it('agrupa por comercio y limita', () => {
    const top = topMerchants(
      [e('food', 100, '2026-03-01', 'Mercadona'), e('food', 300, '2026-03-02', 'Mercadona'), e('fun', 200, '2026-03-02', 'Cine')],
      1,
    );
    expect(top).toEqual([{ merchant: 'Mercadona', totalCents: 400, count: 2 }]);
  });
});
