const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.join(__dirname, 'outreach.json');

let data = { candidates: [], runs: [] };

function load() {
  try {
    if (fs.existsSync(DB_PATH)) {
      data = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    }
  } catch (e) {
    console.error('Error loading store:', e.message);
    data = { candidates: [], runs: [] };
  }
}

function save() {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

load();

function createRun(projectUrl, runMode, maxCandidates) {
  const id = uuidv4();
  data.runs.push({
    id, status: 'running', project_url: projectUrl, run_mode: runMode,
    max_candidates: maxCandidates, processed: 0, succeeded: 0, failed: 0, skipped: 0,
    started_at: new Date().toISOString(), finished_at: null, error: null
  });
  save();
  return id;
}

function updateRun(id, updates) {
  const run = data.runs.find(r => r.id === id);
  if (run) Object.assign(run, updates);
  save();
}

function getRun(id) {
  return data.runs.find(r => r.id === id) || null;
}

function getLatestRun() {
  return data.runs.length ? data.runs[data.runs.length - 1] : null;
}

function createCandidate(d) {
  const id = uuidv4();
  data.candidates.push({
    id, linkedin_url: d.linkedin_url, name: d.name, headline: d.headline,
    profile_data: d.profile_data || {}, status: 'pending', run_mode: d.run_mode,
    subject: null, message: null, tuned_message: null, error: null, screenshot_path: null,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString()
  });
  save();
  return id;
}

function updateCandidate(id, updates) {
  const c = data.candidates.find(c => c.id === id);
  if (c) {
    Object.assign(c, updates);
    c.updated_at = new Date().toISOString();
  }
  save();
}

function getCandidate(id) {
  return data.candidates.find(c => c.id === id) || null;
}

function getPendingCandidates() {
  return data.candidates.filter(c => c.status === 'pending_review');
}

function getHistory(limit = 100) {
  return data.candidates.slice(-limit).reverse();
}

function getRunHistory(limit = 20) {
  return data.runs.slice(-limit).reverse();
}

module.exports = {
  createRun, updateRun, getRun, getLatestRun,
  createCandidate, updateCandidate, getCandidate,
  getPendingCandidates, getHistory, getRunHistory
};
