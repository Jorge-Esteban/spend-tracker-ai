#!/usr/bin/env node
// Migra los datos pre-v2 (sin userId, importes Float y categoría como texto) al modelo v2.
//
// Uso (por defecto es un simulacro; añade --apply para escribir):
//   1) node scripts/claim-orphans.js --apply
//        Limpia las categorías antiguas (globales, sin userId) y su índice único por nombre,
//        que impedirían crear las categorías por usuario. Informa de los gastos huérfanos.
//   2) npx prisma db push           (crea los índices nuevos)
//   3) Regístrate en la app con tu email.
//   4) node scripts/claim-orphans.js --email tu@email.com --apply
//        Asigna los gastos huérfanos a ese usuario y los convierte a céntimos + categoryId.
import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const emailIdx = args.indexOf('--email');
const email = emailIdx >= 0 ? args[emailIdx + 1]?.toLowerCase() : null;

const prisma = new PrismaClient();
const raw = (cmd) => prisma.$runCommandRaw(cmd);
const oid = (id) => ({ $oid: id });
const idOf = (doc) => doc._id.$oid ?? doc._id;

async function findAll(collection, filter) {
  const res = await raw({ find: collection, filter, batchSize: 100000 });
  return res.cursor.firstBatch;
}

async function cleanupLegacyCategories() {
  const legacy = await findAll('categories', { userId: { $exists: false } });
  console.log(`Categorías antiguas sin userId: ${legacy.length}`);

  const { cursor } = await raw({ listIndexes: 'categories' }).catch(() => ({ cursor: { firstBatch: [] } }));
  const legacyIndex = cursor.firstBatch.find((i) => i.name === 'categories_name_key');
  console.log(`Índice único antiguo por nombre: ${legacyIndex ? 'sí' : 'no'}`);

  if (!apply) return;
  if (legacy.length) await raw({ delete: 'categories', deletes: [{ q: { userId: { $exists: false } }, limit: 0 }] });
  if (legacyIndex) await raw({ dropIndexes: 'categories', index: 'categories_name_key' });
  console.log('Limpieza aplicada.');
}

async function claimExpenses() {
  const orphans = await findAll('expenses', { userId: { $exists: false } });
  console.log(`Gastos huérfanos: ${orphans.length}`);
  if (!email || orphans.length === 0) return;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`No existe ningún usuario con email ${email}. Regístrate primero en la app.`);

  const categories = await prisma.category.findMany({ where: { userId: user.id } });
  const byName = new Map(categories.map((c) => [c.name.toLowerCase(), c]));
  const fallback = categories.find((c) => c.isFallback);

  let migrated = 0;
  for (const doc of orphans) {
    const name = String(doc.category ?? '').trim();
    let category = byName.get(name.toLowerCase()) ?? null;
    if (!category && name && apply) {
      // Se conserva la categoría antigua como categoría propia del usuario.
      category = await prisma.category.create({ data: { userId: user.id, name } });
      byName.set(name.toLowerCase(), category);
    }
    category ??= fallback;

    const amount = Number(doc.amount);
    const amountCents = Number.isFinite(amount) ? Math.abs(Math.round(amount * 100)) : 0;
    if (amountCents === 0) {
      console.warn(`  · ${idOf(doc)}: importe inválido (${doc.amount}), se omite`);
      continue;
    }

    if (apply) {
      await raw({
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
                description: doc.description || name || 'Gasto',
                source: 'MANUAL',
                categorizedBy: 'USER',
              },
              $unset: { amount: '', category: '', paymentMethod: '', isRecurring: '' },
            },
          },
        ],
      });
    }
    migrated += 1;
  }
  console.log(`${apply ? 'Migrados' : 'Se migrarían'} ${migrated} gastos a ${email}.`);
}

try {
  console.log(apply ? '== MODO APLICAR ==' : '== SIMULACRO (añade --apply para escribir) ==');
  await cleanupLegacyCategories();
  await claimExpenses();
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
