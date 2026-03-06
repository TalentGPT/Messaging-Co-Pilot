const request = require('supertest');
const { startTestServer, stopTestServer, cleanupTempDirs } = require('../setup');

let ctx;

beforeAll(async () => { ctx = await startTestServer(); });
afterAll(async () => { await stopTestServer(ctx); cleanupTempDirs(); });

describe('Auth API', () => {
  describe('POST /api/auth/login', () => {
    test('returns token for valid credentials', async () => {
      const res = await request(ctx.server).post('/api/auth/login')
        .send({ username: 'testadmin', password: 'testpass' });
      expect(res.status).toBe(200);
      expect(res.body.token).toBeTruthy();
      expect(res.body.user.username).toBe('testadmin');
      expect(res.body.user.role).toBe('admin');
    });

    test('rejects invalid password', async () => {
      const res = await request(ctx.server).post('/api/auth/login')
        .send({ username: 'testadmin', password: 'wrong' });
      expect(res.status).toBe(401);
    });

    test('rejects nonexistent user', async () => {
      const res = await request(ctx.server).post('/api/auth/login')
        .send({ username: 'nobody', password: 'pass' });
      expect(res.status).toBe(401);
    });

    test('requires username and password', async () => {
      const res = await request(ctx.server).post('/api/auth/login').send({});
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/auth/me', () => {
    test('returns user info with valid token', async () => {
      const res = await request(ctx.server).get('/api/auth/me')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.username).toBe('testadmin');
    });

    test('rejects request without token', async () => {
      const res = await request(ctx.server).get('/api/auth/me');
      expect(res.status).toBe(401);
    });

    test('rejects invalid token', async () => {
      const res = await request(ctx.server).get('/api/auth/me')
        .set('Authorization', 'Bearer invalidtoken');
      expect(res.status).toBe(401);
    });

    test('accepts token from cookie', async () => {
      const res = await request(ctx.server).get('/api/auth/me')
        .set('Cookie', `token=${ctx.adminToken}`);
      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/auth/register', () => {
    test('admin can register new user', async () => {
      const res = await request(ctx.server).post('/api/auth/register')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ username: 'newuser', password: 'newpass' });
      expect(res.status).toBe(200);
      expect(res.body.user.username).toBe('newuser');
    });

    test('non-admin cannot register', async () => {
      const res = await request(ctx.server).post('/api/auth/register')
        .set('Authorization', `Bearer ${ctx.userToken}`)
        .send({ username: 'another', password: 'pass' });
      expect(res.status).toBe(403);
    });

    test('rejects duplicate username', async () => {
      const res = await request(ctx.server).post('/api/auth/register')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ username: 'testadmin', password: 'pass' });
      expect(res.status).toBe(409);
    });
  });

  describe('POST /api/auth/change-password', () => {
    test('changes password successfully', async () => {
      const res = await request(ctx.server).post('/api/auth/change-password')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ password: 'newpassword' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('password_changed');
    });

    test('rejects short password', async () => {
      const res = await request(ctx.server).post('/api/auth/change-password')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ password: 'ab' });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/auth/logout', () => {
    test('returns logged_out status', async () => {
      const res = await request(ctx.server).post('/api/auth/logout');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('logged_out');
    });
  });
});
