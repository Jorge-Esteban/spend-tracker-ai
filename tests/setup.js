import { generateKeyPairSync } from 'node:crypto';
import { inject } from 'vitest';

// Clave RSA desechable para firmar los JWT de Enable Banking en los tests.
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });

// Entorno de test: valores ficticios, nunca secretos reales.
Object.assign(process.env, {
  NODE_ENV: 'test',
  // Los unitarios no arrancan MongoDB: basta una URL que nunca se usa.
  DATABASE_URL: inject('databaseUrl') ?? 'mongodb://127.0.0.1:1/sin-bd-en-tests-unitarios',
  JWT_SECRET: 'test-secret-que-tiene-mas-de-32-caracteres!!',
  ANTHROPIC_API_KEY: 'test-key',
  TINK_CLIENT_ID: 'test-client-id',
  TINK_CLIENT_SECRET: 'test-client-secret',
  TINK_REDIRECT_URI: 'http://localhost:5173/bank/callback',
  ENABLE_BANKING_APP_ID: 'test-app-id',
  // Con los saltos de línea escapados, igual que en una variable de entorno de Railway.
  ENABLE_BANKING_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }).replace(/\n/g, '\\n'),
  ENABLE_BANKING_REDIRECT_URI: 'https://localhost:5173/bank/callback',
  CLIENT_ORIGIN: 'http://localhost:5173',
  FREE_MONTHLY_EXPENSES: '5',
});
