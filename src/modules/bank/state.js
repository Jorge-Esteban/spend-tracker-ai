// `state` OAuth firmado: liga la vuelta de Tink al usuario que inició el flujo (anti-CSRF).
import { randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { badRequest } from '../../lib/errors.js';

const PURPOSE = 'tink-link';

export function createState(userId) {
  return jwt.sign({ sub: userId, purpose: PURPOSE, nonce: randomBytes(12).toString('hex') }, env.JWT_SECRET, {
    expiresIn: '15m',
  });
}

export function verifyState(state, userId) {
  try {
    const payload = jwt.verify(state, env.JWT_SECRET);
    if (payload.purpose !== PURPOSE || payload.sub !== userId) throw new Error('mismatch');
    return payload;
  } catch {
    throw badRequest('El enlace con el banco no es válido o ha caducado. Vuelve a empezar.', 'INVALID_STATE');
  }
}
