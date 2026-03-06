const request = require('supertest');
const { startTestServer, stopTestServer, cleanupTempDirs } = require('../setup');

let ctx;

beforeAll(async () => { ctx = await startTestServer(); });
afterAll(async () => { await stopTestServer(ctx); cleanupTempDirs(); });

describe('Cookie API', () => {
  describe('PUT /api/cookies', () => {
    test('saves cookies for a user', async () => {
      const res = await request(ctx.server).put('/api/cookies')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ name: 'alice', cookies: 'li_at=abc123; JSESSIONID=xyz', setActive: true });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('saved');
      expect(res.body.active).toBe('alice');
    });

    test('rejects missing name', async () => {
      const res = await request(ctx.server).put('/api/cookies')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ cookies: 'li_at=abc' });
      expect(res.status).toBe(400);
    });

    test('rejects missing cookies string', async () => {
      const res = await request(ctx.server).put('/api/cookies')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ name: 'bob' });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/cookies', () => {
    test('returns saved cookies', async () => {
      const res = await request(ctx.server).get('/api/cookies')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.active).toBe('alice');
      expect(res.body.users.length).toBeGreaterThanOrEqual(1);
      expect(res.body.users[0]).toHaveProperty('cookieCount');
    });
  });

  describe('POST /api/cookies/activate', () => {
    test('activates existing cookie user', async () => {
      // First save another user
      await request(ctx.server).put('/api/cookies')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ name: 'bob', cookies: 'li_at=def456' });
      const res = await request(ctx.server).post('/api/cookies/activate')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ name: 'bob' });
      expect(res.status).toBe(200);
      expect(res.body.active).toBe('bob');
    });

    test('returns 404 for nonexistent cookie user', async () => {
      const res = await request(ctx.server).post('/api/cookies/activate')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ name: 'nobody' });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/cookies/:name', () => {
    test('deletes cookie user', async () => {
      await request(ctx.server).put('/api/cookies')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ name: 'deleteme', cookies: 'li_at=temp' });
      const res = await request(ctx.server).delete('/api/cookies/deleteme')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('deleted');
    });

    test('returns 404 for nonexistent', async () => {
      const res = await request(ctx.server).delete('/api/cookies/ghost')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).toBe(404);
    });

    test('clears active when deleting active user', async () => {
      await request(ctx.server).put('/api/cookies')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ name: 'activeone', cookies: 'li_at=x', setActive: true });
      await request(ctx.server).delete('/api/cookies/activeone')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      const check = await request(ctx.server).get('/api/cookies')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(check.body.active).not.toBe('activeone');
    });
  });
});
