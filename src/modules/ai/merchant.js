// Normaliza el nombre de un comercio para que "MERCADONA 1234 Madrid" y "Mercadona  madrid"
// compartan regla aprendida.
export function normalizeMerchant(value) {
  if (!value) return '';
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !/^\d+$/.test(w))
    .join(' ')
    .slice(0, 60);
}

/** Clave de regla para un gasto: comercio si lo hay, si no la descripción. */
export const merchantKeyFor = (expense) => normalizeMerchant(expense.merchant || expense.description);
