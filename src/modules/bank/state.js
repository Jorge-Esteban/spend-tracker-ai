// `state` OAuth firmado: liga la vuelta del banco al usuario que inició el flujo (anti-CSRF)
// y recuerda con qué proveedor (Tink o Enable Banking) y banco se empezó.
import { randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { badRequest } from '../../lib/errors.js';

const PURPOSE = 'bank-link';

export function createState(userId, { provider = 'tink', aspsp } = {}) {
  return jwt.sign(
    { sub: userId, purpose: PURPOSE, provider, aspsp, nonce: randomBytes(12).toString('hex') },
    env.JWT_SECRET,
    { expiresIn: '15m' },
  );
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
