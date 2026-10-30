import { z } from 'zod';

// Primero se normaliza (espacios, mayúsculas) y después se valida el formato.
const email = z.string().trim().toLowerCase().pipe(z.email('Email no válido').max(254));

export const registerSchema = z.object({
  email,
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(128),
  name: z.string().trim().min(1).max(80).optional(),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(128),
});
