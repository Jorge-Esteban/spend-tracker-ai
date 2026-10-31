// Cliente mínimo de Enable Banking (PSD2). Cada petición va firmada con un JWT RS256
// hecho con la clave privada de la app. `fetchImpl` se inyecta para testear sin red.
import { readFileSync } from 'node:fs';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';

const API = 'https://api.enablebanking.com';
const MAX_PAGES = 50; // tope de seguridad por cuenta

let privateKey;
function getPrivateKey() {
  privateKey ??= env.ENABLE_BANKING_PRIVATE_KEY
    ? env.ENABLE_BANKING_PRIVATE_KEY.replace(/\\n/g, '\n')
    : readFileSync(env.ENABLE_BANKING_KEY_PATH, 'utf8');
  return privateKey;
}

/** JWT de aplicación: válido 1 h (el máximo que admite Enable Banking es 24 h). */
export function makeAppToken(now = Math.floor(Date.now() / 1000), key = getPrivateKey()) {
  return jwt.sign({ iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat: now, exp: now + 3600 }, key, {
    algorithm: 'RS256',
    header: { typ: 'JWT', kid: env.ENABLE_BANKING_APP_ID },
  });
}

async function ebFetch(fetchImpl, path, { method = 'GET', body, query } = {}, what = path) {
  const url = new URL(path, API);
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== null) url.searchParams.set(k, v);

  let res;
  try {
    res = await fetchImpl(url, {
      method,
      headers: {
        Authorization: `Bearer ${makeAppToken()}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    logger.error({ err: err.message, what }, 'Enable Banking no responde');
    throw new AppError(502, 'No se pudo contactar con el banco', 'BANK_UNAVAILABLE');
  }
  if (!res.ok) {
    // Solo status y código de error: el cuerpo puede contener datos de la cuenta.
    const data = await res.json().catch(() => ({}));
    logger.warn({ status: res.status, what, error: data?.error ?? data?.code }, 'Enable Banking devolvió un error');
    if (res.status === 401 || res.status === 403 || res.status === 422) {
      throw new AppError(400, 'La autorización del banco ha caducado o no es válida. Vuelve a conectar.', 'BANK_AUTH');
    }
    throw new AppError(502, 'El banco devolvió un error', 'BANK_ERROR');
  }
  return res.json();
}

/** Bancos disponibles en un país (para el selector de la UI). */
export async function listAspsps(country = env.ENABLE_BANKING_COUNTRY, fetchImpl = fetch) {
  const data = await ebFetch(fetchImpl, '/aspsps', { query: { country, psu_type: 'personal' } }, 'aspsps');
  return (data?.aspsps ?? []).map((a) => ({ name: a.name, country: a.country, logo: a.logo ?? null, beta: Boolean(a.beta) }));
}

/** Inicia la autorización: devuelve la URL del banco a la que se redirige al usuario. */
export async function startAuthorization({ aspsp, state, validDays = 90, now = new Date() }, fetchImpl = fetch) {
  const validUntil = new Date(now.getTime() + validDays * 24 * 60 * 60 * 1000).toISOString();
  const data = await ebFetch(
    fetchImpl,
    '/auth',
    {
      method: 'POST',
      body: {
        access: { valid_until: validUntil },
        aspsp: { name: aspsp, country: env.ENABLE_BANKING_COUNTRY },
        state,
        redirect_url: env.ENABLE_BANKING_REDIRECT_URI,
        psu_type: 'personal',
        language: 'es',
      },
    },
    'auth',
  );
  if (!data?.url) throw new AppError(502, 'El banco no devolvió la dirección de autorización', 'BANK_ERROR');
  return data.url;
}

/** Canjea el código de vuelta por una sesión con las cuentas autorizadas. */
export async function createSession(code, fetchImpl = fetch) {
  const data = await ebFetch(fetchImpl, '/sessions', { method: 'POST', body: { code } }, 'sessions');
  return { sessionId: data?.session_id, accounts: data?.accounts ?? [] };
}

/** Todas las transacciones de una cuenta desde `dateFrom`, siguiendo continuation_key. */
export async function fetchAccountTransactions(accountUid, dateFrom, fetchImpl = fetch) {
  const items = [];
  let continuationKey;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const data = await ebFetch(
      fetchImpl,
      `/accounts/${encodeURIComponent(accountUid)}/transactions`,
      { query: { date_from: dateFrom, continuation_key: continuationKey } },
      'transactions',
    );
    items.push(...(data?.transactions ?? []));
    continuationKey = data?.continuation_key;
    if (!continuationKey) break;
  }
  return items;
}

/** Sesión + transacciones de todas sus cuentas. */
export async function fetchAllTransactions(code, { since }, fetchImpl = fetch) {
  const { accounts } = await createSession(code, fetchImpl);
  const transactions = [];
  for (const account of accounts) {
    const txs = await fetchAccountTransactions(account.uid, since, fetchImpl);
    transactions.push(...txs.map((tx) => ({ accountUid: account.uid, tx })));
  }
  return { accounts: accounts.length, transactions };
}
