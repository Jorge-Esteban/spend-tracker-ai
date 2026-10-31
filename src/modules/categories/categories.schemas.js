import { z } from 'zod';

const hexColor = z.string().regex(/^#[0-9a-f]{6}$/i, 'Color en formato #rrggbb');

export const kindSchema = z.enum(['EXPENSE', 'INCOME']);

// Presupuesto en euros desde la UI -> céntimos. null quita el presupuesto.
const budgetCents = z
  .number()
  .nonnegative()
  .max(1_000_000)
  .transform((v) => Math.round(v * 100))
  .nullable();

const fields = {
  name: z.string().trim().min(1).max(40),
  color: hexColor.optional(),
  icon: z.string().trim().min(1).max(8).optional(),
  monthlyBudget: budgetCents.optional(),
};

export const createCategorySchema = z
  .object({ ...fields, kind: kindSchema.default('EXPENSE') })
  .refine((v) => v.kind === 'EXPENSE' || v.monthlyBudget == null, {
    message: 'Los presupuestos son solo para categorías de gasto',
    path: ['monthlyBudget'],
  });

// El tipo no se cambia después: los movimientos de la categoría dejarían de cuadrar.
export const updateCategorySchema = z
  .object(fields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nada que actualizar' });
