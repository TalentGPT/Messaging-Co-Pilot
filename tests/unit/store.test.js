const fs = require('fs');
const path = require('path');
const os = require('os');

let store;
let tempDir;

beforeAll(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'store-test-'));
  process.env.TEST_DATA_DIR = tempDir;
  delete require.cache[require.resolve('../../store')];
  store = require('../../store');
});

afterAll(() => {
  try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
});

describe('store', () => {
  const userId = 'testuser1';

  describe('Campaign CRUD', () => {
    test('creates a campaign with defaults', () => {
      const c = store.createCampaign(userId, { name: 'Test Campaign' });
      expect(c.id).toBeTruthy();
      expect(c.name).toBe('Test Campaign');
      expect(c.status).toBe('draft');
      expect(c.promptVersion).toBe(1);
    });

    test('getCampaigns returns all user campaigns', () => {
      const before = store.getCampaigns(userId).length;
      store.createCampaign(userId, { name: 'C1' });
      store.createCampaign(userId, { name: 'C2' });
      const campaigns = store.getCampaigns(userId);
      expect(campaigns.length).toBe(before + 2);
    });

    test('getCampaign returns specific campaign', () => {
      const c = store.createCampaign(userId, { name: 'Find Me' });
      const found = store.getCampaign(userId, c.id);
      expect(found.name).toBe('Find Me');
    });

    test('getCampaign returns null for wrong user', () => {
      const c = store.createCampaign(userId, { name: 'Mine' });
      expect(store.getCampaign('other-user', c.id)).toBeNull();
    });

    test('getCampaign returns null for nonexistent id', () => {
      expect(store.getCampaign(userId, 'nonexistent')).toBeNull();
    });

    test('updateCampaign modifies fields', () => {
      const c = store.createCampaign(userId, { name: 'Old' });
      const updated = store.updateCampaign(userId, c.id, { name: 'New', status: 'active' });
      expect(updated.name).toBe('New');
      expect(updated.status).toBe('active');
      expect(updated.updatedAt).toBeTruthy();
    });

    test('updateCampaign returns null for nonexistent', () => {
      expect(store.updateCampaign(userId, 'fake', { name: 'X' })).toBeNull();
    });

    test('deleteCampaign removes campaign', () => {
      const c = store.createCampaign(userId, { name: 'Delete Me' });
      store.deleteCampaign(userId, c.id);
      expect(store.getCampaign(userId, c.id)).toBeNull();
    });

    test('campaign includes goal-based fields', () => {
      const c = store.createCampaign(userId, {
        name: 'Goal', outcome: 'Book meetings', tone: 'casual', constraints: ['under 500 chars'],
      });
      expect(c.outcome).toBe('Book meetings');
      expect(c.tone).toBe('casual');
      expect(c.constraints).toEqual(['under 500 chars']);
    });

    test('campaign initializes promptLibrary when prompt provided', () => {
      const c = store.createCampaign(userId, { name: 'With Prompt', prompt: 'test prompt' });
      expect(c.promptLibrary).toHaveLength(1);
      expect(c.promptLibrary[0].active).toBe(true);
      expect(c.promptLibrary[0].version).toBe(1);
    });

    test('campaign scoping — users cannot see each other campaigns', () => {
      store.createCampaign('user1', { name: 'User1 Camp' });
      store.createCampaign('user2', { name: 'User2 Camp' });
      expect(store.getCampaigns('user1')).toHaveLength(1);
      expect(store.getCampaigns('user2')).toHaveLength(1);
      expect(store.getCampaigns('user1')[0].name).toBe('User1 Camp');
    });
  });

  describe('Candidate management', () => {
    test('creates and retrieves candidate', () => {
      const id = store.createCandidate({
        linkedin_url: 'https://linkedin.com/in/test',
        name: 'Test Person',
        headline: 'Engineer',
        run_mode: 'dry_run',
        userId,
      });
      const c = store.getCandidate(id);
      expect(c.name).toBe('Test Person');
      expect(c.status).toBe('pending');
    });

    test('updates candidate fields', () => {
      const id = store.createCandidate({ name: 'Update Me', headline: '', run_mode: 'dry_run', userId });
      store.updateCandidate(id, { status: 'sent', message: 'Hello', score: 85 });
      const c = store.getCandidate(id);
      expect(c.status).toBe('sent');
      expect(c.message).toBe('Hello');
      expect(c.score).toBe(85);
    });

    test('getPendingCandidates returns only pending_review', () => {
      store.createCandidate({ name: 'A', headline: '', run_mode: 'dry_run' });
      const id2 = store.createCandidate({ name: 'B', headline: '', run_mode: 'manual_review' });
      store.updateCandidate(id2, { status: 'pending_review' });
      const pending = store.getPendingCandidates();
      expect(pending).toHaveLength(1);
      expect(pending[0].name).toBe('B');
    });

    test('getHistory returns candidates in reverse order', () => {
      store.createCandidate({ name: 'First', headline: '', run_mode: 'dry_run' });
      store.createCandidate({ name: 'Second', headline: '', run_mode: 'dry_run' });
      const history = store.getHistory(10);
      expect(history[0].name).toBe('Second');
    });

    test('getCandidatesByCampaign filters correctly', () => {
      const campaign = store.createCampaign(userId, { name: 'C' });
      store.createCandidate({ name: 'A', headline: '', run_mode: 'dry_run', userId, campaignId: campaign.id });
      store.createCandidate({ name: 'B', headline: '', run_mode: 'dry_run', userId, campaignId: 'other' });
      const byCampaign = store.getCandidatesByCampaign(userId, campaign.id);
      expect(byCampaign).toHaveLength(1);
      expect(byCampaign[0].name).toBe('A');
    });
  });

  describe('Run management', () => {
    test('creates and retrieves run', () => {
      const id = store.createRun('https://linkedin.com/project', 'dry_run', 20, userId);
      const run = store.getRun(id);
      expect(run.status).toBe('running');
      expect(run.run_mode).toBe('dry_run');
    });

    test('updates run status', () => {
      const id = store.createRun('url', 'dry_run', 10);
      store.updateRun(id, { status: 'completed', processed: 5 });
      const run = store.getRun(id);
      expect(run.status).toBe('completed');
      expect(run.processed).toBe(5);
    });

    test('getLatestRun returns most recent', () => {
      store.createRun('url1', 'dry_run', 10);
      store.createRun('url2', 'auto_send', 20);
      const latest = store.getLatestRun();
      expect(latest.run_mode).toBe('auto_send');
    });

    test('getRunHistory returns runs in reverse order', () => {
      store.createRun('url1', 'dry_run', 10);
      store.createRun('url2', 'dry_run', 20);
      const history = store.getRunHistory(10);
      expect(history[0].max_candidates).toBe(20);
    });
  });

  describe('Cookie management', () => {
    test('getCookies returns default for new user', () => {
      const cookies = store.getCookies('newuser');
      expect(cookies.active).toBeNull();
      expect(cookies.users).toEqual({});
    });

    test('saveCookies persists data', () => {
      store.saveCookies(userId, { active: 'bob', users: { bob: 'li_at=abc; JSESSIONID=xyz' } });
      const cookies = store.getCookies(userId);
      expect(cookies.active).toBe('bob');
      expect(cookies.users.bob).toContain('li_at=abc');
    });
  });

  describe('Settings management', () => {
    test('getSettings returns empty for new user', () => {
      expect(store.getSettings('newuser')).toEqual({});
    });

    test('updateSettings persists and merges', () => {
      store.updateSettings(userId, { phantombusterApiKey: 'key1' });
      store.updateSettings(userId, { linkedinLiAtCookie: 'cookie1' });
      const settings = store.getSettings(userId);
      expect(settings.phantombusterApiKey).toBe('key1');
      expect(settings.linkedinLiAtCookie).toBe('cookie1');
    });
  });

  describe('Data persistence', () => {
    test('data survives module reload', () => {
      const before = store.getCampaigns(userId).length;
      store.createCampaign(userId, { name: 'Persistent' });
      // Re-require
      delete require.cache[require.resolve('../../store')];
      const store2 = require('../../store');
      const campaigns = store2.getCampaigns(userId);
      expect(campaigns.length).toBe(before + 1);
      expect(campaigns.some(c => c.name === 'Persistent')).toBe(true);
    });
  });
});
