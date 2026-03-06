const request = require('supertest');
const { startTestServer, stopTestServer, cleanupTempDirs } = require('../setup');

let ctx;

beforeAll(async () => { ctx = await startTestServer(); });
afterAll(async () => { await stopTestServer(ctx); cleanupTempDirs(); });

describe('Legacy API Routes', () => {
  describe('GET /api/status', () => {
    test('returns status object', async () => {
      const res = await request(ctx.server).get('/api/status')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('running');
      expect(res.body).toHaveProperty('browserConnected');
      expect(res.body).toHaveProperty('pendingReview');
    });

    test('requires auth', async () => {
      const res = await request(ctx.server).get('/api/status');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/run', () => {
    test('starts a run', async () => {
      const res = await request(ctx.server).post('/api/run')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ run_mode: 'dry_run', project_url: 'https://test.com' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('started');
    });
  });

  describe('POST /api/stop', () => {
    test('requests stop', async () => {
      const res = await request(ctx.server).post('/api/stop')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('stop_requested');
    });
  });

  describe('GET /api/history', () => {
    test('returns history object', async () => {
      const res = await request(ctx.server).get('/api/history')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('candidates');
      expect(res.body).toHaveProperty('runs');
    });
  });

  describe('GET /api/pending', () => {
    test('returns pending candidates array', async () => {
      const res = await request(ctx.server).get('/api/pending')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('POST /api/regenerate/:id', () => {
    test('regenerates message for candidate', async () => {
      // Create a candidate first
      const candidateId = ctx.store.createCandidate({
        name: 'Regen Test', headline: 'Engineer', run_mode: 'dry_run',
        userId: 'testadmin', profile_data: { name: 'Regen Test', headline: 'Engineer' },
      });
      ctx.store.updateCandidate(candidateId, { message: 'Old message' });

      const res = await request(ctx.server).post(`/api/regenerate/${candidateId}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ feedback: 'Make it shorter' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('regenerated');
      expect(res.body.message).toBeTruthy();
    });

    test('rejects missing feedback', async () => {
      const res = await request(ctx.server).post('/api/regenerate/someid')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({});
      expect(res.status).toBe(400);
    });

    test('returns 404 for nonexistent candidate', async () => {
      const res = await request(ctx.server).post('/api/regenerate/nonexistent')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ feedback: 'test' });
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/approve/:id', () => {
    test('approves candidate', async () => {
      const id = ctx.store.createCandidate({ name: 'Approve Test', headline: '', run_mode: 'manual_review' });
      ctx.store.updateCandidate(id, { status: 'pending_review', message: 'Hello' });
      const res = await request(ctx.server).post(`/api/approve/${id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /api/skip/:id', () => {
    test('skips candidate', async () => {
      const id = ctx.store.createCandidate({ name: 'Skip Test', headline: '', run_mode: 'dry_run' });
      const res = await request(ctx.server).post(`/api/skip/${id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('skipped');
    });
  });

  describe('POST /api/force-reset', () => {
    test('resets run state', async () => {
      const res = await request(ctx.server).post('/api/force-reset')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('reset');
    });
  });

  describe('GET /health', () => {
    test('returns health check without auth', async () => {
      const res = await request(ctx.server).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });
});
