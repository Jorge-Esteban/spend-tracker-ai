// Parser puro de la API Data v2 de Tink (GET /data/v2/transactions).
// Forma esperada de cada transacción (según la documentación de Tink; NO verificada aún en vivo):
// {
//   id, accountId, status: "BOOKED" | "PENDING" | "UNDEFINED",
//   amount: { value: { unscaledValue: "-1300", scale: "2" }, currencyCode: "EUR" },
//   descriptions: { original, display },
//   dates: { booked: "2026-03-15", value: "2026-03-15" },
//   merchantInformation?: { merchantName, merchantCategoryCode }
// }
import { scaledToCents } from '../../lib/money.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Convierte una transacción v2 en un gasto, o devuelve { skip: motivo }.
 * Solo se importan cargos (importe negativo) ya contabilizados.
 */
export function parseTinkTransaction(tx) {
  if (!tx || typeof tx !== 'object' || !tx.id) return { skip: 'invalid' };
  if (tx.status === 'PENDING') return { skip: 'pending' };

  const value = tx.amount?.value;
  if (!value || value.unscaledValue === undefined) return { skip: 'invalid' };

  let cents;
  try {
    cents = scaledToCents(value.unscaledValue, value.scale);
  } catch {
    return { skip: 'invalid' };
  }
  if (cents >= 0) return { skip: 'income' };

  const rawDate = tx.dates?.booked ?? tx.dates?.value;
  if (!rawDate || !DATE_RE.test(rawDate)) return { skip: 'invalid' };

  const merchant = tx.merchantInformation?.merchantName?.trim() || null;
  const description =
    tx.descriptions?.display?.trim() || tx.descriptions?.original?.trim() || merchant || 'Movimiento bancario';

  return {
    expense: {
      externalId: String(tx.id),
      amountCents: -cents,
      currency: tx.amount.currencyCode || 'EUR',
      description: description.slice(0, 200),
      merchant: merchant?.slice(0, 120) ?? null,
      date: new Date(`${rawDate}T00:00:00.000Z`),
    },
  };
}

/**
 * Parsea una lista de transacciones: deduplica por id dentro del lote y cuenta descartes.
 * @returns {{ expenses: object[], skipped: Record<string, number> }}
 */
export function parseTinkTransactions(transactions) {
  const seen = new Set();
  const expenses = [];
  const skipped = { income: 0, pending: 0, invalid: 0, duplicateInBatch: 0 };
  for (const tx of transactions ?? []) {
    const { expense, skip } = parseTinkTransaction(tx);
    if (skip) {
      skipped[skip] += 1;
      continue;
    }
    if (seen.has(expense.externalId)) {
      skipped.duplicateInBatch += 1;
      continue;
    }
    seen.add(expense.externalId);
    expenses.push(expense);
  }
  return { expenses, skipped };
}
