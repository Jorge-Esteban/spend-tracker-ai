import { rateLimit } from 'express-rate-limit';
import { env } from '../config/env.js';
import { AppError } from '../lib/errors.js';

const message = (msg) => ({ error: { code: 'RATE_LIMITED', message: msg } });
const skip = () => env.NODE_ENV === 'test';

export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: message('Demasiadas peticiones, prueba en unos minutos'),
  skip,
});

// Login/registro: frena fuerza bruta.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: message('Demasiados intentos, espera 15 minutos'),
  skip,
});

// IA: por usuario (no por IP), porque cada llamada cuesta dinero.
export const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => `user:${req.user.id}`,
  // Se invoca a mano desde las rutas de IA: devuelve el error en vez de responder.
  handler: (_req, _res, next) =>
    next(new AppError(429, 'Has alcanzado el límite de análisis por hora', 'RATE_LIMITED')),
  skip,
});
