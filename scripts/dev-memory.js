#!/usr/bin/env node
// Arranca la API contra un MongoDB en memoria: sirve para probar la app sin Atlas.
// Los datos se pierden al parar. Uso: npm run dev:memory
import { execSync } from 'node:child_process';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import 'dotenv/config';

const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
process.env.DATABASE_URL = replSet.getUri('spendtracker_dev');
process.env.JWT_SECRET ??= 'solo-para-desarrollo-local-no-usar-en-produccion';

execSync('npx prisma db push --skip-generate', { env: process.env, stdio: 'inherit' });
console.log('MongoDB en memoria listo (los datos se borran al parar).');

await import('../src/server.js');

const stop = async () => {
  await replSet.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
