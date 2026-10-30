import { z } from 'zod';

const hexColor = z.string().regex(/^#[0-9a-f]{6}$/i, 'Color en formato #rrggbb');

// Presupuesto en euros desde la UI -> céntimos. null quita el presupuesto.
const budgetCents = z
  .number()
  .nonnegative()
  .max(1_000_000)
  .transform((v) => Math.round(v * 100))
  .nullable();

export const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(40),
  color: hexColor.optional(),
  icon: z.string().trim().min(1).max(8).optional(),
  monthlyBudget: budgetCents.optional(),
});

export const updateCategorySchema = createCategorySchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nada que actualizar' });
