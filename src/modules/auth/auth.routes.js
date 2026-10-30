import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { conflict, unauthorized } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { AUTH_COOKIE, cookieOptions, requireAuth, signSession } from '../../middleware/auth.js';
import { authLimiter } from '../../middleware/rateLimit.js';
import { DEFAULT_CATEGORIES } from '../categories/defaults.js';
import { loginSchema, registerSchema } from './auth.schemas.js';

const BCRYPT_ROUNDS = process.env.NODE_ENV === 'test' ? 4 : 12;
// Hash fijo para igualar el tiempo de respuesta cuando el email no existe.
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', BCRYPT_ROUNDS);

const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, plan: u.plan, createdAt: u.createdAt });

export const authRouter = Router();

authRouter.post('/register', authLimiter, async (req, res) => {
  const { email, password, name } = registerSchema.parse(req.body);

  const exists = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (exists) throw conflict('Ya existe una cuenta con ese email', 'EMAIL_TAKEN');

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      name,
      categories: { create: DEFAULT_CATEGORIES },
    },
  });

  res.cookie(AUTH_COOKIE, signSession(user), cookieOptions());
  res.status(201).json({ user: publicUser(user) });
});

authRouter.post('/login', authLimiter, async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);

  const user = await prisma.user.findUnique({ where: { email } });
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) throw unauthorized('Email o contraseña incorrectos');

  res.cookie(AUTH_COOKIE, signSession(user), cookieOptions());
  res.json({ user: publicUser(user) });
});

authRouter.post('/logout', (_req, res) => {
  const { maxAge: _maxAge, ...opts } = cookieOptions();
  res.clearCookie(AUTH_COOKIE, opts);
  res.status(204).end();
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});
