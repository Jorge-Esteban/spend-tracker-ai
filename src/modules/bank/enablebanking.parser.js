// Parser puro de transacciones de Enable Banking (formato Berlin Group / PSD2):
// {
//   entry_reference?, transaction_id?, status: "BOOK" | "PDNG" | ...,
//   transaction_amount: { amount: "12.34", currency: "EUR" },   // siempre positivo
//   credit_debit_indicator: "DBIT" (cargo) | "CRDT" (abono),
//   booking_date?, value_date?, transaction_date?,
//   remittance_information?: string[], creditor?: { name }, debtor?: { name }
// }
import { createHash } from 'node:crypto';
import { decimalToCents } from '../../lib/money.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Id estable para deduplicar. Si el banco no da referencia, se usa un hash de los datos
 * que no cambian entre importaciones (cuenta, fecha, importe, sentido y concepto).
 */
export function externalIdFor(tx, accountUid) {
  const ref = tx.entry_reference || tx.transaction_id;
  if (ref) return `eb:${ref}`;
  const fingerprint = [
    accountUid,
    tx.booking_date ?? tx.value_date ?? tx.transaction_date,
    tx.transaction_amount?.amount,
    tx.credit_debit_indicator,
    (tx.remittance_information ?? []).join(' '),
  ].join('|');
  return `eb:h:${createHash('sha256').update(fingerprint).digest('hex').slice(0, 32)}`;
}

/** Convierte una transacción en movimiento, o devuelve { skip: motivo }. */
export function parseEbTransaction(tx, accountUid = '') {
  if (!tx || typeof tx !== 'object') return { skip: 'invalid' };
  // Solo contabilizadas: las pendientes pueden cambiar o desaparecer.
  if (tx.status && tx.status !== 'BOOK') return { skip: 'pending' };

  let cents;
  try {
    cents = Math.abs(decimalToCents(tx.transaction_amount?.amount));
  } catch {
    return { skip: 'invalid' };
  }
  if (cents === 0) return { skip: 'invalid' };

  const indicator = tx.credit_debit_indicator;
  if (indicator !== 'DBIT' && indicator !== 'CRDT') return { skip: 'invalid' };
  const kind = indicator === 'DBIT' ? 'EXPENSE' : 'INCOME';

  const rawDate = tx.booking_date ?? tx.value_date ?? tx.transaction_date;
  if (!rawDate || !DATE_RE.test(rawDate)) return { skip: 'invalid' };

  // La contraparte: a quién pagas (cargo) o quién te paga (abono).
  const party = (kind === 'EXPENSE' ? tx.creditor?.name : tx.debtor?.name)?.trim() || null;
  const remittance = (tx.remittance_information ?? []).join(' ').replace(/\s+/g, ' ').trim();
  const description = remittance || party || 'Movimiento bancario';

  return {
    expense: {
      externalId: externalIdFor(tx, accountUid),
      kind,
      amountCents: cents,
      currency: tx.transaction_amount?.currency || 'EUR',
      description: description.slice(0, 200),
      merchant: party?.slice(0, 120) ?? null,
      date: new Date(`${rawDate}T00:00:00.000Z`),
    },
  };
}

/** Lista de { accountUid, tx }: deduplica dentro del lote y cuenta descartes. */
export function parseEbTransactions(entries) {
  const seen = new Set();
  const expenses = [];
  const skipped = { pending: 0, invalid: 0, duplicateInBatch: 0 };
  for (const { accountUid, tx } of entries ?? []) {
    const { expense, skip } = parseEbTransaction(tx, accountUid);
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
