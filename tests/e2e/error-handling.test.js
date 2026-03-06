const request = require('supertest');
const { startTestServer, stopTestServer, cleanupTempDirs } = require('../setup');

let ctx;

beforeAll(async () => { ctx = await startTestServer(); });
afterAll(async () => { await stopTestServer(ctx); cleanupTempDirs(); });

describe('Error Handling', () => {
  describe('Auth errors', () => {
    test('expired token is rejected', async () => {
      const jwt = require('jsonwebtoken');
      const expiredToken = jwt.sign(
        { id: 'testadmin', username: 'testadmin', role: 'admin' },
        process.env.JWT_SECRET,
        { expiresIn: '0s' }
      );
      // Wait briefly for expiry
      await new Promise(r => setTimeout(r, 100));
      const res = await request(ctx.server).get('/api/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`);
      expect(res.status).toBe(401);
    });

    test('malformed JWT is rejected', async () => {
      const res = await request(ctx.server).get('/api/auth/me')
        .set('Authorization', 'Bearer not.a.jwt');
      expect(res.status).toBe(401);
    });

    test('missing Authorization header returns 401', async () => {
      const res = await request(ctx.server).get('/api/campaigns');
      expect(res.status).toBe(401);
    });
  });

  describe('Campaign errors', () => {
    test('404 on nonexistent campaign GET', async () => {
      const res = await request(ctx.server).get('/api/campaigns/nonexistent')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).toBe(404);
    });

    test('404 on nonexistent campaign PUT', async () => {
      const res = await request(ctx.server).put('/api/campaigns/nonexistent')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ name: 'X' });
      expect(res.status).toBe(404);
    });

    test('404 on nonexistent campaign analytics', async () => {
      const res = await request(ctx.server).get('/api/campaigns/nonexistent/analytics')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).toBe(404);
    });
  });

  describe('Candidate errors', () => {
    test('404 on improve nonexistent candidate', async () => {
      const res = await request(ctx.server).post('/api/candidates/fake/improve')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ feedbackType: 'too_long' });
      expect(res.status).toBe(404);
    });

    test('404 on approve nonexistent candidate', async () => {
      const res = await request(ctx.server).post('/api/candidates/fake/approve')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).toBe(404);
    });

    test('400 on improve without feedbackType', async () => {
      const id = ctx.store.createCandidate({ name: 'X', headline: '', run_mode: 'dry_run' });
      const res = await request(ctx.server).post(`/api/candidates/${id}/improve`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({});
      expect(res.status).toBe(400);
    });
  });

  describe('Cookie errors', () => {
    test('400 on cookie save without name', async () => {
      const res = await request(ctx.server).put('/api/cookies')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ cookies: 'li_at=abc' });
      expect(res.status).toBe(400);
    });

    test('400 on cookie save without cookies', async () => {
      const res = await request(ctx.server).put('/api/cookies')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ name: 'test' });
      expect(res.status).toBe(400);
    });

    test('404 on activate nonexistent cookie user', async () => {
      const res = await request(ctx.server).post('/api/cookies/activate')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ name: 'ghost' });
      expect(res.status).toBe(404);
    });

    test('404 on delete nonexistent cookie user', async () => {
      const res = await request(ctx.server).delete('/api/cookies/ghost')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).toBe(404);
    });
  });

  describe('Feedback errors', () => {
    test('400 on empty campaign feedback', async () => {
      const c = await request(ctx.server).post('/api/campaigns')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ name: 'ErrorTest', context: 'ctx' });
      const res = await request(ctx.server).post(`/api/campaigns/${c.body.id}/feedback`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ feedback: '' });
      expect(res.status).toBe(400);
    });

    test('400 on regenerate without feedback', async () => {
      const res = await request(ctx.server).post('/api/regenerate/someid')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({});
      expect(res.status).toBe(400);
    });
  });

  describe('Registration errors', () => {
    test('non-admin cannot register users', async () => {
      const res = await request(ctx.server).post('/api/auth/register')
        .set('Authorization', `Bearer ${ctx.userToken}`)
        .send({ username: 'hacker', password: 'pass' });
      expect(res.status).toBe(403);
    });

    test('short password rejected for change-password', async () => {
      const res = await request(ctx.server).post('/api/auth/change-password')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ password: 'ab' });
      expect(res.status).toBe(400);
    });
  });
});
