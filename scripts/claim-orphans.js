#!/usr/bin/env node
// Migra los datos pre-v2 (sin userId, importes Float y categoría como texto) al modelo v2.
// No borra nada: antes de escribir guarda una copia JSON de los documentos antiguos en backups/.
//
// Uso (por defecto es un simulacro; añade --apply para escribir):
//   1) node scripts/claim-orphans.js --apply
//        Copia de seguridad + elimina el índice único antiguo por nombre de categoría,
//        que impediría que dos usuarios tengan su propia «Comida».
//   2) npx prisma db push           (crea los índices nuevos)
//   3) Regístrate en la app con tu email.
//   4) node scripts/claim-orphans.js --email tu@email.com --apply
//        Asigna los gastos y categorías antiguos a ese usuario (importes a céntimos).
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const LEGACY_INDEX = 'categories_name_key';
const DEFAULT_COLOR = '#94a3b8';
const DEFAULT_ICON = '🏷️';

const oid = (id) => ({ $oid: id });
const idOf = (doc) => doc._id?.$oid ?? String(doc._id);
const now = () => ({ $date: new Date().toISOString() });

async function findAll(prisma, collection, filter) {
  const res = await prisma.$runCommandRaw({ find: collection, filter, batchSize: 100000 });
  return res.cursor.firstBatch;
}

async function listIndexes(prisma, collection) {
  try {
    const res = await prisma.$runCommandRaw({ listIndexes: collection });
    return res.cursor.firstBatch.map((i) => i.name);
  } catch {
    return []; // la colección no existe
  }
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ email?: string|null, apply?: boolean, backupDir?: string, log?: (msg: string) => void }} opts
 */
export async function migrateLegacy(prisma, { email = null, apply = false, backupDir = 'backups', log = console.log } = {}) {
  const legacyCategories = await findAll(prisma, 'categories', { userId: { $exists: false } });
  const orphanExpenses = await findAll(prisma, 'expenses', { userId: { $exists: false } });
  const hasLegacyIndex = (await listIndexes(prisma, 'categories')).includes(LEGACY_INDEX);
  log(`Categorías antiguas sin usuario: ${legacyCategories.length}`);
  log(`Gastos sin usuario: ${orphanExpenses.length}`);
  log(`Índice único antiguo por nombre: ${hasLegacyIndex ? 'sí' : 'no'}`);

  const summary = {
    legacyCategories: legacyCategories.length,
    orphanExpenses: orphanExpenses.length,
    droppedIndex: false,
    backupFile: null,
    adoptedCategories: 0,
    createdCategories: 0,
    migratedExpenses: 0,
    skippedExpenses: 0,
  };
  if (!apply) return summary;

  if (legacyCategories.length || orphanExpenses.length) {
    mkdirSync(backupDir, { recursive: true });
    const file = path.join(backupDir, `legacy-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    writeFileSync(file, JSON.stringify({ categories: legacyCategories, expenses: orphanExpenses }, null, 2));
    summary.backupFile = file;
    log(`Copia de seguridad: ${file}`);
  }

  if (hasLegacyIndex) {
    await prisma.$runCommandRaw({ dropIndexes: 'categories', index: LEGACY_INDEX });
    summary.droppedIndex = true;
    log(`Índice ${LEGACY_INDEX} eliminado.`);
  }

  if (!email) return summary;

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) throw new Error(`No existe ningún usuario con email ${email}. Regístrate primero en la app.`);

  const own = await prisma.category.findMany({ where: { userId: user.id } });
  const byName = new Map(own.map((c) => [c.name.toLowerCase(), c]));
  const fallback = own.find((c) => c.isFallback);

  // 1) Categorías antiguas: si el usuario ya tiene una con ese nombre se reutiliza
  //    (copiando el presupuesto si no tenía); si no, se adopta el documento antiguo.
  for (const doc of legacyCategories) {
    const name = String(doc.name ?? '').trim();
    if (!name) continue;
    const budgetCents = Number.isFinite(Number(doc.budgetLimit)) ? Math.round(Number(doc.budgetLimit) * 100) : null;
    const existing = byName.get(name.toLowerCase());
    if (existing) {
      if (existing.monthlyBudgetCents === null && budgetCents !== null) {
        byName.set(name.toLowerCase(), await prisma.category.update({
          where: { id: existing.id },
          data: { monthlyBudgetCents: budgetCents },
        }));
      }
      continue;
    }
    await prisma.$runCommandRaw({
      update: 'categories',
      updates: [
        {
          q: { _id: oid(idOf(doc)) },
          u: {
            $set: {
              userId: oid(user.id),
              color: doc.color || DEFAULT_COLOR,
              icon: doc.icon || DEFAULT_ICON,
              monthlyBudgetCents: budgetCents,
              isFallback: false,
              kind: 'EXPENSE',
              updatedAt: now(),
            },
            $unset: { budgetLimit: '' },
          },
        },
      ],
    });
    byName.set(name.toLowerCase(), { id: idOf(doc), name });
    summary.adoptedCategories += 1;
  }

  // 2) Gastos: céntimos, categoryId y campos nuevos obligatorios.
  for (const doc of orphanExpenses) {
    const amount = Number(doc.amount);
    const amountCents = Number.isFinite(amount) ? Math.abs(Math.round(amount * 100)) : 0;
    if (amountCents === 0) {
      log(`  · ${idOf(doc)}: importe inválido (${doc.amount}), se deja sin migrar`);
      summary.skippedExpenses += 1;
      continue;
    }

    const name = String(doc.category ?? '').trim();
    let category = name ? byName.get(name.toLowerCase()) : null;
    if (!category && name) {
      category = await prisma.category.create({ data: { userId: user.id, name } });
      byName.set(name.toLowerCase(), category);
      summary.createdCategories += 1;
    }
    category ??= fallback;

    await prisma.$runCommandRaw({
      update: 'expenses',
      updates: [
        {
          q: { _id: oid(idOf(doc)) },
          u: {
            $set: {
              userId: oid(user.id),
              categoryId: oid(category.id),
              amountCents,
              currency: 'EUR',
              kind: 'EXPENSE',
              description: doc.description || doc.merchant || name || 'Gasto',
              source: 'MANUAL',
              categorizedBy: 'USER',
              updatedAt: now(),
            },
            $unset: { amount: '', category: '', paymentMethod: '', isRecurring: '' },
          },
        },
      ],
    });
    summary.migratedExpenses += 1;
  }

  log(
    `Migrados ${summary.migratedExpenses} gastos a ${email}; ` +
      `${summary.adoptedCategories} categorías adoptadas, ${summary.createdCategories} creadas.`,
  );
  return summary;
}

// Ejecución como script (no al importarlo desde los tests).
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await import('dotenv/config');
  const { PrismaClient } = await import('@prisma/client');
  const args = process.argv.slice(2);
  const emailIdx = args.indexOf('--email');
  const apply = args.includes('--apply');
  const prisma = new PrismaClient();
  try {
    console.log(apply ? '== MODO APLICAR ==' : '== SIMULACRO (añade --apply para escribir) ==');
    await migrateLegacy(prisma, { apply, email: emailIdx >= 0 ? args[emailIdx + 1] : null });
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
