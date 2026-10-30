import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

export const app = createApp();

export async function resetDb() {
  await prisma.aiInsight.deleteMany();
  await prisma.usageCounter.deleteMany();
  await prisma.merchantRule.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.category.deleteMany();
  await prisma.user.deleteMany();
}

let seq = 0;

/** Registra un usuario nuevo y devuelve un agente de supertest con su cookie de sesión. */
export async function registerUser(overrides = {}) {
  const agent = request.agent(app);
  seq += 1;
  const body = { email: `user${seq}-${Date.now()}@test.dev`, password: 'contraseña-segura', ...overrides };
  const res = await agent.post('/api/auth/register').send(body).expect(201);
  const categories = (await agent.get('/api/categories').expect(200)).body.categories;
  const byName = Object.fromEntries(categories.map((c) => [c.name, c]));
  return { agent, user: res.body.user, categories: byName, credentials: body };
}

export const today = () => new Date().toISOString().slice(0, 10);

export { prisma, request };
