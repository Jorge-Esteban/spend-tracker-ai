import jwt from 'jsonwebtoken';
import { env, isProd } from '../config/env.js';
import { unauthorized } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';

export const AUTH_COOKIE = 'st_session';

export function signSession(user) {
  return jwt.sign({ sub: user.id }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });
}

export function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

/** Exige sesión válida y deja en req.user el usuario (sin hash de contraseña). */
export async function requireAuth(req, _res, next) {
  const token = req.cookies?.[AUTH_COOKIE];
  if (!token) throw unauthorized();

  let payload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET);
  } catch {
    throw unauthorized('Sesión caducada o inválida');
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, email: true, name: true, plan: true, createdAt: true },
  });
  if (!user) throw unauthorized('Sesión inválida');

  req.user = user;
  next();
}
