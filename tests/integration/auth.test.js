import { beforeEach, describe, expect, it } from 'vitest';
import { app, registerUser, request, resetDb } from '../helpers.js';

beforeEach(resetDb);

describe('auth', () => {
  it('registro: cookie httpOnly SameSite=Lax, sin hash en la respuesta y categorías sembradas', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'Ana@Test.dev', password: 'contraseña-segura', name: 'Ana' })
      .expect(201);

    const cookie = res.headers['set-cookie'][0];
    expect(cookie).toMatch(/^st_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(res.body.user).toMatchObject({ email: 'ana@test.dev', plan: 'FREE' });
    expect(res.body.user.passwordHash).toBeUndefined();

    const { categories } = await registerUser();
    expect(Object.keys(categories)).toHaveLength(11);
    expect(categories.Otros).toMatchObject({ isFallback: true, kind: 'EXPENSE' });
    expect(categories['Otros ingresos']).toMatchObject({ isFallback: true, kind: 'INCOME' });
    expect(categories['Nómina'].kind).toBe('INCOME');
  });

  it('email duplicado -> 409', async () => {
    const { credentials } = await registerUser();
    const res = await request(app).post('/api/auth/register').send(credentials).expect(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('login correcto, contraseña incorrecta y email inexistente', async () => {
    const { credentials } = await registerUser();
    await request(app).post('/api/auth/login').send(credentials).expect(200);
    const bad = await request(app)
      .post('/api/auth/login')
      .send({ ...credentials, password: 'otra-cosa-123' })
      .expect(401);
    expect(bad.body.error.message).toBe('Email o contraseña incorrectos');
    await request(app).post('/api/auth/login').send({ email: 'nadie@test.dev', password: 'x' }).expect(401);
  });

  it('/me exige sesión; logout la borra', async () => {
    await request(app).get('/api/auth/me').expect(401);
    await request(app).get('/api/auth/me').set('Cookie', 'st_session=token-falso').expect(401);

    const { agent, user } = await registerUser();
    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body.user.id).toBe(user.id);

    const out = await agent.post('/api/auth/logout').expect(204);
    expect(out.headers['set-cookie'][0]).toMatch(/st_session=;/);
    await agent.get('/api/auth/me').expect(401);
  });

  it('valida el body del registro', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'no-es-email', password: '1' }).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.issues.map((i) => i.path)).toEqual(expect.arrayContaining(['email', 'password']));
  });

  it('JSON mal formado -> 400 y rutas desconocidas -> 404', async () => {
    await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{"x":').expect(400);
    await request(app).get('/api/no-existe').expect(404);
  });

  it('CORS solo para orígenes permitidos', async () => {
    const ok = await request(app).get('/api/health').set('Origin', 'http://localhost:5173');
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(ok.headers['access-control-allow-credentials']).toBe('true');
    const evil = await request(app).get('/api/health').set('Origin', 'https://evil.example');
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();
  });
});
