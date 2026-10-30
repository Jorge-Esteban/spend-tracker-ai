import { describe, expect, it } from 'vitest';
import { parseEnv } from '../../src/config/env.js';
import { normalizeMerchant } from '../../src/modules/ai/merchant.js';
import { buildInsightInput, hashInput } from '../../src/modules/ai/insights.service.js';
import { registerSchema } from '../../src/modules/auth/auth.schemas.js';
import { createCategorySchema } from '../../src/modules/categories/categories.schemas.js';
import { createExpenseSchema, listExpensesQuery } from '../../src/modules/expenses/expenses.schemas.js';
import { monthQuery } from '../../src/modules/stats/stats.routes.js';

const valid = { amount: '12,50', description: ' Cena ', date: '2026-03-05' };

describe('createExpenseSchema', () => {
  it('normaliza importe a céntimos, recorta texto y fecha en UTC', () => {
    const out = createExpenseSchema.parse(valid);
    expect(out).toMatchObject({ amount: 1250, description: 'Cena', currency: 'EUR' });
    expect(out.date.toISOString()).toBe('2026-03-05T00:00:00.000Z');
  });

  it.each([['NaN'], ['abc'], [0], [-5], ['1.999'], [Number.NaN], [2_000_000]])('rechaza el importe %s', (amount) => {
    expect(createExpenseSchema.safeParse({ ...valid, amount }).success).toBe(false);
  });

  it('rechaza descripción vacía, fecha inválida y categoryId que no es ObjectId', () => {
    expect(createExpenseSchema.safeParse({ ...valid, description: '  ' }).success).toBe(false);
    expect(createExpenseSchema.safeParse({ ...valid, date: '2026-13-40' }).success).toBe(false);
    expect(createExpenseSchema.safeParse({ ...valid, categoryId: '123' }).success).toBe(false);
  });
});

describe('otros esquemas', () => {
  it('registro: email en minúsculas y contraseña mínima', () => {
    expect(registerSchema.parse({ email: ' Ana@Mail.COM ', password: '12345678' }).email).toBe('ana@mail.com');
    expect(registerSchema.safeParse({ email: 'ana@mail.com', password: 'corta' }).success).toBe(false);
  });

  it('categoría: presupuesto en euros -> céntimos y color hex', () => {
    expect(createCategorySchema.parse({ name: 'Gym', monthlyBudget: 39.9 }).monthlyBudget).toBe(3990);
    expect(createCategorySchema.safeParse({ name: 'Gym', color: 'red' }).success).toBe(false);
  });

  it('listado: paginación acotada y mes YYYY-MM', () => {
    expect(listExpensesQuery.parse({}).pageSize).toBe(50);
    expect(listExpensesQuery.safeParse({ pageSize: '500' }).success).toBe(false);
    expect(monthQuery.safeParse({ month: '2026-3' }).success).toBe(false);
    expect(monthQuery.parse({ month: '2026-03' }).month).toBe('2026-03');
  });
});

describe('parseEnv', () => {
  const base = { DATABASE_URL: 'mongodb://x/db', JWT_SECRET: 'x'.repeat(32) };

  it('aplica valores por defecto y parte CLIENT_ORIGIN', () => {
    const env = parseEnv({ ...base, CLIENT_ORIGIN: 'http://a.com, http://b.com' });
    expect(env.CLIENT_ORIGIN).toEqual(['http://a.com', 'http://b.com']);
    expect(env.CLAUDE_MODEL_INSIGHTS).toBe('claude-opus-5-5');
    expect(env.PORT).toBe(5000);
  });

  it('falla con un JWT_SECRET corto o sin DATABASE_URL', () => {
    expect(() => parseEnv({ ...base, JWT_SECRET: 'corto' })).toThrow(/JWT_SECRET/);
    expect(() => parseEnv({ JWT_SECRET: 'x'.repeat(32) })).toThrow(/DATABASE_URL/);
  });
});

describe('normalizeMerchant', () => {
  it('quita tildes, números sueltos y signos', () => {
    expect(normalizeMerchant('COMPRA TARJ. 1234 Café  Pérez, S.L.')).toBe('compra tarj cafe perez s l');
    expect(normalizeMerchant('MERCADONA 1234 Madrid')).toBe(normalizeMerchant('mercadona   madrid'));
    expect(normalizeMerchant(null)).toBe('');
  });
});

describe('buildInsightInput', () => {
  const categories = [{ id: 'c1', name: 'Comida', color: '#000', icon: 'x', monthlyBudgetCents: 1000 }];
  const expenses = [
    { categoryId: 'c1', amountCents: 1250, date: new Date('2026-03-02'), merchant: 'Bar Pepe', description: 'x' },
  ];

  it('envía solo agregados en euros, sin ids', () => {
    const input = buildInsightInput({ month: '2026-03', expenses, categories });
    expect(input.currentMonthByCategory).toEqual([
      { category: 'Comida', total: 12.5, transactions: 1, budget: 10, budgetStatus: 'exceeded' },
    ]);
    expect(JSON.stringify(input)).not.toContain('c1');
    expect(input.monthlyTotals).toHaveLength(6);
  });

  it('el hash es estable y cambia con el plan', () => {
    const input = buildInsightInput({ month: '2026-03', expenses, categories });
    expect(hashInput(input, false)).toBe(hashInput(structuredClone(input), false));
    expect(hashInput(input, false)).not.toBe(hashInput(input, true));
  });
});
