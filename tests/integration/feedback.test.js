const request = require('supertest');
const { startTestServer, stopTestServer, cleanupTempDirs } = require('../setup');

let ctx;

beforeAll(async () => { ctx = await startTestServer(); });
afterAll(async () => { await stopTestServer(ctx); cleanupTempDirs(); });

describe('Feedback API', () => {
  let campaignId;
  let candidateId;

  beforeAll(async () => {
    // Create a campaign
    const cRes = await request(ctx.server).post('/api/campaigns')
      .set('Authorization', `Bearer ${ctx.adminToken}`)
      .send({ name: 'Feedback Test', context: 'Testing feedback', prompt: 'Test prompt <<<>>>' });
    campaignId = cRes.body.id;

    // Create a candidate in that campaign
    candidateId = ctx.store.createCandidate({
      name: 'Feedback Candidate', headline: 'Engineer at TestCo',
      run_mode: 'manual_review', userId: 'testadmin', campaignId,
      profile_data: { name: 'Feedback Candidate', headline: 'Engineer at TestCo' },
    });
    ctx.store.updateCandidate(candidateId, { message: 'Original message', tuned_message: 'Original tuned' });
  });

  describe('POST /api/candidates/:id/improve', () => {
    test('improves message with too_long feedback', async () => {
      const res = await request(ctx.server).post(`/api/candidates/${candidateId}/improve`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ feedbackType: 'too_long' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('improved');
      expect(res.body.message).toBeTruthy();
      expect(res.body.score).toBeDefined();
    });

    test('improves with not_personalized feedback', async () => {
      const res = await request(ctx.server).post(`/api/candidates/${candidateId}/improve`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ feedbackType: 'not_personalized' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('improved');
    });

    test('improves with too_salesy feedback', async () => {
      const res = await request(ctx.server).post(`/api/candidates/${candidateId}/improve`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ feedbackType: 'too_salesy' });
      expect(res.status).toBe(200);
    });

    test('improves with custom feedback', async () => {
      const res = await request(ctx.server).post(`/api/candidates/${candidateId}/improve`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ feedbackType: 'custom', customFeedback: 'Add more technical details' });
      expect(res.status).toBe(200);
    });

    test('rejects missing feedbackType', async () => {
      const res = await request(ctx.server).post(`/api/candidates/${candidateId}/improve`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({});
      expect(res.status).toBe(400);
    });

    test('returns 404 for nonexistent candidate', async () => {
      const res = await request(ctx.server).post('/api/candidates/fake/improve')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ feedbackType: 'too_long' });
      expect(res.status).toBe(404);
    });

    test('returns score and replyProbability', async () => {
      const res = await request(ctx.server).post(`/api/candidates/${candidateId}/improve`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ feedbackType: 'too_long' });
      expect(res.body).toHaveProperty('score');
      expect(res.body).toHaveProperty('replyProbability');
      expect(res.body).toHaveProperty('signals');
    });
  });

  describe('POST /api/candidates/:id/approve', () => {
    test('approves candidate', async () => {
      const id = ctx.store.createCandidate({
        name: 'Approve Me', headline: 'Test', run_mode: 'manual_review',
        userId: 'testadmin', campaignId,
      });
      ctx.store.updateCandidate(id, { status: 'pending_review', message: 'msg' });
      const res = await request(ctx.server).post(`/api/candidates/${id}/approve`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /api/campaigns/:id/feedback (legacy)', () => {
    test('applies campaign-level feedback and evolves prompt', async () => {
      const res = await request(ctx.server).post(`/api/campaigns/${campaignId}/feedback`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ feedback: 'Messages are too formal, make them casual' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('feedback_applied');
      expect(res.body.promptVersion).toBeGreaterThanOrEqual(2);
      expect(res.body.prompt).toBeTruthy();
    });

    test('rejects empty feedback', async () => {
      const res = await request(ctx.server).post(`/api/campaigns/${campaignId}/feedback`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ feedback: '' });
      expect(res.status).toBe(400);
    });

    test('returns 404 for nonexistent campaign', async () => {
      const res = await request(ctx.server).post('/api/campaigns/fake/feedback')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ feedback: 'test' });
      expect(res.status).toBe(404);
    });
  });

  describe('Auto-evolve prompt', () => {
    test('prompt evolves after accumulating feedback', async () => {
      // Get initial prompt version
      const initial = await request(ctx.server).get(`/api/campaigns/${campaignId}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      const initialVersion = initial.body.promptVersion;

      // Apply feedback via campaign endpoint
      await request(ctx.server).post(`/api/campaigns/${campaignId}/feedback`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ feedback: 'Improve tone' });

      const after = await request(ctx.server).get(`/api/campaigns/${campaignId}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(after.body.promptVersion).toBeGreaterThan(initialVersion);
    });
  });
});
