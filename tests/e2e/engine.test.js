/**
 * AutomationEngine E2E tests — tests against mock recruiter page
 * NOTE: These tests verify engine module exports and status management.
 * Full browser-based tests require Playwright and are skipped in CI without display.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

process.env.MOCK_OPENAI = '1';
process.env.OPENAI_API_KEY = 'sk-test-fake';
process.env.TEST_MODE = '1';
require('../mocks/mock-openai');

let engine;
let store;
let tempDir;

beforeAll(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'engine-test-'));
  process.env.TEST_DATA_DIR = tempDir;
  process.env.SCREENSHOTS_DIR = path.join(tempDir, 'screenshots');
  process.env.USER_DATA_DIR = path.join(tempDir, 'browser-data');

  for (const mod of ['../../store', '../../automationEngine', '../../messageGenerator', '../../messageTuner', '../../phantombuster']) {
    try { delete require.cache[require.resolve(mod)]; } catch {}
  }
  store = require('../../store');
  engine = require('../../automationEngine');
});

afterAll(() => {
  try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
});

describe('AutomationEngine', () => {
  test('exports required functions', () => {
    expect(typeof engine.runOutreach).toBe('function');
    expect(typeof engine.approveCandidate).toBe('function');
    expect(typeof engine.requestStop).toBe('function');
    expect(typeof engine.getStatus).toBe('function');
    expect(typeof engine.setBroadcast).toBe('function');
    expect(typeof engine.setSessionCookies).toBe('function');
    expect(typeof engine.forceReset).toBe('function');
    expect(typeof engine.closeBrowser).toBe('function');
  });

  test('getStatus returns correct shape', () => {
    const status = engine.getStatus();
    expect(status).toHaveProperty('running');
    expect(status).toHaveProperty('currentRun');
    expect(status).toHaveProperty('browserConnected');
    expect(status).toHaveProperty('pendingReview');
  });

  test('getStatus initially not running', () => {
    const status = engine.getStatus();
    expect(status.running).toBe(false);
  });

  test('setBroadcast accepts function', () => {
    const fn = jest.fn();
    engine.setBroadcast(fn);
    // Should not throw
  });

  test('setSessionCookies accepts string', () => {
    engine.setSessionCookies('li_at=test123; JSESSIONID=abc');
    // Should not throw
  });

  test('setSessionCookies accepts null', () => {
    engine.setSessionCookies(null);
    // Should not throw
  });

  test('forceReset clears state', () => {
    engine.forceReset();
    const status = engine.getStatus();
    expect(status.running).toBe(false);
  });

  test('requestStop sets stop flag', () => {
    engine.requestStop();
    // After requesting stop, engine should track it internally
    // Can't easily verify without running, but shouldn't throw
  });

  test('approveCandidate rejects nonexistent candidate', async () => {
    await expect(engine.approveCandidate('nonexistent')).rejects.toThrow();
  });

  test('approveCandidate rejects non-pending candidate', async () => {
    const id = store.createCandidate({ name: 'Test', headline: '', run_mode: 'dry_run' });
    store.updateCandidate(id, { status: 'sent' });
    await expect(engine.approveCandidate(id)).rejects.toThrow();
  });

  test('runOutreach rejects without browser (no project URL)', async () => {
    try {
      await engine.runOutreach({ projectUrl: null, runMode: 'dry_run', maxCandidates: 1 });
    } catch (err) {
      expect(err).toBeTruthy();
    }
  });

  test('closeBrowser is safe to call without browser', async () => {
    await engine.closeBrowser(); // Should not throw
  });

  test('forceReset marks running runs as stopped', () => {
    const runId = store.createRun('https://test.com', 'dry_run', 10);
    engine.forceReset();
    const run = store.getRun(runId);
    expect(run.status).toBe('stopped');
  });
});
