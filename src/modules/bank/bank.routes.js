import { Router } from 'express';
import { z } from 'zod';
import { env, tinkEnabled } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { categorizeExpenses } from '../ai/categorize.service.js';
import { markInsightsStale } from '../ai/insights.service.js';
import { consumeExpenseQuota, remainingExpenseQuota } from '../usage/quota.js';
import { createState, verifyState } from './state.js';
import { buildTinkLinkUrl, exchangeCode, fetchAllTransactions } from './tink.client.js';
import { parseTinkTransactions } from './tink.parser.js';

const importSchema = z.object({
  code: z.string().min(1).max(512),
  state: z.string().min(1).max(2048),
});

function requireTink() {
  if (!tinkEnabled) throw new AppError(503, 'La conexión bancaria no está configurada', 'BANK_DISABLED');
}

/** Guarda los gastos parseados de Tink: dedup por externalId, cuota y categorización en lote. */
export async function saveBankExpenses(user, parsed) {
  const userId = user.id;
  const ids = parsed.map((e) => e.externalId);
  const existing = await prisma.expense.findMany({
    where: { userId, externalId: { in: ids } },
    select: { externalId: true },
  });
  const known = new Set(existing.map((e) => e.externalId));
  const fresh = parsed.filter((e) => !known.has(e.externalId));

  const remaining = await remainingExpenseQuota(user);
  // Los más recientes primero, por si la cuota no llega para todos.
  const accepted = [...fresh].sort((a, b) => b.date - a.date).slice(0, remaining);

  if (accepted.length > 0) {
    const categories = await categorizeExpenses(userId, accepted);
    await consumeExpenseQuota(user, accepted.length);
    await prisma.expense.createMany({
      data: accepted.map((e, i) => ({ ...e, ...categories[i], userId, source: 'BANK' })),
    });
    await markInsightsStale(userId);
  }

  return {
    imported: accepted.length,
    duplicates: known.size,
    skippedByQuota: fresh.length - accepted.length,
  };
}

/** Estructura de un objeto (claves anidadas) sin ningún valor. */
export function shapeOf(value, depth = 0) {
  if (!value || typeof value !== 'object' || depth > 3) return typeof value;
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shapeOf(v, depth + 1)]));
}

export const bankRouter = Router();

// Estado honesto: no se guarda ningún token, cada importación es puntual.
bankRouter.get('/status', async (req, res) => {
  const last = await prisma.expense.findFirst({
    where: { userId: req.user.id, source: 'BANK' },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  const bankExpenses = await prisma.expense.count({ where: { userId: req.user.id, source: 'BANK' } });
  res.json({
    enabled: tinkEnabled,
    testMode: env.TINK_TEST_MODE,
    bankExpenses,
    lastImportAt: last?.createdAt ?? null,
  });
});

bankRouter.get('/connect-url', (req, res) => {
  requireTink();
  res.json({ url: buildTinkLinkUrl(createState(req.user.id)) });
});

bankRouter.post('/import', async (req, res) => {
  requireTink();
  const { code, state } = importSchema.parse(req.body);
  verifyState(state, req.user.id);

  const accessToken = await exchangeCode(code);
  const { accounts, transactions } = await fetchAllTransactions(accessToken);
  const { expenses, skipped } = parseTinkTransactions(transactions);
  // Diagnóstico sin datos personales: solo nombres de campos, para detectar cambios en la API de Tink.
  req.log.info(
    { accounts, fetched: transactions.length, skipped, sampleKeys: shapeOf(transactions[0]) },
    'Importación Tink',
  );
  const result = await saveBankExpenses(req.user, expenses);

  res.json({ accounts, fetched: transactions.length, skipped, ...result });
});
