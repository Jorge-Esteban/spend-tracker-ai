// Cliente HTTP mínimo de Tink. `fetchImpl` se inyecta para poder testearlo sin red.
import { env } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';

const API = 'https://api.tink.com';
const LINK = 'https://link.tink.com/1.0/transactions/connect-accounts';
const PAGE_SIZE = 100;
const MAX_PAGES = 20; // tope de seguridad: 2.000 movimientos por importación

export function buildTinkLinkUrl(state) {
  const params = new URLSearchParams({
    client_id: env.TINK_CLIENT_ID,
    redirect_uri: env.TINK_REDIRECT_URI,
    market: env.TINK_MARKET,
    locale: env.TINK_LOCALE,
    state,
  });
  if (env.TINK_TEST_MODE) params.set('test', 'true');
  return `${LINK}/?${params}`;
}

async function tinkFetch(fetchImpl, url, init, what) {
  let res;
  try {
    res = await fetchImpl(url, init);
  } catch (err) {
    logger.error({ err: err.message, what }, 'Tink no responde');
    throw new AppError(502, 'No se pudo contactar con el banco', 'BANK_UNAVAILABLE');
  }
  if (!res.ok) {
    // Se registra solo el status: el cuerpo puede contener datos sensibles.
    logger.warn({ status: res.status, what }, 'Tink devolvió un error');
    if (res.status === 400 || res.status === 401) {
      throw new AppError(400, 'La autorización del banco ha caducado o no es válida. Vuelve a conectar.', 'BANK_AUTH');
    }
    throw new AppError(502, 'El banco devolvió un error', 'BANK_ERROR');
  }
  return res.json();
}

export async function exchangeCode(code, fetchImpl = fetch) {
  const body = new URLSearchParams({
    code,
    client_id: env.TINK_CLIENT_ID,
    client_secret: env.TINK_CLIENT_SECRET,
    grant_type: 'authorization_code',
  });
  const data = await tinkFetch(
    fetchImpl,
    `${API}/api/v1/oauth/token`,
    { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body },
    'token',
  );
  if (!data?.access_token) throw new AppError(502, 'El banco no devolvió un token', 'BANK_ERROR');
  return data.access_token;
}

/** Recorre todas las páginas de un listado v2 siguiendo nextPageToken. */
export async function paginate(fetchImpl, path, params, key, token) {
  const items = [];
  let pageToken = '';
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const qs = new URLSearchParams(params);
    qs.set('pageSize', String(PAGE_SIZE));
    if (pageToken) qs.set('pageToken', pageToken);
    const data = await tinkFetch(
      fetchImpl,
      `${API}${path}?${qs}`,
      { headers: { Authorization: `Bearer ${token}` } },
      path,
    );
    items.push(...(data?.[key] ?? []));
    pageToken = data?.nextPageToken ?? '';
    if (!pageToken) break;
  }
  return items;
}

export async function fetchAllTransactions(accessToken, fetchImpl = fetch) {
  const accounts = await paginate(fetchImpl, '/data/v2/accounts', [], 'accounts', accessToken);
  if (accounts.length === 0) return { accounts: 0, transactions: [] };
  const params = accounts.map((a) => ['accountIdIn', a.id]);
  const transactions = await paginate(fetchImpl, '/data/v2/transactions', params, 'transactions', accessToken);
  return { accounts: accounts.length, transactions };
}
