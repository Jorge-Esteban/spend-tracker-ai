// Utilidades de fechas por mes natural, siempre en UTC para que el servidor
// dé el mismo resultado en cualquier zona horaria.

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function isMonthKey(value) {
  return typeof value === 'string' && MONTH_RE.test(value);
}

export function monthKey(date) {
  const d = new Date(date);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function currentMonthKey(now = new Date()) {
  return monthKey(now);
}

/** "2026-03" -> { start: 2026-03-01T00:00Z, end: 2026-04-01T00:00Z } (end exclusivo). */
export function monthRange(key) {
  const [, y, m] = key.match(MONTH_RE);
  const year = Number(y);
  const month = Number(m) - 1;
  return {
    start: new Date(Date.UTC(year, month, 1)),
    end: new Date(Date.UTC(year, month + 1, 1)),
  };
}

/** Desplaza un mes "YYYY-MM" n meses (n puede ser negativo). */
export function shiftMonth(key, n) {
  const { start } = monthRange(key);
  return monthKey(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + n, 1)));
}

/** Los últimos `count` meses terminando en `endKey`, en orden cronológico. */
export function lastMonths(endKey, count) {
  return Array.from({ length: count }, (_, i) => shiftMonth(endKey, i - (count - 1)));
}
