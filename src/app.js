import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { requireAuth } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { generalLimiter } from './middleware/rateLimit.js';
import { insightsRouter } from './modules/ai/insights.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { bankRouter } from './modules/bank/bank.routes.js';
import { categoriesRouter } from './modules/categories/categories.routes.js';
import { expensesRouter } from './modules/expenses/expenses.routes.js';
import { statsRouter } from './modules/stats/stats.routes.js';
import { getUsage } from './modules/usage/quota.js';

/** Construye la app sin escuchar en ningún puerto (así supertest la usa directamente). */
export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  if (env.TRUST_PROXY) app.set('trust proxy', 1);

  app.use(helmet());
  app.use(
    cors({
      // Solo los orígenes de la allowlist; sin Origin (curl, proxy same-origin) se permite.
      origin: (origin, cb) => cb(null, !origin || env.CLIENT_ORIGIN.includes(origin)),
      credentials: true,
    }),
  );
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/api/health' } }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use('/api', generalLimiter);

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

  app.use('/api/auth', authRouter);
  app.use('/api/categories', requireAuth, categoriesRouter);
  app.use('/api/expenses', requireAuth, expensesRouter);
  app.use('/api/stats', requireAuth, statsRouter);
  app.use('/api/insights', requireAuth, insightsRouter);
  app.use('/api/bank', requireAuth, bankRouter);
  app.get('/api/usage', requireAuth, async (req, res) => res.json(await getUsage(req.user)));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
