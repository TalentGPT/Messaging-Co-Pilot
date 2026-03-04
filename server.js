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
const { RECRUITER_PROMPT, SALES_PROMPT } = require('./messageGenerator');
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

let promptStore = loadPrompts();

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
