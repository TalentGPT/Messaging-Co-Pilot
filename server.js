try {
  require('dotenv').config();
} catch (e) {
  console.error('Failed to load dotenv:', e.message);
}

const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { WebSocketServer } = require('ws');

const fs = require('fs');

console.log('Loading modules...');
const store = require('./store');
console.log('  store OK');
const engine = require('./automationEngine');
console.log('  engine OK');
const { startTunnel } = require('./tunnel');
console.log('  tunnel OK');
const { RECRUITER_PROMPT, SALES_PROMPT, regenerateWithFeedback, evolvePrompt, formatUserPrompt } = require('./messageGenerator');
console.log('All modules loaded.');

// ── Prompt Storage ──
const PROMPTS_FILE = path.join(__dirname, 'prompts.json');

function loadPrompts() {
  try {
    if (fs.existsSync(PROMPTS_FILE)) {
      return JSON.parse(fs.readFileSync(PROMPTS_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('[prompts] Failed to load prompts.json:', e.message);
  }
  return { active: null, saved: {} };
}

function savePrompts(data) {
  fs.writeFileSync(PROMPTS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// ── Prompt Version History ──
const PROMPT_VERSIONS_FILE = path.join(__dirname, 'prompt-versions.json');

function loadPromptVersions() {
  try {
    if (fs.existsSync(PROMPT_VERSIONS_FILE)) {
      return JSON.parse(fs.readFileSync(PROMPT_VERSIONS_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('[versions] Failed to load prompt-versions.json:', e.message);
  }
  return { versions: [], feedbackLog: [] };
}

function savePromptVersions(data) {
  fs.writeFileSync(PROMPT_VERSIONS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

let versionStore = loadPromptVersions();

function logPromptVersion(promptName, promptText, trigger, feedbackItems) {
  const version = {
    id: Date.now(),
    version: (versionStore.versions.filter(v => v.promptName === promptName).length) + 1,
    promptName,
    promptLength: promptText.length,
    trigger,  // 'manual' | 'feedback_evolution'
    feedbackItems: feedbackItems || [],
    timestamp: new Date().toISOString(),
  };
  versionStore.versions.push(version);
  // Keep last 50 versions
  if (versionStore.versions.length > 50) versionStore.versions = versionStore.versions.slice(-50);
  savePromptVersions(versionStore);
  return version;
}

function logFeedback(candidateId, candidateName, feedback, promptName) {
  const entry = { candidateId, candidateName, feedback, promptName, timestamp: new Date().toISOString() };
  versionStore.feedbackLog.push(entry);
  // Keep last 200 feedback entries
  if (versionStore.feedbackLog.length > 200) versionStore.feedbackLog = versionStore.feedbackLog.slice(-200);
  savePromptVersions(versionStore);
  return entry;
}

let promptStore = loadPrompts();

// ── Cookie Storage (multi-user) ──
const COOKIES_FILE = path.join(__dirname, 'cookies.json');

const DEFAULT_COOKIES_FILE = path.join(__dirname, 'default-cookies.json');

function loadCookies() {
  try {
    if (fs.existsSync(COOKIES_FILE)) {
      const data = JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf8'));
      // Migrate old single-cookie format to multi-user
      if (data.cookies && !data.users) {
        return { active: 'default', users: { default: data.cookies } };
      }
      return data;
    }
    // Seed from default-cookies.json on first run
    if (fs.existsSync(DEFAULT_COOKIES_FILE)) {
      console.log('[cookies] Seeding from default-cookies.json');
      const data = JSON.parse(fs.readFileSync(DEFAULT_COOKIES_FILE, 'utf8'));
      saveCookiesStore(data);
      return data;
    }
  } catch (e) {
    console.error('[cookies] Failed to load cookies.json:', e.message);
  }
  return { active: null, users: {} };
}

function saveCookiesStore(data) {
  fs.writeFileSync(COOKIES_FILE, JSON.stringify(data, null, 2), 'utf8');
}

let cookieStore = loadCookies();
// Load active user's cookies into engine on startup
if (cookieStore.active && cookieStore.users[cookieStore.active]) {
  engine.setSessionCookies(cookieStore.users[cookieStore.active]);
  console.log(`[cookies] Loaded saved session cookies for user: ${cookieStore.active}`);
}

const PORT = parseInt(process.env.PORT) || 3847;
const API_KEY = process.env.BRIDGE_API_KEY || '';

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
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

// ── Auth middleware ──
function auth(req, res, next) {
  if (!API_KEY) return next();
  const key = req.headers['x-api-key'] || req.query.api_key;
  if (key !== API_KEY) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// ── WebSocket ──
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const wsClients = new Set();
wss.on('connection', (ws, req) => {
  // Auth check for WebSocket
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const key = url.searchParams.get('api_key');
  if (API_KEY && key !== API_KEY) {
    ws.close(4001, 'Unauthorized');
    return;
  }
  wsClients.add(ws);
  ws.on('close', () => wsClients.delete(ws));
  ws.send(JSON.stringify({ event: 'connected', timestamp: new Date().toISOString() }));
});

function broadcast(data) {
  const msg = JSON.stringify(data);
  for (const ws of wsClients) {
    if (ws.readyState === 1) ws.send(msg);
  }
}

engine.setBroadcast(broadcast);

// ── Routes ──

app.get('/api/status', auth, (req, res) => {
  res.json(engine.getStatus());
});

app.post('/api/run', auth, async (req, res) => {
  const status = engine.getStatus();
  if (status.running) {
    return res.status(409).json({ error: 'A run is already in progress' });
  }
  // Resolve the active custom prompt (if any)
  const activePromptName = promptStore.active;
  const customPrompt = activePromptName ? promptStore.saved[activePromptName] : null;
  console.log(`[server] Starting run — active prompt: ${activePromptName || 'DEFAULT'}, custom prompt length: ${customPrompt ? customPrompt.length : 0}`);

  const options = {
    projectUrl: req.body.project_url || process.env.PROJECT_URL,
    runMode: req.body.run_mode || process.env.RUN_MODE || 'dry_run',
    maxCandidates: req.body.max_candidates || parseInt(process.env.MAX_CANDIDATES) || 20,
    rateLimitMin: req.body.rate_limit_min || parseInt(process.env.RATE_LIMIT_MIN) || 20,
    rateLimitMax: req.body.rate_limit_max || parseInt(process.env.RATE_LIMIT_MAX) || 60,
    customPrompt: customPrompt,
  };

  // Run in background
  engine.runOutreach(options).catch(err => {
    console.error('[server] Run error:', err.message);
  });

  res.json({ status: 'started', ...options });
});

app.post('/api/stop', auth, (req, res) => {
  engine.requestStop();
  res.json({ status: 'stop_requested' });
});

app.post('/api/approve/:id', auth, async (req, res) => {
  try {
    const result = await engine.approveCandidate(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/skip/:id', auth, (req, res) => {
  try {
    store.updateCandidate(req.params.id, { status: 'skipped' });
    broadcast({ event: 'candidate_skipped', candidateId: req.params.id });
    res.json({ status: 'skipped' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/history', auth, (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  const candidates = store.getHistory(limit);
  const runs = store.getRunHistory(20);
  res.json({ candidates, runs });
});

app.get('/api/pending', auth, (req, res) => {
  res.json(store.getPendingCandidates());
});

// ── Prompt Management ──

// Get current prompt config + defaults
app.get('/api/prompt', auth, (req, res) => {
  const activeText = promptStore.active ? promptStore.saved[promptStore.active] : null;
  res.json({
    active: promptStore.active,  // null = using default based on outreach mode
    customPrompt: activeText,
    defaults: {
      recruiter: RECRUITER_PROMPT,
      sales: SALES_PROMPT,
    },
    savedPrompts: Object.keys(promptStore.saved),
    saved: promptStore.saved,  // all saved prompt texts
  });
});

// Save/update a prompt
app.put('/api/prompt', auth, (req, res) => {
  const { name, prompt, setActive } = req.body;
  if (!name || !prompt) {
    return res.status(400).json({ error: 'name and prompt are required' });
  }
  promptStore.saved[name] = prompt;
  if (setActive) promptStore.active = name;
  savePrompts(promptStore);
  res.json({ status: 'saved', name, active: promptStore.active });
});

// Set which prompt is active (null = default)
app.post('/api/prompt/activate', auth, (req, res) => {
  const { name } = req.body;  // null or a saved prompt name
  if (name && !promptStore.saved[name]) {
    return res.status(404).json({ error: `Prompt "${name}" not found` });
  }
  promptStore.active = name || null;
  savePrompts(promptStore);
  res.json({ status: 'activated', active: promptStore.active });
});

// Delete a saved prompt
app.delete('/api/prompt/:name', auth, (req, res) => {
  const { name } = req.params;
  if (!promptStore.saved[name]) {
    return res.status(404).json({ error: `Prompt "${name}" not found` });
  }
  delete promptStore.saved[name];
  if (promptStore.active === name) promptStore.active = null;
  savePrompts(promptStore);
  res.json({ status: 'deleted', name });
});

// Get the active prompt text (used internally by engine)
app.get('/api/prompt/active', auth, (req, res) => {
  const activePrompt = promptStore.active ? promptStore.saved[promptStore.active] : null;
  res.json({ active: promptStore.active, prompt: activePrompt });
});

// ── Regenerate with Feedback ──

app.post('/api/regenerate/:id', auth, async (req, res) => {
  const { feedback } = req.body;
  const candidateId = req.params.id;
  
  if (!feedback || !feedback.trim()) {
    return res.status(400).json({ error: 'feedback is required' });
  }

  const candidate = store.getCandidate(candidateId);
  if (!candidate) {
    return res.status(404).json({ error: 'Candidate not found' });
  }

  try {
    // Determine which prompt was used
    const activePromptName = promptStore.active;
    const currentPrompt = activePromptName 
      ? promptStore.saved[activePromptName] 
      : (process.env.OUTREACH_MODE === 'sales' ? SALES_PROMPT : RECRUITER_PROMPT);
    const originalMessage = candidate.tuned_message || candidate.message || '';

    // Log the feedback
    logFeedback(candidateId, candidate.name, feedback, activePromptName || 'default');

    // Regenerate message with feedback
    console.log(`[regenerate] Regenerating for ${candidate.name} with feedback: "${feedback.substring(0, 60)}..."`);
    const profileData = candidate.profile_data || { name: candidate.name, headline: candidate.headline };
    const newMessage = await regenerateWithFeedback(profileData, currentPrompt, originalMessage, feedback, process.env.OUTREACH_MODE || 'recruiter');

    // Update candidate with new message
    store.updateCandidate(candidateId, { 
      message: newMessage, 
      tuned_message: newMessage,
      status: candidate.status  // keep same status
    });

    // Check if we should evolve the prompt (every 3 feedback items for the same prompt)
    const recentFeedback = versionStore.feedbackLog.filter(f => f.promptName === (activePromptName || 'default'));
    if (recentFeedback.length > 0 && recentFeedback.length % 3 === 0 && activePromptName) {
      // Auto-evolve the prompt in background
      console.log(`[evolve] Auto-evolving prompt "${activePromptName}" after ${recentFeedback.length} feedback items`);
      const lastThree = recentFeedback.slice(-3);
      evolvePrompt(currentPrompt, lastThree).then(evolvedPrompt => {
        if (evolvedPrompt && evolvedPrompt !== currentPrompt) {
          promptStore.saved[activePromptName] = evolvedPrompt;
          savePrompts(promptStore);
          const ver = logPromptVersion(activePromptName, evolvedPrompt, 'feedback_evolution', lastThree.map(f => f.feedback));
          console.log(`[evolve] Prompt "${activePromptName}" evolved to v${ver.version}`);
          broadcast({ event: 'prompt_evolved', promptName: activePromptName, version: ver.version });
        }
      }).catch(err => {
        console.error(`[evolve] Failed to evolve prompt: ${err.message}`);
      });
    }

    console.log(`[regenerate] New message generated for ${candidate.name} (${newMessage.length} chars)`);
    
    res.json({ 
      status: 'regenerated', 
      candidateId, 
      message: newMessage,
      feedbackCount: recentFeedback.length,
    });
  } catch (err) {
    console.error(`[regenerate] Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// Get prompt version history
app.get('/api/prompt/versions', auth, (req, res) => {
  const promptName = req.query.name || promptStore.active || 'all';
  const versions = promptName === 'all' 
    ? versionStore.versions 
    : versionStore.versions.filter(v => v.promptName === promptName);
  const feedback = promptName === 'all'
    ? versionStore.feedbackLog
    : versionStore.feedbackLog.filter(f => f.promptName === promptName);
  res.json({ versions: versions.slice(-20), feedback: feedback.slice(-20) });
});

// ── Cookie Management (multi-user) ──

app.get('/api/cookies', auth, (req, res) => {
  const users = Object.keys(cookieStore.users).map(name => {
    const raw = cookieStore.users[name];
    const count = raw.split(';').filter(s => s.includes('=')).length;
    return { name, cookieCount: count };
  });
  res.json({ active: cookieStore.active, users });
});

// Save cookies for a user
app.put('/api/cookies', auth, (req, res) => {
  const { name, cookies, setActive } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }
  if (!cookies || !cookies.trim()) {
    return res.status(400).json({ error: 'cookies string is required' });
  }
  cookieStore.users[name.trim()] = cookies.trim();
  if (setActive) {
    cookieStore.active = name.trim();
    engine.setSessionCookies(cookies.trim());
  }
  saveCookiesStore(cookieStore);
  console.log(`[cookies] Session cookies saved for user: ${name} (${cookies.length} chars)${setActive ? ' [ACTIVATED]' : ''}`);
  res.json({ status: 'saved', name: name.trim(), active: cookieStore.active });
});

// Activate a user's cookies
app.post('/api/cookies/activate', auth, (req, res) => {
  const { name } = req.body;
  if (!name || !cookieStore.users[name]) {
    return res.status(404).json({ error: `User "${name}" not found` });
  }
  cookieStore.active = name;
  engine.setSessionCookies(cookieStore.users[name]);
  saveCookiesStore(cookieStore);
  console.log(`[cookies] Activated cookies for user: ${name}`);
  res.json({ status: 'activated', active: name });
});

// Delete a user's cookies
app.delete('/api/cookies/:name', auth, (req, res) => {
  const { name } = req.params;
  if (!cookieStore.users[name]) {
    return res.status(404).json({ error: `User "${name}" not found` });
  }
  delete cookieStore.users[name];
  if (cookieStore.active === name) {
    cookieStore.active = null;
    engine.setSessionCookies(null);
  }
  saveCookiesStore(cookieStore);
  console.log(`[cookies] Deleted cookies for user: ${name}`);
  res.json({ status: 'deleted', name });
});

// Health check (no auth)
app.get('/health', (req, res) => res.json({
  ok: true,
  uptime: process.uptime(),
  openai_key_set: !!process.env.OPENAI_API_KEY,
  outreach_mode: process.env.OUTREACH_MODE || 'recruiter',
}));

// ── Start ──

server.listen(PORT, async () => {
  console.log('========================================');
  console.log(' LinkedIn Recruiter Automation');
  console.log(' Messaging Co-Pilot Local Runner');
  console.log('========================================');
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Run mode: ${process.env.RUN_MODE || 'dry_run'}`);
  console.log('');

  // Start tunnel (non-blocking — server works fine without it)
  startTunnel(PORT).then(tunnel => {
    console.log(`Tunnel URL: ${tunnel.url}`);
  }).catch(err => {
    console.log(`[tunnel] Skipped: ${err.message}`);
    console.log('[tunnel] Server is running locally — tunnel not required.');
  });

  console.log('');
  console.log('Endpoints:');
  console.log(`  POST /api/run        - Start outreach run`);
  console.log(`  GET  /api/status     - Current status`);
  console.log(`  POST /api/stop       - Stop current run`);
  console.log(`  POST /api/approve/ID - Approve pending candidate`);
  console.log(`  POST /api/skip/ID    - Skip candidate`);
  console.log(`  GET  /api/history    - Run history`);
  console.log(`  WS   /ws             - Real-time updates`);
  console.log('');
  console.log('Ready! Use the Replit dashboard or API to start a run.');
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
