import { inject } from 'vitest';

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
  CLIENT_ORIGIN: 'http://localhost:5173',
  FREE_MONTHLY_EXPENSES: '5',
});
