const moneyFormatters = new Map();

/** 1234 (céntimos) -> "12,34 €" */
export function formatMoney(cents, currency = 'EUR') {
  if (!moneyFormatters.has(currency)) {
    moneyFormatters.set(currency, new Intl.NumberFormat('es-ES', { style: 'currency', currency }));
  }
  return moneyFormatters.get(currency).format((cents ?? 0) / 100);
}

const compact = new Intl.NumberFormat('es-ES', { notation: 'compact', maximumFractionDigits: 1 });
export const formatCompactEuros = (cents) => `${compact.format((cents ?? 0) / 100)} €`;

const dateFmt = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
export const formatDate = (iso) => dateFmt.format(new Date(iso));

const monthFmt = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const shortMonthFmt = new Intl.DateTimeFormat('es-ES', { month: 'short', timeZone: 'UTC' });
const monthDate = (key) => new Date(`${key}-01T00:00:00Z`);
export const formatMonth = (key) => monthFmt.format(monthDate(key));
export const formatShortMonth = (key) => shortMonthFmt.format(monthDate(key));

export function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function shiftMonth(key, n) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function formatPct(value) {
  if (value === null || value === undefined) return '—';
  return `${value > 0 ? '+' : ''}${value.toLocaleString('es-ES')} %`;
}
