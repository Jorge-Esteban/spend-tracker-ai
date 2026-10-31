// Exportación CSV de movimientos (el importe va siempre en positivo; el tipo dice si es gasto o ingreso),
// pensada para abrirse en Excel en español:
// separador ";", coma decimal y BOM UTF-8 para que salgan bien las tildes.

export const CSV_HEADERS = ['fecha', 'tipo', 'descripcion', 'comercio', 'categoria', 'importe', 'moneda', 'origen'];
const BOM = '\uFEFF';

/** Escapa un campo y neutraliza inyección de fórmulas (=, +, -, @, tab, CR). */
export function csvField(value) {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[";\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

const formatAmount = (cents) => {
  const abs = Math.abs(cents);
  return `${cents < 0 ? '-' : ''}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
};

/**
 * @param {{ date: Date, description: string, merchant?: string|null, amountCents: number,
 *           currency: string, source: string, category?: { name: string } }[]} expenses
 */
export function toCsv(expenses) {
  const lines = [CSV_HEADERS.join(';')];
  for (const e of expenses) {
    lines.push(
      [
        new Date(e.date).toISOString().slice(0, 10),
        e.kind === 'INCOME' ? 'ingreso' : 'gasto',
        e.description,
        e.merchant ?? '',
        e.category?.name ?? '',
        formatAmount(e.amountCents),
        e.currency,
        e.source === 'BANK' ? 'banco' : 'manual',
      ]
        .map(csvField)
        .join(';'),
    );
  }
  return BOM + lines.join('\r\n') + '\r\n';
}
