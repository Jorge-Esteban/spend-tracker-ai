// Arranca un MongoDB en memoria (replica set: Prisma lo necesita para transacciones)
// y crea los índices del esquema. Nunca toca la base de datos real.
import { execSync } from 'node:child_process';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

export default async function setup({ provide }) {
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  const databaseUrl = replSet.getUri('spendtracker_test');

  execSync('npx prisma db push --skip-generate', {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe',
  });

  provide('databaseUrl', databaseUrl);
  return async () => {
    await replSet.stop();
  };
}
