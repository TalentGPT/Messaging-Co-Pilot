const request = require('supertest');
const { startTestServer, stopTestServer, cleanupTempDirs } = require('../setup');

let ctx;

beforeAll(async () => { ctx = await startTestServer(); });
afterAll(async () => { await stopTestServer(ctx); cleanupTempDirs(); });

describe('Campaign API', () => {
  let campaignId;

  describe('POST /api/campaigns', () => {
    test('creates a campaign', async () => {
      const res = await request(ctx.server).post('/api/campaigns')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ name: 'Test Campaign', type: 'recruiting', context: 'Senior engineers needed', outcome: 'Book calls', tone: 'professional' });
      expect(res.status).toBe(200);
      expect(res.body.id).toBeTruthy();
      expect(res.body.name).toBe('Test Campaign');
      expect(res.body.outcome).toBe('Book calls');
      campaignId = res.body.id;
    });

    test('creates with prompt and initializes promptLibrary', async () => {
      const res = await request(ctx.server).post('/api/campaigns')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ name: 'With Prompt', prompt: 'Custom prompt text' });
      expect(res.body.promptLibrary).toHaveLength(1);
      expect(res.body.promptLibrary[0].active).toBe(true);
    });
  });

  describe('GET /api/campaigns', () => {
    test('lists user campaigns', async () => {
      const res = await request(ctx.server).get('/api/campaigns')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });

    test('scopes campaigns to user', async () => {
      const res = await request(ctx.server).get('/api/campaigns')
        .set('Authorization', `Bearer ${ctx.userToken}`);
      expect(res.body).toHaveLength(0); // user has no campaigns
    });
  });

  describe('GET /api/campaigns/:id', () => {
    test('returns specific campaign', async () => {
      const res = await request(ctx.server).get(`/api/campaigns/${campaignId}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Test Campaign');
    });

    test('returns 404 for nonexistent', async () => {
      const res = await request(ctx.server).get('/api/campaigns/fake-id')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/campaigns/:id', () => {
    test('updates campaign fields', async () => {
      const res = await request(ctx.server).put(`/api/campaigns/${campaignId}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ name: 'Updated Campaign', status: 'active' });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Updated Campaign');
      expect(res.body.status).toBe('active');
    });

    test('returns 404 for nonexistent campaign', async () => {
      const res = await request(ctx.server).put('/api/campaigns/fake-id')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ name: 'X' });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/campaigns/:id', () => {
    test('deletes campaign', async () => {
      const c = await request(ctx.server).post('/api/campaigns')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ name: 'Delete Me' });
      const res = await request(ctx.server).delete(`/api/campaigns/${c.body.id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('deleted');
      // Verify gone
      const check = await request(ctx.server).get(`/api/campaigns/${c.body.id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(check.status).toBe(404);
    });
  });

  describe('POST /api/campaigns/:id/generate-prompt', () => {
    test('generates prompt from context', async () => {
      const res = await request(ctx.server).post(`/api/campaigns/${campaignId}/generate-prompt`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.prompt).toBeTruthy();
      expect(res.body.promptVersion).toBeGreaterThanOrEqual(2);
    });

    test('rejects empty context', async () => {
      const c = await request(ctx.server).post('/api/campaigns')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ name: 'No Context', context: '' });
      const res = await request(ctx.server).post(`/api/campaigns/${c.body.id}/generate-prompt`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/campaigns/:id/prompt-versions', () => {
    test('returns prompt library', async () => {
      const res = await request(ctx.server).get(`/api/campaigns/${campaignId}/prompt-versions`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('GET /api/campaigns/:id/analytics', () => {
    test('returns analytics object', async () => {
      const res = await request(ctx.server).get(`/api/campaigns/${campaignId}/analytics`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('totalGenerated');
      expect(res.body).toHaveProperty('avgScore');
      expect(res.body).toHaveProperty('approvalRate');
      expect(res.body).toHaveProperty('feedbackBreakdown');
      expect(res.body).toHaveProperty('promptVersions');
      expect(res.body).toHaveProperty('totalFeedback');
    });

    test('returns 404 for nonexistent campaign', async () => {
      const res = await request(ctx.server).get('/api/campaigns/fake/analytics')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).toBe(404);
    });
  });
});
