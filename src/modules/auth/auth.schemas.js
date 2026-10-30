import { z } from 'zod';

export const registerSchema = z.object({
  email: z.email('Email no válido').trim().toLowerCase(),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(128),
  name: z.string().trim().min(1).max(80).optional(),
});

export const loginSchema = z.object({
  email: z.email('Email no válido').trim().toLowerCase(),
  password: z.string().min(1).max(128),
});
