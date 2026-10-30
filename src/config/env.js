import 'dotenv/config';
import { z } from 'zod';

// Lista separada por comas -> array sin vacíos.
const csv = z
  .string()
  .default('')
  .transform((s) =>
    s
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean),
  );

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatoria'),

  // Orígenes del frontend autorizados para CORS (en prod el frontend va por proxy same-origin).
  CLIENT_ORIGIN: csv,
  // URL pública del frontend: a ella vuelve el flujo de Tink.
  APP_URL: z.url().default('http://localhost:5173'),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  // Nº de proxies delante de la API, para que rate-limit vea la IP real del cliente.
  // Vercel (rewrite) -> Railway = 2. En local, 0.
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),

  ANTHROPIC_API_KEY: z.string().optional(),
  // Modelos configurables: categorizar a escala puede ir con un modelo más barato.
  CLAUDE_MODEL_INSIGHTS: z.string().default('claude-opus-5-5'),
  CLAUDE_MODEL_CATEGORIZE: z.string().default('claude-opus-5-5'),

  TINK_CLIENT_ID: z.string().optional(),
  TINK_CLIENT_SECRET: z.string().optional(),
  // Debe coincidir exactamente con la redirect URI registrada en la consola de Tink.
  TINK_REDIRECT_URI: z.url().optional(),
  TINK_MARKET: z.string().default('ES'),
  TINK_LOCALE: z.string().default('es_ES'),
  // Modo test de Tink Link (Demo Bank).
  TINK_TEST_MODE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),

  FREE_MONTHLY_EXPENSES: z.coerce.number().int().positive().default(50),
});

export function parseEnv(source = process.env) {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Variables de entorno inválidas:\n${issues}`);
  }
  return result.data;
}

export const env = parseEnv();

export const isProd = env.NODE_ENV === 'production';
export const tinkEnabled = Boolean(env.TINK_CLIENT_ID && env.TINK_CLIENT_SECRET && env.TINK_REDIRECT_URI);
export const aiEnabled = Boolean(env.ANTHROPIC_API_KEY);
