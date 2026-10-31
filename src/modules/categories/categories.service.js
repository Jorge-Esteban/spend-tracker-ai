import { badRequest, notFound } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { DEFAULT_CATEGORIES, FALLBACK_NAMES } from './defaults.js';

/** Categoría de reserva del tipo pedido, creándola si faltara (usuarios anteriores). */
export async function getFallbackCategory(userId, kind = 'EXPENSE') {
  const existing = await prisma.category.findFirst({ where: { userId, isFallback: true, kind } });
  if (existing) return existing;
  const { isFallback: _f, ...def } = DEFAULT_CATEGORIES.find((c) => c.isFallback && (c.kind ?? 'EXPENSE') === kind);
  return prisma.category.upsert({
    where: { userId_name: { userId, name: FALLBACK_NAMES[kind] } },
    update: { isFallback: true, kind },
    create: { ...def, kind, isFallback: true, userId },
  });
}

/** Garantiza que la categoría existe, es del usuario y (si se indica) del tipo correcto. */
export async function assertOwnCategory(userId, categoryId, kind = undefined) {
  const cat = await prisma.category.findFirst({ where: { id: categoryId, userId } });
  if (!cat) throw notFound('Categoría no encontrada');
  if (kind && cat.kind !== kind) {
    throw badRequest(
      kind === 'INCOME' ? 'Elige una categoría de ingresos' : 'Elige una categoría de gastos',
      'CATEGORY_KIND_MISMATCH',
    );
  }
  return cat;
}
