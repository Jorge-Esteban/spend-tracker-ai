import { aiEnabled } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import { centsToDecimal } from '../../lib/money.js';
import { prisma } from '../../lib/prisma.js';
import { getFallbackCategory } from '../categories/categories.service.js';
import { categorizeBatch } from './claude.js';
import { merchantKeyFor } from './merchant.js';

const AI_BATCH_SIZE = 100;
const KINDS = ['EXPENSE', 'INCOME'];

/**
 * Asigna categoría a una lista de movimientos sin categoría.
 * Orden: regla de comercio aprendida -> Claude en lotes -> reserva del tipo.
 * Un gasto solo recibe categorías de gasto y un ingreso, de ingreso.
 * @param {string} userId
 * @param {{ kind?: 'EXPENSE'|'INCOME', description: string, merchant?: string|null, amountCents: number }[]} items
 * @returns {Promise<{ categoryId: string, categorizedBy: 'RULE'|'AI'|'FALLBACK' }[]>}
 */
export async function categorizeExpenses(userId, items) {
  if (items.length === 0) return [];

  const kindOf = (item) => item.kind ?? 'EXPENSE';
  const fallbacks = {};
  for (const kind of new Set(items.map(kindOf))) fallbacks[kind] = await getFallbackCategory(userId, kind);

  const [categories, rules] = await Promise.all([
    prisma.category.findMany({ where: { userId }, select: { id: true, name: true, kind: true, isFallback: true } }),
    prisma.merchantRule.findMany({ where: { userId }, select: { merchantKey: true, categoryId: true } }),
  ]);
  const kindById = new Map(categories.map((c) => [c.id, c.kind]));
  const ruleByKey = new Map(rules.map((r) => [r.merchantKey, r.categoryId]));

  const result = items.map((item) => {
    const ruleCategory = ruleByKey.get(merchantKeyFor(item));
    return ruleCategory && kindById.get(ruleCategory) === kindOf(item)
      ? { categoryId: ruleCategory, categorizedBy: 'RULE' }
      : { categoryId: fallbacks[kindOf(item)].id, categorizedBy: 'FALLBACK' };
  });
  if (!aiEnabled) return result;

  for (const kind of KINDS) {
    const pending = items.flatMap((item, i) =>
      kindOf(item) === kind && result[i].categorizedBy === 'FALLBACK' ? [i] : [],
    );
    if (pending.length === 0) continue;

    const fallback = fallbacks[kind];
    const own = categories.filter((c) => c.kind === kind && !c.isFallback);
    if (own.length === 0) continue; // solo existe la reserva: no hay nada que decidir
    // La reserva va al final para que el prompt la use como comodín.
    const names = [...own.map((c) => c.name), fallback.name];
    const idByName = new Map(own.map((c) => [c.name, c.id]));

    for (let start = 0; start < pending.length; start += AI_BATCH_SIZE) {
      const chunk = pending.slice(start, start + AI_BATCH_SIZE);
      const payload = chunk.map((idx) => ({
        i: idx,
        text: [items[idx].merchant, items[idx].description].filter(Boolean).join(' · ').slice(0, 160),
        amount: centsToDecimal(items[idx].amountCents),
      }));
      try {
        const answers = await categorizeBatch(payload, names, kind);
        for (const idx of chunk) {
          const categoryId = idByName.get(answers.get(idx));
          if (categoryId) result[idx] = { categoryId, categorizedBy: 'AI' };
        }
      } catch (err) {
        // La categorización nunca bloquea el alta: el movimiento se queda en la reserva.
        logger.warn({ err: err.message, count: chunk.length, kind }, 'Categorización IA fallida; se usa la reserva');
      }
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
