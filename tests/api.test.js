const request = require('supertest');
const app = require('../src/app');
const db = require('../src/db');
const { ensureSchema } = require('../src/schema');

const creds = { email: 'alice@example.com', password: 'password123' };

async function registerAndLogin(c = creds) {
  await request(app).post('/api/auth/register').send(c);
  const res = await request(app).post('/api/auth/login').send(c);
  return res.body.token;
}

beforeAll(async () => {
  await ensureSchema(db);
});
afterAll(async () => {
  await db.destroy();
});
beforeEach(async () => {
  await db('clicks').del();
  await db('links').del();
  await db('users').del();
});

describe('auth', () => {
  test('registers a user and rejects duplicates', async () => {
    const first = await request(app).post('/api/auth/register').send(creds);
    expect(first.status).toBe(201);
    const dup = await request(app).post('/api/auth/register').send(creds);
    expect(dup.status).toBe(409);
  });

  test('rejects weak passwords and bad emails', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'nope', password: '123' });
    expect(res.status).toBe(400);
  });

  test('login returns a token, wrong password is 401', async () => {
    await request(app).post('/api/auth/register').send(creds);
    const ok = await request(app).post('/api/auth/login').send(creds);
    expect(ok.status).toBe(200);
    expect(ok.body.token).toBeDefined();
    const bad = await request(app).post('/api/auth/login').send({ ...creds, password: 'wrongpass1' });
    expect(bad.status).toBe(401);
  });
});

describe('links', () => {
  test('requires authentication', async () => {
    const res = await request(app).post('/api/links').send({ url: 'https://example.com' });
    expect(res.status).toBe(401);
  });

  test('creates a link, redirects, and counts the click', async () => {
    const token = await registerAndLogin();
    const created = await request(app)
      .post('/api/links')
      .set('Authorization', `Bearer ${token}`)
      .send({ url: 'https://example.com/page' });
    expect(created.status).toBe(201);
    const { code } = created.body;

    const redirect = await request(app).get(`/${code}`).set('Referer', 'https://news.example.org');
    expect(redirect.status).toBe(302);
    expect(redirect.headers.location).toBe('https://example.com/page');

    const stats = await request(app).get(`/api/links/${code}/stats`).set('Authorization', `Bearer ${token}`);
    expect(stats.status).toBe(200);
    expect(stats.body.clickCount).toBe(1);
    expect(stats.body.last30Days.byReferrer['https://news.example.org']).toBe(1);
  });

  test('supports custom codes and rejects duplicates', async () => {
    const token = await registerAndLogin();
    const body = { url: 'https://example.com', customCode: 'my-link' };
    const a = await request(app).post('/api/links').set('Authorization', `Bearer ${token}`).send(body);
    expect(a.status).toBe(201);
    const b = await request(app).post('/api/links').set('Authorization', `Bearer ${token}`).send(body);
    expect(b.status).toBe(409);
  });

  test('rejects non-http URLs', async () => {
    const token = await registerAndLogin();
    const res = await request(app)
      .post('/api/links')
      .set('Authorization', `Bearer ${token}`)
      .send({ url: 'javascript:alert(1)' });
    expect(res.status).toBe(400);
  });

  test('expired links return 410', async () => {
    const token = await registerAndLogin();
    const created = await request(app)
      .post('/api/links')
      .set('Authorization', `Bearer ${token}`)
      .send({ url: 'https://example.com', expiresAt: new Date(Date.now() + 60_000).toISOString() });
    await db('links').where({ code: created.body.code }).update({ expires_at: Date.now() - 1000 });
    const res = await request(app).get(`/${created.body.code}`);
    expect(res.status).toBe(410);
  });

  test('unknown code returns 404', async () => {
    const res = await request(app).get('/doesnotexist');
    expect(res.status).toBe(404);
  });

  test("users cannot see or delete each other's links", async () => {
    const alice = await registerAndLogin();
    const bob = await registerAndLogin({ email: 'bob@example.com', password: 'password123' });
    const created = await request(app)
      .post('/api/links')
      .set('Authorization', `Bearer ${alice}`)
      .send({ url: 'https://example.com' });

    const stats = await request(app).get(`/api/links/${created.body.code}/stats`).set('Authorization', `Bearer ${bob}`);
    expect(stats.status).toBe(404);
    const del = await request(app).delete(`/api/links/${created.body.code}`).set('Authorization', `Bearer ${bob}`);
    expect(del.status).toBe(404);
  });

  test('lists links with pagination and deletes', async () => {
    const token = await registerAndLogin();
    for (let i = 0; i < 3; i++) {
      await request(app).post('/api/links').set('Authorization', `Bearer ${token}`).send({ url: `https://example.com/${i}` });
    }
    const list = await request(app).get('/api/links?limit=2&page=1').set('Authorization', `Bearer ${token}`);
    expect(list.body.total).toBe(3);
    expect(list.body.items).toHaveLength(2);

    const code = list.body.items[0].code;
    const del = await request(app).delete(`/api/links/${code}`).set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(204);
  });
});
