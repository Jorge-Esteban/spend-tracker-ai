import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { migrateLegacy } from '../../scripts/claim-orphans.js';
import { prisma, registerUser, resetDb } from '../helpers.js';

vi.mock('../../src/modules/ai/claude.js', () => ({ categorizeBatch: vi.fn(async () => new Map()), generateInsights: vi.fn() }));

const date = (iso) => ({ $date: new Date(iso).toISOString() });
let backupDir;

// Datos con la forma exacta de la v1: sin userId, Float y categoría como texto.
async function seedLegacy() {
  await prisma.$runCommandRaw({
    insert: 'categories',
    documents: [
      { name: 'Comida', color: null, budgetLimit: 150.5, createdAt: date('2025-01-01') },
      { name: 'Mascotas', color: '#123456', createdAt: date('2025-01-01') },
    ],
  });
  await prisma.$runCommandRaw({
    createIndexes: 'categories',
    indexes: [{ key: { name: 1 }, name: 'categories_name_key', unique: true }],
  });
  await prisma.$runCommandRaw({
    insert: 'expenses',
    documents: [
      { amount: 12.345, category: 'Comida', description: 'Súper', merchant: 'Mercadona', date: date('2025-09-03'), paymentMethod: 'card', isRecurring: false, createdAt: date('2025-09-03'), updatedAt: date('2025-09-03') },
      { amount: 30, category: 'Mascotas', description: null, merchant: 'Kiwoko', date: date('2025-09-04'), createdAt: date('2025-09-04'), updatedAt: date('2025-09-04') },
      { amount: 9.99, category: 'Gimnasio', description: 'Cuota', date: date('2025-09-05'), createdAt: date('2025-09-05'), updatedAt: date('2025-09-05') },
      { amount: 'NaN', category: 'Comida', description: 'Roto', date: date('2025-09-06'), createdAt: date('2025-09-06'), updatedAt: date('2025-09-06') },
    ],
  });
}

beforeEach(async () => {
  await resetDb();
  backupDir = mkdtempSync(path.join(tmpdir(), 'claim-'));
});

afterEach(async () => {
  rmSync(backupDir, { recursive: true, force: true });
  await prisma.$runCommandRaw({ dropIndexes: 'categories', index: 'categories_name_key' }).catch(() => {});
});

describe('scripts/claim-orphans', () => {
  it('el simulacro no escribe nada', async () => {
    await seedLegacy();
    const s = await migrateLegacy(prisma, { backupDir, log: () => {} });
    expect(s).toMatchObject({ legacyCategories: 2, orphanExpenses: 4, droppedIndex: false, backupFile: null });
    const idx = (await prisma.$runCommandRaw({ listIndexes: 'categories' })).cursor.firstBatch.map((i) => i.name);
    expect(idx).toContain('categories_name_key');
  });

  it('el índice antiguo impide registrarse a dos usuarios; tras el paso 1 ya no', async () => {
    await seedLegacy();
    // Con el índice antiguo, sembrar «Comida» para un usuario choca con la «Comida» global.
    const { request, app } = await import('../helpers.js');
    await request(app).post('/api/auth/register').send({ email: 'a@test.dev', password: 'contraseña-1' }).expect(409);

    const s = await migrateLegacy(prisma, { apply: true, backupDir, log: () => {} });
    expect(s.droppedIndex).toBe(true);
    expect(existsSync(s.backupFile)).toBe(true);
    const backup = JSON.parse(readFileSync(s.backupFile, 'utf8'));
    expect(backup.expenses).toHaveLength(4);
    expect(backup.categories).toHaveLength(2);

    await registerUser();
    await registerUser();
  });

  it('asigna gastos y categorías antiguos al usuario sin borrar nada', async () => {
    await seedLegacy();
    await migrateLegacy(prisma, { apply: true, backupDir, log: () => {} });
    const u = await registerUser();

    const s = await migrateLegacy(prisma, { apply: true, email: u.user.email.toUpperCase(), backupDir, log: () => {} });
    expect(s).toMatchObject({ migratedExpenses: 3, skippedExpenses: 1, adoptedCategories: 1, createdCategories: 1 });

    // La API v2 lee los datos migrados sin errores.
    const { body } = await u.agent.get('/api/expenses?pageSize=100').expect(200);
    const rows = Object.fromEntries(body.items.map((e) => [e.merchant ?? e.description, e]));
    expect(rows.Mercadona).toMatchObject({ amountCents: 1235, description: 'Súper', categorizedBy: 'USER', source: 'MANUAL' });
    expect(rows.Mercadona.category.id).toBe(u.categories.Comida.id);
    expect(rows.Kiwoko).toMatchObject({ amountCents: 3000, description: 'Kiwoko' });
    expect(rows.Kiwoko.category.name).toBe('Mascotas');
    expect(rows.Cuota.category.name).toBe('Gimnasio');

    const cats = (await u.agent.get('/api/categories').expect(200)).body.categories;
    const byName = Object.fromEntries(cats.map((c) => [c.name, c]));
    expect(byName.Comida.monthlyBudgetCents).toBe(15050); // 150,50 € del presupuesto antiguo
    expect(byName.Mascotas).toMatchObject({ color: '#123456', icon: '🏷️', isFallback: false });

    // El gasto con importe inválido sigue intacto y sin usuario.
    const left = (await prisma.$runCommandRaw({ count: 'expenses', query: { userId: { $exists: false } } })).n;
    expect(left).toBe(1);

    const stats = (await u.agent.get('/api/stats?month=2025-09').expect(200)).body;
    expect(stats.totals.totalCents).toBe(1235 + 3000 + 999);
  });

  it('falla con un email que no existe', async () => {
    await seedLegacy();
    await expect(migrateLegacy(prisma, { apply: true, email: 'nadie@test.dev', backupDir, log: () => {} })).rejects.toThrow(
      /Regístrate primero/,
    );
  });
});
