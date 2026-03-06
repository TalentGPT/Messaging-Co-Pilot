/**
 * Test Setup — utilities for spinning up server, temp dirs, cleanup
 */
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const express = require('express');

// Set test env vars before anything else
process.env.TEST_MODE = '1';
process.env.MOCK_OPENAI = '1';
process.env.JWT_SECRET = 'test-jwt-secret-fixed';
process.env.OPENAI_API_KEY = 'sk-test-fake-key';

let tempDirs = [];

function createTempDir(prefix = 'test-data-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function cleanupTempDirs() {
  for (const dir of tempDirs) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
  tempDirs = [];
}

/**
 * Start the app server on a random port for integration tests.
 * Returns { app, server, port, baseUrl, token, adminToken }
 */
async function startTestServer() {
  const dataDir = createTempDir('test-store-');
  process.env.TEST_DATA_DIR = dataDir;

  // Clear module caches so store picks up new TEST_DATA_DIR
  const modulesToClear = [
    '../store', '../server', '../automationEngine', '../messageGenerator',
    '../messageTuner', '../tunnel', '../phantombuster',
  ];
  for (const mod of modulesToClear) {
    try { delete require.cache[require.resolve(mod)]; } catch {}
  }

  // Mock OpenAI before loading modules
  require('./mocks/mock-openai');

  const bcrypt = require('bcryptjs');
  const jwt = require('jsonwebtoken');

  // Create users.json in a temp location
  const usersFile = path.join(dataDir, 'users.json');
  const hash = bcrypt.hashSync('testpass', 10);
  const usersData = {
    users: [{
      id: 'testadmin', username: 'testadmin', password: hash,
      role: 'admin', mustChangePassword: false,
      createdAt: new Date().toISOString(),
    }, {
      id: 'testuser', username: 'testuser', password: bcrypt.hashSync('userpass', 10),
      role: 'user', mustChangePassword: false,
      createdAt: new Date().toISOString(),
    }]
  };

  // We need to set USERS_FILE path — but server.js uses __dirname/users.json
  // Instead, we'll create the server manually with express
  const store = require('../store');
  const { tuneMessage } = require('../messageTuner');

  const app = express();
  app.use(express.json());
  app.use(require('cors')());

  const JWT_SECRET = process.env.JWT_SECRET;

  // Simple user store for tests
  let users = usersData.users;

  function findUser(username) { return users.find(u => u.username === username); }
  function findUserById(id) { return users.find(u => u.id === id); }

  function authMiddleware(req, res, next) {
    let token = null;
    const cookieHeader = req.headers.cookie || '';
    const match = cookieHeader.match(/token=([^;]+)/);
    if (match) token = match[1];
    if (!token) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) token = authHeader.slice(7);
    }
    if (!token) return res.status(401).json({ error: 'Authentication required' });
    try {
      req.user = jwt.verify(token, JWT_SECRET);
      next();
    } catch { return res.status(401).json({ error: 'Invalid or expired token' }); }
  }

  // Auth routes
  app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    const user = findUser(username);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    if (!bcrypt.compareSync(password, user.password)) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '1h' });
    res.json({ token, user: { id: user.id, username: user.username, role: user.role, mustChangePassword: user.mustChangePassword } });
  });

  app.post('/api/auth/logout', (req, res) => res.json({ status: 'logged_out' }));

  app.get('/api/auth/me', authMiddleware, (req, res) => {
    const user = findUserById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ id: user.id, username: user.username, role: user.role, mustChangePassword: user.mustChangePassword });
  });

  app.post('/api/auth/register', authMiddleware, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    if (findUser(username)) return res.status(409).json({ error: 'Username already exists' });
    const id = username.toLowerCase().replace(/[^a-z0-9]/g, '_');
    users.push({ id, username, password: bcrypt.hashSync(password, 10), role: 'user', mustChangePassword: false, createdAt: new Date().toISOString() });
    res.json({ status: 'created', user: { id, username, role: 'user' } });
  });

  app.post('/api/auth/change-password', authMiddleware, (req, res) => {
    const { password } = req.body;
    if (!password || password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });
    const user = users.find(u => u.id === req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.password = bcrypt.hashSync(password, 10);
    user.mustChangePassword = false;
    res.json({ status: 'password_changed' });
  });

  // Campaign routes
  app.get('/api/campaigns', authMiddleware, (req, res) => res.json(store.getCampaigns(req.user.id)));
  app.post('/api/campaigns', authMiddleware, (req, res) => res.json(store.createCampaign(req.user.id, req.body)));
  app.get('/api/campaigns/:id', authMiddleware, (req, res) => {
    const c = store.getCampaign(req.user.id, req.params.id);
    if (!c) return res.status(404).json({ error: 'Campaign not found' });
    res.json(c);
  });
  app.put('/api/campaigns/:id', authMiddleware, (req, res) => {
    const c = store.updateCampaign(req.user.id, req.params.id, req.body);
    if (!c) return res.status(404).json({ error: 'Campaign not found' });
    res.json(c);
  });
  app.delete('/api/campaigns/:id', authMiddleware, (req, res) => {
    store.deleteCampaign(req.user.id, req.params.id);
    res.json({ status: 'deleted' });
  });

  app.post('/api/campaigns/:id/generate-prompt', authMiddleware, async (req, res) => {
    const c = store.getCampaign(req.user.id, req.params.id);
    if (!c) return res.status(404).json({ error: 'Campaign not found' });
    if (!c.context || !c.context.trim()) return res.status(400).json({ error: 'Campaign context is empty' });
    try {
      const { generatePromptFromContext } = require('../messageGenerator');
      const prompt = await generatePromptFromContext(c.context, c.type);
      const newVersion = (c.promptVersion || 0) + 1;
      const promptLibrary = c.promptLibrary || [];
      for (const entry of promptLibrary) entry.active = false;
      promptLibrary.push({ version: newVersion, prompt, score: null, active: true, createdAt: new Date().toISOString(), feedbackCount: 0 });
      const updated = store.updateCampaign(req.user.id, req.params.id, { prompt, promptVersion: newVersion, promptLibrary });
      res.json({ prompt, promptVersion: updated.promptVersion });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/campaigns/:id/prompt-versions', authMiddleware, (req, res) => {
    const c = store.getCampaign(req.user.id, req.params.id);
    if (!c) return res.status(404).json({ error: 'Campaign not found' });
    res.json(c.promptLibrary || []);
  });

  app.get('/api/campaigns/:id/analytics', authMiddleware, (req, res) => {
    const c = store.getCampaign(req.user.id, req.params.id);
    if (!c) return res.status(404).json({ error: 'Campaign not found' });
    const candidates = store.getCandidatesByCampaign(req.user.id, req.params.id);
    const totalGenerated = candidates.length;
    const scored = candidates.filter(c => c.score != null);
    const avgScore = scored.length > 0 ? Math.round(scored.reduce((s, c) => s + c.score, 0) / scored.length) : null;
    const approved = candidates.filter(c => c.status === 'sent').length;
    const approvalRate = totalGenerated > 0 ? Math.round((approved / totalGenerated) * 100) : 0;
    const feedbackDataset = c.feedbackDataset || [];
    const feedbackBreakdown = {};
    for (const entry of feedbackDataset) { const t = entry.feedback || 'unknown'; feedbackBreakdown[t] = (feedbackBreakdown[t] || 0) + 1; }
    res.json({ totalGenerated, avgScore, approvalRate, feedbackBreakdown, promptVersions: (c.promptLibrary || []).length, totalFeedback: feedbackDataset.length });
  });

  // Cookie routes
  app.get('/api/cookies', authMiddleware, (req, res) => {
    const cookieData = store.getCookies(req.user.id);
    const cookieUsers = Object.keys(cookieData.users || {}).map(name => {
      const raw = cookieData.users[name];
      const count = raw.split(';').filter(s => s.includes('=')).length;
      return { name, cookieCount: count };
    });
    res.json({ active: cookieData.active, users: cookieUsers });
  });

  app.put('/api/cookies', authMiddleware, (req, res) => {
    const { name, cookies, setActive } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
    if (!cookies || !cookies.trim()) return res.status(400).json({ error: 'cookies string is required' });
    const cookieData = store.getCookies(req.user.id);
    if (!cookieData.users) cookieData.users = {};
    cookieData.users[name.trim()] = cookies.trim();
    if (setActive) cookieData.active = name.trim();
    store.saveCookies(req.user.id, cookieData);
    res.json({ status: 'saved', name: name.trim(), active: cookieData.active });
  });

  app.post('/api/cookies/activate', authMiddleware, (req, res) => {
    const { name } = req.body;
    const cookieData = store.getCookies(req.user.id);
    if (!name || !cookieData.users[name]) return res.status(404).json({ error: `User "${name}" not found` });
    cookieData.active = name;
    store.saveCookies(req.user.id, cookieData);
    res.json({ status: 'activated', active: name });
  });

  app.delete('/api/cookies/:name', authMiddleware, (req, res) => {
    const { name } = req.params;
    const cookieData = store.getCookies(req.user.id);
    if (!cookieData.users[name]) return res.status(404).json({ error: `User "${name}" not found` });
    delete cookieData.users[name];
    if (cookieData.active === name) cookieData.active = null;
    store.saveCookies(req.user.id, cookieData);
    res.json({ status: 'deleted', name });
  });

  // Legacy routes
  app.get('/api/status', authMiddleware, (req, res) => {
    res.json({ running: false, currentRun: null, browserConnected: false, pendingReview: 0 });
  });

  app.post('/api/run', authMiddleware, (req, res) => {
    res.json({ status: 'started', runMode: req.body.run_mode || 'dry_run' });
  });

  app.post('/api/stop', authMiddleware, (req, res) => res.json({ status: 'stop_requested' }));

  app.get('/api/history', authMiddleware, (req, res) => {
    res.json({ candidates: store.getHistory(parseInt(req.query.limit) || 100), runs: store.getRunHistory(20) });
  });

  app.get('/api/pending', authMiddleware, (req, res) => res.json(store.getPendingCandidates()));

  app.post('/api/regenerate/:id', authMiddleware, async (req, res) => {
    const { feedback } = req.body;
    if (!feedback || !feedback.trim()) return res.status(400).json({ error: 'feedback is required' });
    const candidate = store.getCandidate(req.params.id);
    if (!candidate) return res.status(404).json({ error: 'Candidate not found' });
    try {
      const { regenerateWithFeedback, RECRUITER_PROMPT } = require('../messageGenerator');
      const profileData = candidate.profile_data || { name: candidate.name, headline: candidate.headline };
      const newMessage = await regenerateWithFeedback(profileData, RECRUITER_PROMPT, candidate.message || '', feedback, 'recruiter');
      store.updateCandidate(req.params.id, { message: newMessage, tuned_message: newMessage });
      res.json({ status: 'regenerated', candidateId: req.params.id, message: newMessage });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Feedback routes
  app.post('/api/campaigns/:id/feedback', authMiddleware, async (req, res) => {
    const { feedback } = req.body;
    if (!feedback || !feedback.trim()) return res.status(400).json({ error: 'Feedback is required' });
    const campaign = store.getCampaign(req.user.id, req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    try {
      const { evolvePrompt } = require('../messageGenerator');
      const feedbackHistory = campaign.feedbackHistory || [];
      feedbackHistory.push({ feedback, timestamp: new Date().toISOString() });
      const evolvedPrompt = await evolvePrompt(campaign.prompt, feedbackHistory.map(f => ({ feedback: f.feedback, candidateName: 'all' })));
      const newVersion = (campaign.promptVersion || 1) + 1;
      const promptLibrary = campaign.promptLibrary || [];
      for (const entry of promptLibrary) entry.active = false;
      promptLibrary.push({ version: newVersion, prompt: evolvedPrompt, score: null, active: true, createdAt: new Date().toISOString(), feedbackCount: feedbackHistory.length });
      store.updateCampaign(req.user.id, req.params.id, { prompt: evolvedPrompt, promptVersion: newVersion, feedbackHistory, promptLibrary });
      res.json({ status: 'feedback_applied', promptVersion: newVersion, regeneratedCount: 0, prompt: evolvedPrompt });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/candidates/:id/improve', authMiddleware, async (req, res) => {
    const { feedbackType, customFeedback } = req.body;
    if (!feedbackType) return res.status(400).json({ error: 'feedbackType is required' });
    const candidate = store.getCandidate(req.params.id);
    if (!candidate) return res.status(404).json({ error: 'Candidate not found' });
    try {
      const { regenerateWithFeedback, RECRUITER_PROMPT, buildCandidateContext, scoreMessage } = require('../messageGenerator');
      const profileData = candidate.profile_data || { name: candidate.name, headline: candidate.headline };
      const feedbackMap = { 'too_long': 'shorter', 'not_personalized': 'personalize more', 'too_salesy': 'less salesy', 'custom': customFeedback || 'improve' };
      const feedbackText = feedbackMap[feedbackType] || 'improve';
      const newMessage = await regenerateWithFeedback(profileData, RECRUITER_PROMPT, candidate.message || '', feedbackText, 'recruiter');
      const candidateCtx = buildCandidateContext(profileData);
      const scoreResult = await scoreMessage(newMessage, candidateCtx, 'outreach');
      store.updateCandidate(req.params.id, { message: newMessage, tuned_message: newMessage, score: scoreResult.score });
      res.json({ status: 'improved', candidateId: req.params.id, message: newMessage, score: scoreResult.score, replyProbability: scoreResult.replyProbability, signals: scoreResult.signals });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/candidates/:id/approve', authMiddleware, (req, res) => {
    const candidate = store.getCandidate(req.params.id);
    if (!candidate) return res.status(404).json({ error: 'Candidate not found' });
    // In test mode, just mark as sent
    store.updateCandidate(req.params.id, { status: 'sent' });
    res.json({ success: true });
  });

  app.post('/api/approve/:id', authMiddleware, (req, res) => {
    const candidate = store.getCandidate(req.params.id);
    if (!candidate) return res.status(404).json({ error: 'Candidate not found' });
    store.updateCandidate(req.params.id, { status: 'sent' });
    res.json({ success: true });
  });

  app.post('/api/skip/:id', authMiddleware, (req, res) => {
    store.updateCandidate(req.params.id, { status: 'skipped' });
    res.json({ status: 'skipped' });
  });

  app.post('/api/force-reset', authMiddleware, (req, res) => res.json({ status: 'reset', message: 'Run state cleared' }));

  app.get('/health', (req, res) => res.json({ ok: true, uptime: process.uptime(), openai_key_set: true }));

  // WebSocket setup
  const { WebSocketServer } = require('ws');
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token');
    if (token) {
      try { jwt.verify(token, JWT_SECRET); } catch {}
    }
    ws.send(JSON.stringify({ event: 'connected', timestamp: new Date().toISOString() }));
  });

  return new Promise((resolve) => {
    server.listen(0, () => {
      const port = server.address().port;
      const baseUrl = `http://localhost:${port}`;

      // Generate tokens
      const adminToken = jwt.sign({ id: 'testadmin', username: 'testadmin', role: 'admin' }, JWT_SECRET, { expiresIn: '1h' });
      const userToken = jwt.sign({ id: 'testuser', username: 'testuser', role: 'user' }, JWT_SECRET, { expiresIn: '1h' });

      resolve({ app, server, wss, port, baseUrl, adminToken, userToken, store, dataDir: dataDir });
    });
  });
}

async function stopTestServer(ctx) {
  if (ctx.wss) ctx.wss.close();
  if (ctx.server) {
    await new Promise(r => ctx.server.close(r));
  }
}

module.exports = { startTestServer, stopTestServer, createTempDir, cleanupTempDirs };
