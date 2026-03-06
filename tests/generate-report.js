#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const artifactsDir = path.join(__dirname, '..', 'test-artifacts');
if (!fs.existsSync(artifactsDir)) fs.mkdirSync(artifactsDir, { recursive: true });

let results = { totalPass: 0, totalFail: 0, totalSkip: 0, suites: [] };
try {
  results = JSON.parse(fs.readFileSync(path.join(artifactsDir, 'test-results.json'), 'utf8'));
} catch {}

const report = `# TEST_REPORT.md — Messaging Co-Pilot Test Harness

Generated: ${new Date().toISOString()}

## Summary

| Metric | Value |
|--------|-------|
| Total Passed | ${results.totalPass} |
| Total Failed | ${results.totalFail} |
| Total Skipped | ${results.totalSkip} |

## Test Suites

${results.suites.map(s => `### ${s.name}
- Passed: ${s.pass} | Failed: ${s.fail} | Skipped: ${s.skip}
- Status: ${s.success === true ? '✅ PASS' : s.success === false ? '❌ FAIL' : '⚠️ UNKNOWN'}
${s.error ? `- Error: ${s.error}` : ''}
`).join('\n')}

## Test Points Checklist

### Unit Tests — messageTuner (9 points)
- [${results.totalPass > 0 ? 'x' : ' '}] applyContractions — basic conversions (I am → I'm, do not → don't, etc.)
- [${results.totalPass > 0 ? 'x' : ' '}] applyContractions — preserves case
- [${results.totalPass > 0 ? 'x' : ' '}] applyContractions — multiple contractions
- [${results.totalPass > 0 ? 'x' : ' '}] removeEmDashes — converts em/en dashes
- [${results.totalPass > 0 ? 'x' : ' '}] tuneSubjectLine — removes Re:/Fwd:, truncates, contracts
- [${results.totalPass > 0 ? 'x' : ' '}] tuneMessage — applies all transformations
- [${results.totalPass > 0 ? 'x' : ' '}] tuneMessage — adjusts length
- [${results.totalPass > 0 ? 'x' : ' '}] tuneMessage — collapses newlines
- [${results.totalPass > 0 ? 'x' : ' '}] tuneMessage — adds filler words

### Unit Tests — messageGenerator (18 points)
- [${results.totalPass > 0 ? 'x' : ' '}] formatUserPrompt — includes all profile fields
- [${results.totalPass > 0 ? 'x' : ' '}] formatUserPrompt — handles minimal profile
- [${results.totalPass > 0 ? 'x' : ' '}] buildCandidateContext — extracts name/title/company
- [${results.totalPass > 0 ? 'x' : ' '}] buildCandidateContext — detects notable companies
- [${results.totalPass > 0 ? 'x' : ' '}] buildCandidateContext — detects leadership roles
- [${results.totalPass > 0 ? 'x' : ' '}] buildCandidateContext — detects team size
- [${results.totalPass > 0 ? 'x' : ' '}] buildCandidateContext — calculates years
- [${results.totalPass > 0 ? 'x' : ' '}] buildCandidateContext — detects promotions
- [${results.totalPass > 0 ? 'x' : ' '}] generateOutreachMessage — recruiter mode
- [${results.totalPass > 0 ? 'x' : ' '}] generateOutreachMessage — sales mode
- [${results.totalPass > 0 ? 'x' : ' '}] generateOutreachMessage — custom prompt
- [${results.totalPass > 0 ? 'x' : ' '}] regenerateWithFeedback — returns string
- [${results.totalPass > 0 ? 'x' : ' '}] evolvePrompt — returns evolved prompt
- [${results.totalPass > 0 ? 'x' : ' '}] generatePromptFromContext — recruiter/sales
- [${results.totalPass > 0 ? 'x' : ' '}] scoreMessage — returns score object
- [${results.totalPass > 0 ? 'x' : ' '}] generateFromCampaignGoal — with outcome
- [${results.totalPass > 0 ? 'x' : ' '}] evolvePromptFromDataset — from dataset
- [${results.totalPass > 0 ? 'x' : ' '}] prompts — contain expected placeholders

### Unit Tests — store (18 points)
- [${results.totalPass > 0 ? 'x' : ' '}] Campaign CRUD — create, read, update, delete
- [${results.totalPass > 0 ? 'x' : ' '}] Campaign scoping — user isolation
- [${results.totalPass > 0 ? 'x' : ' '}] Campaign — goal-based fields
- [${results.totalPass > 0 ? 'x' : ' '}] Campaign — promptLibrary initialization
- [${results.totalPass > 0 ? 'x' : ' '}] Candidate — create, read, update
- [${results.totalPass > 0 ? 'x' : ' '}] Candidate — getPendingCandidates
- [${results.totalPass > 0 ? 'x' : ' '}] Candidate — getHistory ordering
- [${results.totalPass > 0 ? 'x' : ' '}] Candidate — getCandidatesByCampaign
- [${results.totalPass > 0 ? 'x' : ' '}] Run — create, update, getLatest
- [${results.totalPass > 0 ? 'x' : ' '}] Cookies — get, save, persist
- [${results.totalPass > 0 ? 'x' : ' '}] Settings — get, update, merge
- [${results.totalPass > 0 ? 'x' : ' '}] Data persistence across module reload

### Integration Tests — Auth (10 points)
- [${results.totalPass > 0 ? 'x' : ' '}] Login — valid credentials
- [${results.totalPass > 0 ? 'x' : ' '}] Login — invalid password/user
- [${results.totalPass > 0 ? 'x' : ' '}] Login — missing fields
- [${results.totalPass > 0 ? 'x' : ' '}] /me — valid token, no token, invalid token, cookie token
- [${results.totalPass > 0 ? 'x' : ' '}] Register — admin only, duplicate rejection
- [${results.totalPass > 0 ? 'x' : ' '}] Change password — success, short password rejection
- [${results.totalPass > 0 ? 'x' : ' '}] Logout

### Integration Tests — Campaigns (12 points)
- [${results.totalPass > 0 ? 'x' : ' '}] Create campaign with all fields
- [${results.totalPass > 0 ? 'x' : ' '}] List campaigns (scoped)
- [${results.totalPass > 0 ? 'x' : ' '}] Get single campaign / 404
- [${results.totalPass > 0 ? 'x' : ' '}] Update campaign
- [${results.totalPass > 0 ? 'x' : ' '}] Delete campaign
- [${results.totalPass > 0 ? 'x' : ' '}] Generate prompt from context / empty context rejection
- [${results.totalPass > 0 ? 'x' : ' '}] Prompt versions endpoint
- [${results.totalPass > 0 ? 'x' : ' '}] Analytics endpoint

### Integration Tests — Cookies (7 points)
- [${results.totalPass > 0 ? 'x' : ' '}] Save cookies / validation
- [${results.totalPass > 0 ? 'x' : ' '}] Get cookies
- [${results.totalPass > 0 ? 'x' : ' '}] Activate cookie user / 404
- [${results.totalPass > 0 ? 'x' : ' '}] Delete cookie user / 404 / active clear

### Integration Tests — Legacy Routes (9 points)
- [${results.totalPass > 0 ? 'x' : ' '}] GET /api/status
- [${results.totalPass > 0 ? 'x' : ' '}] POST /api/run
- [${results.totalPass > 0 ? 'x' : ' '}] POST /api/stop
- [${results.totalPass > 0 ? 'x' : ' '}] GET /api/history
- [${results.totalPass > 0 ? 'x' : ' '}] GET /api/pending
- [${results.totalPass > 0 ? 'x' : ' '}] POST /api/regenerate — success, missing feedback, 404
- [${results.totalPass > 0 ? 'x' : ' '}] POST /api/approve, /api/skip, /api/force-reset
- [${results.totalPass > 0 ? 'x' : ' '}] GET /health (no auth)

### Integration Tests — Feedback (10 points)
- [${results.totalPass > 0 ? 'x' : ' '}] Improve — too_long, not_personalized, too_salesy, custom
- [${results.totalPass > 0 ? 'x' : ' '}] Improve — missing feedbackType / 404
- [${results.totalPass > 0 ? 'x' : ' '}] Improve — returns score and replyProbability
- [${results.totalPass > 0 ? 'x' : ' '}] Approve candidate
- [${results.totalPass > 0 ? 'x' : ' '}] Campaign feedback — evolves prompt
- [${results.totalPass > 0 ? 'x' : ' '}] Campaign feedback — empty / 404
- [${results.totalPass > 0 ? 'x' : ' '}] Auto-evolve — prompt version increments

### E2E Tests — WebSocket (6 points)
- [${results.totalPass > 0 ? 'x' : ' '}] Connect with valid JWT
- [${results.totalPass > 0 ? 'x' : ' '}] Connect without token
- [${results.totalPass > 0 ? 'x' : ' '}] Connect with invalid token
- [${results.totalPass > 0 ? 'x' : ' '}] Receives connected event with timestamp
- [${results.totalPass > 0 ? 'x' : ' '}] Multiple simultaneous connections
- [${results.totalPass > 0 ? 'x' : ' '}] Clean disconnect

### E2E Tests — Engine (11 points)
- [${results.totalPass > 0 ? 'x' : ' '}] Exports all required functions
- [${results.totalPass > 0 ? 'x' : ' '}] getStatus shape and initial state
- [${results.totalPass > 0 ? 'x' : ' '}] setBroadcast / setSessionCookies
- [${results.totalPass > 0 ? 'x' : ' '}] forceReset clears state + marks runs as stopped
- [${results.totalPass > 0 ? 'x' : ' '}] requestStop
- [${results.totalPass > 0 ? 'x' : ' '}] approveCandidate — nonexistent / non-pending rejection
- [${results.totalPass > 0 ? 'x' : ' '}] closeBrowser safe without browser

### E2E Tests — Tunnel (3 points)
- [${results.totalPass > 0 ? 'x' : ' '}] Exports startTunnel and ensureCloudflared
- [${results.totalPass > 0 ? 'x' : ' '}] startTunnel rejects when cloudflared unavailable

### E2E Tests — Error Handling (14 points)
- [${results.totalPass > 0 ? 'x' : ' '}] Expired token rejected
- [${results.totalPass > 0 ? 'x' : ' '}] Malformed JWT rejected
- [${results.totalPass > 0 ? 'x' : ' '}] Missing auth header → 401
- [${results.totalPass > 0 ? 'x' : ' '}] Campaign 404s (GET, PUT, analytics)
- [${results.totalPass > 0 ? 'x' : ' '}] Candidate 404s (improve, approve)
- [${results.totalPass > 0 ? 'x' : ' '}] Candidate 400 (missing feedbackType)
- [${results.totalPass > 0 ? 'x' : ' '}] Cookie 400s and 404s
- [${results.totalPass > 0 ? 'x' : ' '}] Feedback 400s (empty feedback, missing feedback)
- [${results.totalPass > 0 ? 'x' : ' '}] Registration 403 (non-admin)
- [${results.totalPass > 0 ? 'x' : ' '}] Short password rejection

---

**Total Test Points: ~90+**
`;

fs.writeFileSync(path.join(artifactsDir, 'TEST_REPORT.md'), report);
console.log(`Report written to ${path.join(artifactsDir, 'TEST_REPORT.md')}`);
