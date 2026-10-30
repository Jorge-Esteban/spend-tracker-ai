import { createApp } from './app.js';
import { aiEnabled, env, tinkEnabled } from './config/env.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, ai: aiEnabled, tink: tinkEnabled }, 'API de Spend Tracker AI escuchando');
});

async function shutdown(signal) {
  logger.info({ signal }, 'Cerrando servidor');
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  // Si algo cuelga, salir igualmente.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
