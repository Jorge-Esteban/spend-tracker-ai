import { z } from 'zod';
import { isMonthKey } from '../../lib/dates.js';
import { toCents } from '../../lib/money.js';
import { objectId } from '../../middleware/validate.js';
import { kindSchema } from '../categories/categories.schemas.js';

const MAX_CENTS = 100_000_000; // 1 millón de euros

// Acepta 12.5, "12,50" o "12.50" y lo convierte a céntimos. Rechaza NaN, 0 y negativos.
export const amountSchema = z
  .union([z.number(), z.string()])
  .transform((v, ctx) => {
    const cents = toCents(v);
    if (!Number.isInteger(cents) || cents <= 0 || cents > MAX_CENTS) {
      ctx.addIssue({ code: 'custom', message: 'Importe no válido (mayor que 0 y con máximo 2 decimales)' });
      return z.NEVER;
    }
    return cents;
  });

// "YYYY-MM-DD" se interpreta como día natural en UTC.
export const dateSchema = z
  .union([z.iso.date(), z.iso.datetime({ offset: true })])
  .transform((v) => new Date(v.length === 10 ? `${v}T00:00:00.000Z` : v));

const entryFields = {
  amount: amountSchema,
  description: z.string().trim().min(1, 'La descripción es obligatoria').max(200),
  merchant: z.string().trim().max(120).optional().nullable(),
  date: dateSchema,
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .default('EUR'),
  // Sin categoría -> se categoriza automáticamente (regla -> IA -> reserva del tipo).
  categoryId: objectId.optional(),
};

// Movimiento: gasto (por defecto) o ingreso. El importe siempre es positivo.
export const createExpenseSchema = z.object({ ...entryFields, kind: kindSchema.default('EXPENSE') });

const { currency: _currency, ...updatable } = entryFields;
export const updateExpenseSchema = z
  .object({ ...updatable, kind: kindSchema })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nada que actualizar' });

export const listExpensesQuery = z.object({
  month: z.string().refine(isMonthKey, 'Formato de mes YYYY-MM').optional(),
  categoryId: objectId.optional(),
  kind: kindSchema.optional(),
  q: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});
