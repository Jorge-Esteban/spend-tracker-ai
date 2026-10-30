import { notFound } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { DEFAULT_CATEGORIES, FALLBACK_CATEGORY_NAME } from './defaults.js';

/** Devuelve la categoría "Otros" del usuario, creándola si faltara (usuarios pre-v2). */
export async function getFallbackCategory(userId) {
  const existing = await prisma.category.findFirst({ where: { userId, isFallback: true } });
  if (existing) return existing;
  const { isFallback: _f, ...def } = DEFAULT_CATEGORIES.find((c) => c.isFallback);
  return prisma.category.upsert({
    where: { userId_name: { userId, name: FALLBACK_CATEGORY_NAME } },
    update: { isFallback: true },
    create: { ...def, isFallback: true, userId },
  });
}

/** Garantiza que la categoría existe y pertenece al usuario. */
export async function assertOwnCategory(userId, categoryId) {
  const cat = await prisma.category.findFirst({ where: { id: categoryId, userId } });
  if (!cat) throw notFound('Categoría no encontrada');
  return cat;
}
