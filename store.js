const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DATA_DIR = path.join(__dirname, 'data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function userFile(userId) {
  return path.join(DATA_DIR, `${userId}.json`);
}

function loadUser(userId) {
  const fp = userFile(userId);
  try {
    if (fs.existsSync(fp)) return JSON.parse(fs.readFileSync(fp, 'utf-8'));
  } catch (e) {
    console.error(`[store] Error loading data for user ${userId}:`, e.message);
  }
  return { campaigns: [], candidates: [], runs: [], cookies: { active: null, users: {} } };
}

function saveUser(userId, data) {
  fs.writeFileSync(userFile(userId), JSON.stringify(data, null, 2));
}

// ── Legacy compat (non-user-scoped, used by automationEngine) ──
const LEGACY_DB = path.join(__dirname, 'outreach.json');
let legacyData = { candidates: [], runs: [] };
try {
  if (fs.existsSync(LEGACY_DB)) legacyData = JSON.parse(fs.readFileSync(LEGACY_DB, 'utf-8'));
} catch (e) { legacyData = { candidates: [], runs: [] }; }

function saveLegacy() {
  fs.writeFileSync(LEGACY_DB, JSON.stringify(legacyData, null, 2));
}

// ── Campaign CRUD ──

function createCampaign(userId, data) {
  const ud = loadUser(userId);
  const campaign = {
    id: uuidv4(),
    name: data.name || 'Untitled Campaign',
    type: data.type || 'recruiting',
    context: data.context || '',
    prompt: data.prompt || '',
    promptVersion: 1,
    feedbackHistory: [],
    linkedinProjectUrl: data.linkedinProjectUrl || '',
    status: data.status || 'draft',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  ud.campaigns.push(campaign);
  saveUser(userId, ud);
  return campaign;
}

function getCampaigns(userId) {
  return loadUser(userId).campaigns || [];
}

function getCampaign(userId, campaignId) {
  const ud = loadUser(userId);
  return (ud.campaigns || []).find(c => c.id === campaignId) || null;
}

function updateCampaign(userId, campaignId, updates) {
  const ud = loadUser(userId);
  const c = (ud.campaigns || []).find(c => c.id === campaignId);
  if (!c) return null;
  Object.assign(c, updates, { updatedAt: new Date().toISOString() });
  saveUser(userId, ud);
  return c;
}

function deleteCampaign(userId, campaignId) {
  const ud = loadUser(userId);
  ud.campaigns = (ud.campaigns || []).filter(c => c.id !== campaignId);
  saveUser(userId, ud);
}

// ── Cookie management (user-scoped) ──

function getCookies(userId) {
  return loadUser(userId).cookies || { active: null, users: {} };
}

function saveCookies(userId, cookieData) {
  const ud = loadUser(userId);
  ud.cookies = cookieData;
  saveUser(userId, ud);
}

// ── Run management ──

function createRun(projectUrl, runMode, maxCandidates, userId, campaignId) {
  const id = uuidv4();
  const run = {
    id, status: 'running', project_url: projectUrl, run_mode: runMode,
    max_candidates: maxCandidates, processed: 0, succeeded: 0, failed: 0, skipped: 0,
    started_at: new Date().toISOString(), finished_at: null, error: null,
    userId: userId || null, campaignId: campaignId || null,
  };
  // Store in legacy for engine compat
  legacyData.runs.push(run);
  saveLegacy();
  // Also store in user data if userId provided
  if (userId) {
    const ud = loadUser(userId);
    ud.runs.push(run);
    saveUser(userId, ud);
  }
  return id;
}

function updateRun(id, updates) {
  const run = legacyData.runs.find(r => r.id === id);
  if (run) {
    Object.assign(run, updates);
    saveLegacy();
    // Update in user data too
    if (run.userId) {
      const ud = loadUser(run.userId);
      const ur = (ud.runs || []).find(r => r.id === id);
      if (ur) { Object.assign(ur, updates); saveUser(run.userId, ud); }
    }
  }
}

function getRun(id) {
  return legacyData.runs.find(r => r.id === id) || null;
}

function getLatestRun() {
  return legacyData.runs.length ? legacyData.runs[legacyData.runs.length - 1] : null;
}

// ── Candidate management ──

function createCandidate(d) {
  const id = uuidv4();
  const candidate = {
    id, linkedin_url: d.linkedin_url, name: d.name, headline: d.headline,
    profile_data: d.profile_data || {}, status: 'pending', run_mode: d.run_mode,
    subject: null, message: null, tuned_message: null, error: null, screenshot_path: null,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    userId: d.userId || null, campaignId: d.campaignId || null,
  };
  legacyData.candidates.push(candidate);
  saveLegacy();
  if (d.userId) {
    const ud = loadUser(d.userId);
    ud.candidates.push(candidate);
    saveUser(d.userId, ud);
  }
  return id;
}

function updateCandidate(id, updates) {
  const c = legacyData.candidates.find(c => c.id === id);
  if (c) {
    Object.assign(c, updates);
    c.updated_at = new Date().toISOString();
    saveLegacy();
    if (c.userId) {
      const ud = loadUser(c.userId);
      const uc = (ud.candidates || []).find(x => x.id === id);
      if (uc) { Object.assign(uc, updates); uc.updated_at = c.updated_at; saveUser(c.userId, ud); }
    }
  }
}

function getCandidate(id) {
  return legacyData.candidates.find(c => c.id === id) || null;
}

function getPendingCandidates() {
  return legacyData.candidates.filter(c => c.status === 'pending_review');
}

function getHistory(limit = 100) {
  return legacyData.candidates.slice(-limit).reverse();
}

function getRunHistory(limit = 20) {
  return legacyData.runs.slice(-limit).reverse();
}

function getCandidatesByCampaign(userId, campaignId) {
  const ud = loadUser(userId);
  return (ud.candidates || []).filter(c => c.campaignId === campaignId);
}

module.exports = {
  createRun, updateRun, getRun, getLatestRun,
  createCandidate, updateCandidate, getCandidate,
  getPendingCandidates, getHistory, getRunHistory,
  createCampaign, getCampaigns, getCampaign, updateCampaign, deleteCampaign,
  getCookies, saveCookies, getCandidatesByCampaign,
};
