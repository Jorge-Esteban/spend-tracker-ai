import pino from 'pino';
import { env, isProd } from '../config/env.js';

export const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
  // Nunca registrar credenciales, cookies ni códigos OAuth.
  redact: {
    paths: [
      'req.headers.cookie',
      'req.headers.authorization',
      'res.headers["set-cookie"]',
      'req.query.code',
      'req.query.state',
      '*.password',
      '*.passwordHash',
      '*.access_token',
      '*.client_secret',
    ],
    censor: '[REDACTED]',
  },
  ...(isProd ? {} : { transport: { target: 'pino-pretty', options: { colorize: true } } }),
});
