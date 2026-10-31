import { Router } from 'express';
import { z } from 'zod';
import { enableBankingEnabled, env, tinkEnabled } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { categorizeExpenses } from '../ai/categorize.service.js';
import { markInsightsStale } from '../ai/insights.service.js';
import { consumeExpenseQuota, remainingExpenseQuota } from '../usage/quota.js';
import { createState, verifyState } from './state.js';
import * as eb from './enablebanking.client.js';
import { parseEbTransactions } from './enablebanking.parser.js';
import { buildTinkLinkUrl, exchangeCode, fetchAllTransactions, importSince } from './tink.client.js';
import { parseTinkTransactions } from './tink.parser.js';

const importSchema = z.object({
  code: z.string().min(1).max(512),
  state: z.string().min(1).max(2048),
});

const PROVIDERS = { tink: () => tinkEnabled, enablebanking: () => enableBankingEnabled };

function requireProvider(provider) {
  if (!PROVIDERS[provider]?.()) {
    throw new AppError(503, 'Esa conexión bancaria no está configurada en el servidor', 'BANK_DISABLED');
  }
}

const connectQuery = z.object({
  provider: z.enum(['tink', 'enablebanking']).default('tink'),
  aspsp: z.string().trim().min(1).max(120).optional(),
});

// La lista de bancos cambia poco: se cachea una hora en memoria.
let aspspCache = { at: 0, list: [] };

/** Guarda los movimientos parseados del banco: dedup por externalId, cuota y categorización en lote. */
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
    importedExpenses: accepted.filter((e) => e.kind === 'EXPENSE').length,
    importedIncome: accepted.filter((e) => e.kind === 'INCOME').length,
    duplicates: known.size,
    skippedByQuota: fresh.length - accepted.length,
  };
}

/** Estructura de un objeto (claves anidadas) sin ningún valor. */
export function shapeOf(value, depth = 0) {
  if (!value || typeof value !== 'object' || depth > 3) return typeof value;
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shapeOf(v, depth + 1)]));
}

/** Recuento por tipo de Tink y signo del importe (agregado, sin importes ni textos). */
export function typeMix(transactions) {
  const mix = {};
  for (const tx of transactions) {
    const sign = String(tx?.amount?.value?.unscaledValue ?? '').startsWith('-') ? 'negativo' : 'positivo';
    const key = `${tx?.types?.type ?? 'SIN_TIPO'}/${sign}`;
    mix[key] = (mix[key] ?? 0) + 1;
  }
  return mix;
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
    enabled: tinkEnabled || enableBankingEnabled,
    providers: {
      tink: { enabled: tinkEnabled, testMode: env.TINK_TEST_MODE },
      enablebanking: { enabled: enableBankingEnabled, country: env.ENABLE_BANKING_COUNTRY },
    },
    testMode: env.TINK_TEST_MODE,
    bankExpenses,
    lastImportAt: last?.createdAt ?? null,
  });
});

bankRouter.get('/aspsps', async (_req, res) => {
  requireProvider('enablebanking');
  if (Date.now() - aspspCache.at > 60 * 60 * 1000) aspspCache = { at: Date.now(), list: await eb.listAspsps() };
  res.json({ aspsps: aspspCache.list });
});

bankRouter.get('/connect-url', async (req, res) => {
  const { provider, aspsp } = connectQuery.parse(req.query);
  requireProvider(provider);
  if (provider === 'tink') {
    return res.json({ url: buildTinkLinkUrl(createState(req.user.id, { provider })) });
  }
  if (!aspsp) throw new AppError(400, 'Elige tu banco', 'ASPSP_REQUIRED');
  const state = createState(req.user.id, { provider, aspsp });
  res.json({ url: await eb.startAuthorization({ aspsp, state }) });
});

bankRouter.post('/import', async (req, res) => {
  const { code, state } = importSchema.parse(req.body);
  const { provider = 'tink', aspsp } = verifyState(state, req.user.id);
  requireProvider(provider);

  if (provider === 'enablebanking') {
    const { accounts, transactions } = await eb.fetchAllTransactions(code, { since: importSince() });
    const { expenses, skipped } = parseEbTransactions(transactions);
    req.log.info(
      { provider, aspsp, accounts, fetched: transactions.length, skipped, sampleKeys: shapeOf(transactions[0]?.tx) },
      'Importación Enable Banking',
    );
    const result = await saveBankExpenses(req.user, expenses);
    return res.json({ provider, aspsp, accounts, fetched: transactions.length, skipped, ...result });
  }

  const accessToken = await exchangeCode(code);
  const { accounts, transactions } = await fetchAllTransactions(accessToken);
  const { expenses, skipped } = parseTinkTransactions(transactions);
  // Diagnóstico sin datos personales: solo nombres de campos, para detectar cambios en la API de Tink.
  req.log.info(
    { accounts, fetched: transactions.length, skipped, sampleKeys: shapeOf(transactions[0]), mix: typeMix(transactions) },
    'Importación Tink',
  );
  if (env.TINK_TEST_MODE) {
    // Solo con datos sintéticos de Demo Bank: ejemplos con valores para depurar el parser.
    req.log.info(
      {
        sample: transactions.slice(0, 5).map((t) => ({
          display: t.descriptions?.display,
          value: t.amount?.value,
          type: t.types?.type,
          status: t.status,
        })),
      },
      'Tink (modo test): muestra',
    );
  }
  const result = await saveBankExpenses(req.user, expenses);

  res.json({ provider, accounts, fetched: transactions.length, skipped, ...result });
});
