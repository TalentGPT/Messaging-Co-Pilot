try {
  require('dotenv').config();
} catch (e) {
  console.error('Failed to load dotenv:', e.message);
}

const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const fs = require('fs');
const { WebSocketServer } = require('ws');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

console.log('Loading modules...');
const store = require('./store');
console.log('  store OK');
const engine = require('./automationEngine');
console.log('  engine OK');
const { startTunnel } = require('./tunnel');
console.log('  tunnel OK');
const {
  RECRUITER_PROMPT, SALES_PROMPT, regenerateWithFeedback, evolvePrompt,
  formatUserPrompt, generatePromptFromContext,
  buildCandidateContext, scoreMessage, generateFromCampaignGoal, evolvePromptFromDataset,
} = require('./messageGenerator');
console.log('All modules loaded.');

// ── JWT Secret ──
const JWT_SECRET = process.env.JWT_SECRET || 'linkedin-outreach-jwt-secret-' + Date.now();

// ── User Store ──
const USERS_FILE = path.join(__dirname, 'users.json');

function loadUsers() {
  try {
    if (fs.existsSync(USERS_FILE)) return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch (e) { console.error('[users] Failed to load:', e.message); }
  return { users: [] };
}

function saveUsers(data) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// Initialize default admin user if no users exist
(function initDefaultAdmin() {
  const data = loadUsers();
  if (data.users.length === 0) {
    const hash = bcrypt.hashSync('admin123', 10);
    data.users.push({
      id: 'admin',
      username: 'admin',
      password: hash,
      role: 'admin',
      mustChangePassword: true,
      createdAt: new Date().toISOString(),
    });
    saveUsers(data);
    console.log('[auth] Default admin account created (admin/admin123)');
  }
})();

function findUser(username) {
  return loadUsers().users.find(u => u.username === username) || null;
}

function findUserById(id) {
  return loadUsers().users.find(u => u.id === id) || null;
}

// ── Cookie Storage (legacy compat) ──

function loadLegacyCookies() {
  const COOKIES_FILE = path.join(__dirname, 'cookies.json');
  try {
    if (fs.existsSync(COOKIES_FILE)) return JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf8'));
  } catch (e) {}
  return { active: null, users: {} };
}

const legacyCookies = loadLegacyCookies();
if (legacyCookies.active && legacyCookies.users[legacyCookies.active]) {
  engine.setSessionCookies(legacyCookies.users[legacyCookies.active]);
  console.log(`[cookies] Loaded legacy cookies for user: ${legacyCookies.active}`);
}

const PORT = parseInt(process.env.PORT) || 3847;

const app = express();
app.use(express.json());
app.use(cors({
  origin: [
    'https://messaging-co-pilot.replit.app',
    /\.replit\.app$/,
    /\.replit\.dev$/,
    'http://localhost:3000',
    'http://localhost:5173',
  ],
  credentials: true,
}));

// ── Auth Middleware ──

function authMiddleware(req, res, next) {
  let token = null;
  const cookieHeader = req.headers.cookie || '';
  const match = cookieHeader.match(/token=([^;]+)/);
  if (match) token = match[1];
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    }
  }
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ── WebSocket ──
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const wsClients = new Map();
wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const token = url.searchParams.get('token');
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      wsClients.set(ws, { userId: decoded.id });
    } catch (e) {
      wsClients.set(ws, { userId: null });
    }
  } else {
    wsClients.set(ws, { userId: null });
  }
  ws.on('close', () => wsClients.delete(ws));
  ws.send(JSON.stringify({ event: 'connected', timestamp: new Date().toISOString() }));
});

function broadcast(data) {
  const msg = JSON.stringify(data);
  for (const [ws] of wsClients) {
    if (ws.readyState === 1) ws.send(msg);
  }
}

engine.setBroadcast(broadcast);

// ── Serve static files ──
app.use(express.static(path.join(__dirname, 'public')));

// ── Auth Routes ──

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  const user = findUser(username);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  const valid = bcrypt.compareSync(password, user.password);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
  res.cookie('token', token, { httpOnly: false, maxAge: 7 * 24 * 60 * 60 * 1000, sameSite: 'lax' });
  res.json({ token, user: { id: user.id, username: user.username, role: user.role, mustChangePassword: user.mustChangePassword } });
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ status: 'logged_out' });
});

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
  const data = loadUsers();
  const id = username.toLowerCase().replace(/[^a-z0-9]/g, '_');
  data.users.push({
    id, username, password: bcrypt.hashSync(password, 10),
    role: 'user', mustChangePassword: false,
    createdAt: new Date().toISOString(),
  });
  saveUsers(data);
  res.json({ status: 'created', user: { id, username, role: 'user' } });
});

app.post('/api/auth/change-password', authMiddleware, (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });
  const data = loadUsers();
  const user = data.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  user.password = bcrypt.hashSync(password, 10);
  user.mustChangePassword = false;
  saveUsers(data);
  res.json({ status: 'password_changed' });
});

// ── Campaign Routes ──

app.get('/api/campaigns', authMiddleware, (req, res) => {
  res.json(store.getCampaigns(req.user.id));
});

app.post('/api/campaigns', authMiddleware, (req, res) => {
  const campaign = store.createCampaign(req.user.id, req.body);
  res.json(campaign);
});

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
    const prompt = await generatePromptFromContext(c.context, c.type);
    const newVersion = (c.promptVersion || 0) + 1;

    // Add to prompt library
    const promptLibrary = c.promptLibrary || [];
    // Deactivate all existing
    for (const entry of promptLibrary) entry.active = false;
    promptLibrary.push({
      version: newVersion,
      prompt: prompt,
      score: null,
      active: true,
      createdAt: new Date().toISOString(),
      feedbackCount: 0,
    });

    const updated = store.updateCampaign(req.user.id, req.params.id, {
      prompt,
      promptVersion: newVersion,
      promptLibrary,
    });
    res.json({ prompt, promptVersion: updated.promptVersion });
  } catch (e) {
    console.error('[generate-prompt] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Campaign Run (modified: auto-score, auto-regenerate if score < 70) ──

app.post('/api/campaigns/:id/run', authMiddleware, async (req, res) => {
  const status = engine.getStatus();
  if (status.running) return res.status(409).json({ error: 'A run is already in progress' });

  const campaign = store.getCampaign(req.user.id, req.params.id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

  // Load user's cookies
  const cookieData = store.getCookies(req.user.id);
  if (cookieData.active && cookieData.users[cookieData.active]) {
    engine.setSessionCookies(cookieData.users[cookieData.active]);
  }

  const options = {
    projectUrl: campaign.linkedinProjectUrl || req.body.project_url,
    runMode: req.body.run_mode || 'dry_run',
    maxCandidates: req.body.max_candidates || 20,
    rateLimitMin: req.body.rate_limit_min || 20,
    rateLimitMax: req.body.rate_limit_max || 60,
    customPrompt: campaign.prompt || null,
    userId: req.user.id,
    campaignId: campaign.id,
  };

  // Wrap the engine run to add scoring
  const originalBroadcast = engine._broadcastFn || broadcast;
  const userId = req.user.id;
  const campaignId = campaign.id;

  // Hook into message_generated events to auto-score
  const scoringBroadcast = async (data) => {
    if (data.event === 'message_generated' && data.candidateId) {
      try {
        const candidate = store.getCandidate(data.candidateId);
        if (candidate) {
          const cam = store.getCampaign(userId, campaignId);
          const profileData = candidate.profile_data || { name: candidate.name, headline: candidate.headline };
          const candidateCtx = buildCandidateContext(profileData);
          const goalText = (cam && cam.outcome) ? cam.outcome : (cam && cam.context ? cam.context.substring(0, 200) : 'LinkedIn outreach');

          let message = candidate.tuned_message || candidate.message || data.message || '';
          let scoreResult = await scoreMessage(message, candidateCtx, goalText);
          let attempts = 0;

          // Auto-regenerate if score < 70 (up to 2 times)
          while (scoreResult.score < 70 && attempts < 2) {
            attempts++;
            console.log(`[auto-score] Score ${scoreResult.score} < 70 for ${candidate.name}, regenerating (attempt ${attempts})...`);
            broadcast({ event: 'status', message: `Score ${scoreResult.score}/100 too low for ${candidate.name}, regenerating...` });

            try {
              let newMessage;
              if (cam && cam.outcome) {
                newMessage = await generateFromCampaignGoal(candidateCtx, cam);
              } else {
                const prompt = (cam && cam.prompt) || RECRUITER_PROMPT;
                newMessage = await regenerateWithFeedback(profileData, prompt, message, `Score too low (${scoreResult.score}/100). Improve personalization and clarity.`, cam ? cam.type : 'recruiter');
              }
              message = newMessage;
              scoreResult = await scoreMessage(message, candidateCtx, goalText);
            } catch (regenErr) {
              console.error(`[auto-score] Regeneration failed:`, regenErr.message);
              break;
            }
          }

          // Update candidate with score
          store.updateCandidate(data.candidateId, {
            message: message,
            tuned_message: message,
            score: scoreResult.score,
            scoreBreakdown: scoreResult.breakdown,
            replyProbability: scoreResult.replyProbability,
            signals: scoreResult.signals,
          });

          // Add score data to the broadcast
          data.message = message;
          data.score = scoreResult.score;
          data.replyProbability = scoreResult.replyProbability;
          data.signals = scoreResult.signals;
          data.scoreBreakdown = scoreResult.breakdown;
        }
      } catch (scoreErr) {
        console.error('[auto-score] Scoring failed:', scoreErr.message);
      }
    }
    originalBroadcast(data);
  };

  engine.setBroadcast(scoringBroadcast);

  engine.runOutreach(options).catch(err => {
    console.error('[server] Run error:', err.message);
  }).finally(() => {
    // Restore original broadcast
    engine.setBroadcast(broadcast);
  });

  store.updateCampaign(req.user.id, req.params.id, { status: 'active' });
  res.json({ status: 'started', ...options });
});

// ── Candidate Improve (👎 flow) ──

app.post('/api/candidates/:id/improve', authMiddleware, async (req, res) => {
  const { feedbackType, customFeedback } = req.body;
  if (!feedbackType) return res.status(400).json({ error: 'feedbackType is required' });

  const candidate = store.getCandidate(req.params.id);
  if (!candidate) return res.status(404).json({ error: 'Candidate not found' });

  const userId = candidate.userId || req.user.id;
  const campaignId = candidate.campaignId;
  let campaign = null;
  if (campaignId) {
    campaign = store.getCampaign(userId, campaignId);
  }

  // Build feedback text from type
  const feedbackMap = {
    'too_long': 'The message is too long. Make it shorter and more concise.',
    'not_personalized': 'The message is not personalized enough. Reference more specific details from the candidate profile.',
    'too_salesy': 'The message sounds too salesy. Make it more conversational and peer-to-peer.',
    'wrong_tone': 'The tone is wrong. Adjust to be more appropriate for this type of outreach.',
    'missed_profile_signal': 'The message missed important signals from the profile. Look deeper at their experience and achievements.',
    'custom': customFeedback || 'Please improve the message.',
  };
  const feedbackText = feedbackMap[feedbackType] || feedbackMap['custom'];

  try {
    // Store in campaign's feedbackDataset
    const profileData = candidate.profile_data || { name: candidate.name, headline: candidate.headline };
    const candidateCtx = buildCandidateContext(profileData);

    if (campaign) {
      const feedbackDataset = campaign.feedbackDataset || [];
      feedbackDataset.push({
        message: candidate.tuned_message || candidate.message || '',
        candidateContext: { name: candidateCtx.name, title: candidateCtx.title, company: candidateCtx.company },
        promptUsed: campaign.prompt || '',
        feedback: feedbackType,
        correction: customFeedback || '',
        timestamp: new Date().toISOString(),
      });

      const updates = { feedbackDataset };

      // Auto-evolve prompt every 5 feedback entries
      if (feedbackDataset.length > 0 && feedbackDataset.length % 5 === 0) {
        console.log(`[improve] Feedback count ${feedbackDataset.length} — auto-evolving prompt...`);
        const currentPrompt = campaign.prompt || RECRUITER_PROMPT;
        const evolvedPrompt = await evolvePromptFromDataset(currentPrompt, feedbackDataset);
        const newVersion = (campaign.promptVersion || 1) + 1;

        const promptLibrary = campaign.promptLibrary || [];
        for (const entry of promptLibrary) entry.active = false;
        promptLibrary.push({
          version: newVersion,
          prompt: evolvedPrompt,
          score: null,
          active: true,
          createdAt: new Date().toISOString(),
          feedbackCount: feedbackDataset.length,
        });

        updates.prompt = evolvedPrompt;
        updates.promptVersion = newVersion;
        updates.promptLibrary = promptLibrary;

        broadcast({ event: 'prompt_evolved', campaignId, promptVersion: newVersion });
      }

      store.updateCampaign(userId, campaignId, updates);
    }

    // Regenerate the message
    const originalMessage = candidate.tuned_message || candidate.message || '';
    let currentPrompt;
    if (campaign && campaign.outcome) {
      // Use goal-based generation
      const newMessage = await generateFromCampaignGoal(candidateCtx, campaign);

      // Score the new message
      const goalText = campaign.outcome || '';
      const scoreResult = await scoreMessage(newMessage, candidateCtx, goalText);

      store.updateCandidate(req.params.id, {
        message: newMessage,
        tuned_message: newMessage,
        score: scoreResult.score,
        scoreBreakdown: scoreResult.breakdown,
        replyProbability: scoreResult.replyProbability,
        signals: scoreResult.signals,
      });

      broadcast({
        event: 'message_regenerated',
        candidateId: req.params.id,
        name: candidate.name,
        message: newMessage,
        score: scoreResult.score,
        replyProbability: scoreResult.replyProbability,
        signals: scoreResult.signals,
        scoreBreakdown: scoreResult.breakdown,
      });

      res.json({
        status: 'improved',
        candidateId: req.params.id,
        message: newMessage,
        score: scoreResult.score,
        replyProbability: scoreResult.replyProbability,
        signals: scoreResult.signals,
        scoreBreakdown: scoreResult.breakdown,
      });
    } else {
      // Legacy: use prompt-based regeneration
      currentPrompt = (campaign && campaign.prompt) || (campaign && campaign.type === 'sales' ? SALES_PROMPT : RECRUITER_PROMPT);
      const newMessage = await regenerateWithFeedback(profileData, currentPrompt, originalMessage, feedbackText, campaign ? campaign.type : 'recruiter');

      // Score
      const goalText = (campaign && campaign.context) ? campaign.context.substring(0, 200) : 'LinkedIn outreach';
      let scoreResult = { score: 75, breakdown: {}, replyProbability: 50, signals: ['Score unavailable'] };
      try {
        scoreResult = await scoreMessage(newMessage, candidateCtx, goalText);
      } catch (e) { /* use defaults */ }

      store.updateCandidate(req.params.id, {
        message: newMessage,
        tuned_message: newMessage,
        score: scoreResult.score,
        scoreBreakdown: scoreResult.breakdown,
        replyProbability: scoreResult.replyProbability,
        signals: scoreResult.signals,
      });

      broadcast({
        event: 'message_regenerated',
        candidateId: req.params.id,
        name: candidate.name,
        message: newMessage,
        score: scoreResult.score,
        replyProbability: scoreResult.replyProbability,
        signals: scoreResult.signals,
      });

      res.json({
        status: 'improved',
        candidateId: req.params.id,
        message: newMessage,
        score: scoreResult.score,
        replyProbability: scoreResult.replyProbability,
        signals: scoreResult.signals,
      });
    }
  } catch (err) {
    console.error('[improve] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Candidate Approve (👍 — also logs positive signal) ──

// Update subject line selection for a candidate
app.put('/api/candidates/:id/subject', authMiddleware, (req, res) => {
  const candidate = store.getCandidate(req.params.id);
  if (!candidate) return res.status(404).json({ error: 'Candidate not found' });
  const { subject } = req.body || {};
  store.updateCandidate(req.params.id, { subject: subject || '' });
  res.json({ success: true });
});

app.post('/api/candidates/:id/approve', authMiddleware, async (req, res) => {
  const candidate = store.getCandidate(req.params.id);
  if (!candidate) return res.status(404).json({ error: 'Candidate not found' });

  // Allow subject override from request body
  const bodySubject = req.body?.subject;
  if (bodySubject !== undefined && bodySubject !== '') {
    store.updateCandidate(req.params.id, { subject: bodySubject });
  }

  const userId = candidate.userId || req.user.id;
  const campaignId = candidate.campaignId;

  // Log positive signal in feedbackDataset
  if (campaignId) {
    const campaign = store.getCampaign(userId, campaignId);
    if (campaign) {
      const feedbackDataset = campaign.feedbackDataset || [];
      const profileData = candidate.profile_data || { name: candidate.name, headline: candidate.headline };
      const candidateCtx = buildCandidateContext(profileData);
      feedbackDataset.push({
        message: candidate.tuned_message || candidate.message || '',
        candidateContext: { name: candidateCtx.name, title: candidateCtx.title, company: candidateCtx.company },
        promptUsed: campaign.prompt || '',
        feedback: 'approved',
        correction: '',
        timestamp: new Date().toISOString(),
      });
      store.updateCampaign(userId, campaignId, { feedbackDataset });
    }
  }

  // Delegate to engine for actual sending
  try {
    const result = await engine.approveCandidate(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── Prompt Versions ──

app.get('/api/campaigns/:id/prompt-versions', authMiddleware, (req, res) => {
  const campaign = store.getCampaign(req.user.id, req.params.id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  res.json(campaign.promptLibrary || []);
});

// ── Campaign Analytics ──

app.get('/api/campaigns/:id/analytics', authMiddleware, (req, res) => {
  const campaign = store.getCampaign(req.user.id, req.params.id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

  const candidates = store.getCandidatesByCampaign(req.user.id, req.params.id);
  const totalGenerated = candidates.length;
  const scored = candidates.filter(c => c.score != null);
  const avgScore = scored.length > 0 ? Math.round(scored.reduce((s, c) => s + c.score, 0) / scored.length) : null;
  const approved = candidates.filter(c => c.status === 'sent').length;
  const approvalRate = totalGenerated > 0 ? Math.round((approved / totalGenerated) * 100) : 0;

  // Feedback breakdown
  const feedbackDataset = campaign.feedbackDataset || [];
  const feedbackBreakdown = {};
  for (const entry of feedbackDataset) {
    const type = entry.feedback || 'unknown';
    feedbackBreakdown[type] = (feedbackBreakdown[type] || 0) + 1;
  }

  res.json({
    totalGenerated,
    avgScore,
    approvalRate,
    feedbackBreakdown,
    promptVersions: (campaign.promptLibrary || []).length,
    totalFeedback: feedbackDataset.length,
  });
});

// ── Legacy Campaign Feedback (kept for backward compat) ──

app.post('/api/campaigns/:id/feedback', authMiddleware, async (req, res) => {
  const { feedback } = req.body;
  if (!feedback || !feedback.trim()) return res.status(400).json({ error: 'Feedback is required' });

  const campaign = store.getCampaign(req.user.id, req.params.id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

  try {
    const feedbackHistory = campaign.feedbackHistory || [];
    feedbackHistory.push({ feedback, timestamp: new Date().toISOString() });

    const evolvedPrompt = await evolvePrompt(campaign.prompt, feedbackHistory.map(f => ({
      feedback: f.feedback,
      candidateName: 'all',
    })));

    const newVersion = (campaign.promptVersion || 1) + 1;

    // Update prompt library
    const promptLibrary = campaign.promptLibrary || [];
    for (const entry of promptLibrary) entry.active = false;
    promptLibrary.push({
      version: newVersion,
      prompt: evolvedPrompt,
      score: null,
      active: true,
      createdAt: new Date().toISOString(),
      feedbackCount: feedbackHistory.length,
    });

    store.updateCampaign(req.user.id, req.params.id, {
      prompt: evolvedPrompt,
      promptVersion: newVersion,
      feedbackHistory,
      promptLibrary,
    });

    const candidates = store.getCandidatesByCampaign(req.user.id, req.params.id);
    const regenerated = [];
    for (const cand of candidates) {
      if (cand.status === 'sent' || cand.status === 'skipped') continue;
      try {
        const profileData = cand.profile_data || { name: cand.name, headline: cand.headline };
        const newMessage = await regenerateWithFeedback(
          profileData, evolvedPrompt, cand.tuned_message || cand.message || '', feedback, campaign.type
        );
        store.updateCandidate(cand.id, { message: newMessage, tuned_message: newMessage });
        regenerated.push({ candidateId: cand.id, message: newMessage });
      } catch (e) {
        console.error(`[feedback] Failed to regen for ${cand.name}:`, e.message);
      }
    }

    broadcast({
      event: 'campaign_feedback_applied',
      campaignId: req.params.id,
      promptVersion: newVersion,
      regeneratedCount: regenerated.length,
      regenerated,
    });

    res.json({ status: 'feedback_applied', promptVersion: newVersion, regeneratedCount: regenerated.length, prompt: evolvedPrompt });
  } catch (e) {
    console.error('[feedback] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Legacy API Routes (kept for engine compat) ──

app.get('/api/status', authMiddleware, (req, res) => {
  res.json(engine.getStatus());
});

app.post('/api/run', authMiddleware, async (req, res) => {
  const status = engine.getStatus();
  if (status.running) return res.status(409).json({ error: 'A run is already in progress' });

  const options = {
    projectUrl: req.body.project_url || process.env.PROJECT_URL,
    runMode: req.body.run_mode || process.env.RUN_MODE || 'dry_run',
    maxCandidates: req.body.max_candidates || parseInt(process.env.MAX_CANDIDATES) || 20,
    rateLimitMin: req.body.rate_limit_min || parseInt(process.env.RATE_LIMIT_MIN) || 20,
    rateLimitMax: req.body.rate_limit_max || parseInt(process.env.RATE_LIMIT_MAX) || 60,
    customPrompt: req.body.customPrompt || null,
  };

  engine.runOutreach(options).catch(err => {
    console.error('[server] Run error:', err.message);
  });

  res.json({ status: 'started', ...options });
});

app.post('/api/stop', authMiddleware, (req, res) => {
  engine.requestStop();
  res.json({ status: 'stop_requested' });
});

app.post('/api/approve/:id', authMiddleware, async (req, res) => {
  try {
    // Also log as positive signal if candidate has a campaign
    const candidate = store.getCandidate(req.params.id);
    if (candidate && candidate.campaignId && candidate.userId) {
      const campaign = store.getCampaign(candidate.userId, candidate.campaignId);
      if (campaign) {
        const feedbackDataset = campaign.feedbackDataset || [];
        const profileData = candidate.profile_data || { name: candidate.name, headline: candidate.headline };
        const candidateCtx = buildCandidateContext(profileData);
        feedbackDataset.push({
          message: candidate.tuned_message || candidate.message || '',
          candidateContext: { name: candidateCtx.name, title: candidateCtx.title, company: candidateCtx.company },
          promptUsed: campaign.prompt || '',
          feedback: 'approved',
          correction: '',
          timestamp: new Date().toISOString(),
        });
        store.updateCampaign(candidate.userId, candidate.campaignId, { feedbackDataset });
      }
    }

    const result = await engine.approveCandidate(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/skip/:id', authMiddleware, (req, res) => {
  try {
    store.updateCandidate(req.params.id, { status: 'skipped' });
    broadcast({ event: 'candidate_skipped', candidateId: req.params.id });
    res.json({ status: 'skipped' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/history', authMiddleware, (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  const candidates = store.getHistory(limit);
  const runs = store.getRunHistory(20);
  res.json({ candidates, runs });
});

app.get('/api/pending', authMiddleware, (req, res) => {
  res.json(store.getPendingCandidates());
});

// ── Regenerate with Feedback (per candidate - legacy) ──

app.post('/api/regenerate/:id', authMiddleware, async (req, res) => {
  const { feedback } = req.body;
  const candidateId = req.params.id;
  if (!feedback || !feedback.trim()) return res.status(400).json({ error: 'feedback is required' });

  const candidate = store.getCandidate(candidateId);
  if (!candidate) return res.status(404).json({ error: 'Candidate not found' });

  try {
    const mode = process.env.OUTREACH_MODE || 'recruiter';
    let currentPrompt = mode === 'sales' ? SALES_PROMPT : RECRUITER_PROMPT;

    if (candidate.campaignId && candidate.userId) {
      const campaign = store.getCampaign(candidate.userId, candidate.campaignId);
      if (campaign && campaign.prompt) currentPrompt = campaign.prompt;
    }

    const originalMessage = candidate.tuned_message || candidate.message || '';
    const profileData = candidate.profile_data || { name: candidate.name, headline: candidate.headline };
    const newMessage = await regenerateWithFeedback(profileData, currentPrompt, originalMessage, feedback, mode);

    store.updateCandidate(candidateId, { message: newMessage, tuned_message: newMessage });
    res.json({ status: 'regenerated', candidateId, message: newMessage });
  } catch (err) {
    console.error(`[regenerate] Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ── Cookie Management (user-scoped) ──

app.get('/api/cookies', authMiddleware, (req, res) => {
  const cookieData = store.getCookies(req.user.id);
  const users = Object.keys(cookieData.users || {}).map(name => {
    const raw = cookieData.users[name];
    const count = raw.split(';').filter(s => s.includes('=')).length;
    return { name, cookieCount: count };
  });
  res.json({ active: cookieData.active, users });
});

app.put('/api/cookies', authMiddleware, (req, res) => {
  const { name, cookies, setActive } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
  if (!cookies || !cookies.trim()) return res.status(400).json({ error: 'cookies string is required' });
  const cookieData = store.getCookies(req.user.id);
  if (!cookieData.users) cookieData.users = {};
  cookieData.users[name.trim()] = cookies.trim();
  if (setActive) {
    cookieData.active = name.trim();
    engine.setSessionCookies(cookies.trim());
  }
  store.saveCookies(req.user.id, cookieData);
  res.json({ status: 'saved', name: name.trim(), active: cookieData.active });
});

app.post('/api/cookies/activate', authMiddleware, (req, res) => {
  const { name } = req.body;
  const cookieData = store.getCookies(req.user.id);
  if (!name || !cookieData.users[name]) return res.status(404).json({ error: `User "${name}" not found` });
  cookieData.active = name;
  engine.setSessionCookies(cookieData.users[name]);
  store.saveCookies(req.user.id, cookieData);
  res.json({ status: 'activated', active: name });
});

app.delete('/api/cookies/:name', authMiddleware, (req, res) => {
  const { name } = req.params;
  const cookieData = store.getCookies(req.user.id);
  if (!cookieData.users[name]) return res.status(404).json({ error: `User "${name}" not found` });
  delete cookieData.users[name];
  if (cookieData.active === name) {
    cookieData.active = null;
    engine.setSessionCookies(null);
  }
  store.saveCookies(req.user.id, cookieData);
  res.json({ status: 'deleted', name });
});

// ── Settings Routes (PhantomBuster config, per-user) ──

app.get('/api/settings', authMiddleware, (req, res) => {
  const settings = store.getSettings(req.user.id);
  // Mask sensitive fields for display
  const masked = { ...settings };
  if (masked.phantombusterApiKey) {
    masked.phantombusterApiKey = masked.phantombusterApiKey.substring(0, 8) + '...' + masked.phantombusterApiKey.slice(-4);
  }
  if (masked.linkedinLiAtCookie) {
    masked.linkedinLiAtCookie = masked.linkedinLiAtCookie.substring(0, 12) + '...' + masked.linkedinLiAtCookie.slice(-4);
  }
  // Return raw values exist flags for the frontend
  masked._hasPhantombusterApiKey = !!settings.phantombusterApiKey;
  masked._hasLinkedinLiAtCookie = !!settings.linkedinLiAtCookie;
  res.json(masked);
});

app.put('/api/settings', authMiddleware, (req, res) => {
  const allowedFields = [
    'phantombusterApiKey',
    'phantombusterPhantomId',
    'linkedinLiAtCookie',
    'linkedinUserAgent',
  ];
  const updates = {};
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      // Allow empty string to clear a field
      updates[field] = req.body[field] || '';
    }
  }
  const settings = store.updateSettings(req.user.id, updates);
  res.json({ status: 'updated', fields: Object.keys(updates) });
});

app.post('/api/settings/test-phantombuster', authMiddleware, async (req, res) => {
  const settings = store.getSettings(req.user.id);
  const apiKey = settings.phantombusterApiKey;
  if (!apiKey) return res.status(400).json({ error: 'PhantomBuster API key not configured' });

  try {
    const fetchFn = globalThis.fetch || (await import('node-fetch')).default;
    const response = await fetchFn('https://api.phantombuster.com/api/v2/agents/fetch-all', {
      headers: { 'X-Phantombuster-Key': apiKey },
    });
    if (!response.ok) {
      return res.status(400).json({ error: `API key invalid (HTTP ${response.status})` });
    }
    const agents = await response.json();
    const profileScrapers = agents.filter(a =>
      a.script && a.script.toLowerCase().includes('profile scraper')
    );
    res.json({
      status: 'connected',
      totalPhantoms: agents.length,
      profileScrapers: profileScrapers.map(a => ({ id: a.id, name: a.name })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Health check (no auth)
app.get('/health', (req, res) => res.json({
  ok: true,
  uptime: process.uptime(),
  openai_key_set: !!process.env.OPENAI_API_KEY,
}));

// ── Serve index.html for all non-API routes ──
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start ──

server.listen(PORT, async () => {
  console.log('========================================');
  console.log(' LinkedIn Outreach Automation');
  console.log(' Messaging Co-Pilot');
  console.log('========================================');
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Default login: admin / admin123`);
  console.log('');

  startTunnel(PORT).then(tunnel => {
    console.log(`Tunnel URL: ${tunnel.url}`);
  }).catch(err => {
    console.log(`[tunnel] Skipped: ${err.message}`);
  });

  console.log('');
  console.log('Ready!');
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  await engine.closeBrowser();
  process.exit(0);
});
process.on('SIGTERM', async () => {
  await engine.closeBrowser();
  process.exit(0);
});
