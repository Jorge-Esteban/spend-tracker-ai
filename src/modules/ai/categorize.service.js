import { aiEnabled } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import { centsToDecimal } from '../../lib/money.js';
import { prisma } from '../../lib/prisma.js';
import { getFallbackCategory } from '../categories/categories.service.js';
import { categorizeBatch } from './claude.js';
import { merchantKeyFor } from './merchant.js';

const AI_BATCH_SIZE = 100;

/**
 * Asigna categoría a una lista de gastos sin categoría.
 * Orden: regla de comercio aprendida -> Claude en lotes -> "Otros".
 * @param {string} userId
 * @param {{ description: string, merchant?: string|null, amountCents: number }[]} items
 * @returns {Promise<{ categoryId: string, categorizedBy: 'RULE'|'AI'|'FALLBACK' }[]>}
 */
export async function categorizeExpenses(userId, items) {
  if (items.length === 0) return [];

  const fallback = await getFallbackCategory(userId);
  const [categories, rules] = await Promise.all([
    prisma.category.findMany({ where: { userId }, select: { id: true, name: true, isFallback: true } }),
    prisma.merchantRule.findMany({ where: { userId }, select: { merchantKey: true, categoryId: true } }),
  ]);
  const ruleByKey = new Map(rules.map((r) => [r.merchantKey, r.categoryId]));

  const result = items.map((item) => {
    const ruleCategory = ruleByKey.get(merchantKeyFor(item));
    return ruleCategory
      ? { categoryId: ruleCategory, categorizedBy: 'RULE' }
      : { categoryId: fallback.id, categorizedBy: 'FALLBACK' };
  });

  const pending = result.map((r, i) => (r.categorizedBy === 'FALLBACK' ? i : -1)).filter((i) => i >= 0);
  if (!aiEnabled || pending.length === 0) return result;

  // "Otros" va al final para que el prompt lo use como comodín.
  const names = [...categories.filter((c) => !c.isFallback).map((c) => c.name), fallback.name];
  const idByName = new Map(categories.map((c) => [c.name, c.id]));

  for (let start = 0; start < pending.length; start += AI_BATCH_SIZE) {
    const chunk = pending.slice(start, start + AI_BATCH_SIZE);
    const payload = chunk.map((idx) => ({
      i: idx,
      text: [items[idx].merchant, items[idx].description].filter(Boolean).join(' · ').slice(0, 160),
      amount: centsToDecimal(items[idx].amountCents),
    }));
    try {
      const answers = await categorizeBatch(payload, names);
      for (const idx of chunk) {
        const categoryId = idByName.get(answers.get(idx));
        if (categoryId && categoryId !== fallback.id) result[idx] = { categoryId, categorizedBy: 'AI' };
      }
    } catch (err) {
      // La categorización nunca bloquea el alta del gasto: se queda en "Otros".
      logger.warn({ err: err.message, count: chunk.length }, 'Categorización IA fallida; se usa Otros');
    }
  }
  return result;
}

/** Aprende (o actualiza) la regla de comercio cuando el usuario corrige una categoría. */
export async function learnMerchantRule(userId, expense, categoryId) {
  const merchantKey = merchantKeyFor(expense);
  if (!merchantKey) return;
  await prisma.merchantRule.upsert({
    where: { userId_merchantKey: { userId, merchantKey } },
    update: { categoryId },
    create: { userId, merchantKey, categoryId },
  });
}
