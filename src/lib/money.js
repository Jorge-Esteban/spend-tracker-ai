// Utilidades de dinero: todo se guarda en céntimos enteros.

/** "12,34" | "12.34" | 12.34 -> 1234. Devuelve NaN si no es un importe válido. */
export function toCents(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.round(value * 100) : NaN;
  }
  if (typeof value !== 'string') return NaN;
  const normalized = value.trim().replace(',', '.');
  if (!/^-?\d+(\.\d{1,2})?$/.test(normalized)) return NaN;
  return Math.round(Number(normalized) * 100);
}

/** 1234 -> "12.34" (formato neutro para CSV y prompts; la UI usa Intl.NumberFormat). */
export function centsToDecimal(cents) {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/**
 * Convierte un importe escalado de Tink v2 ({ unscaledValue: "-1300", scale: "1" }) a céntimos.
 * value = unscaledValue * 10^(-scale). Se trabaja con BigInt para no perder precisión.
 */
export function scaledToCents(unscaledValue, scale) {
  const unscaled = BigInt(String(unscaledValue));
  const s = Number(scale ?? 0);
  if (!Number.isInteger(s)) throw new Error(`scale inválido: ${scale}`);
  // cents = unscaled * 10^(2 - scale)
  const exp = 2 - s;
  if (exp >= 0) return Number(unscaled * 10n ** BigInt(exp));
  const divisor = 10n ** BigInt(-exp);
  // Redondeo half-away-from-zero.
  const q = unscaled / divisor;
  const r = unscaled % divisor;
  const twice = (r < 0n ? -r : r) * 2n;
  if (twice >= divisor) return Number(q + (unscaled < 0n ? -1n : 1n));
  return Number(q);
}
