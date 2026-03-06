# TEST_REPORT.md — Messaging Co-Pilot Test Harness

Generated: 2026-03-06T00:22:49.123Z

## Summary

| Metric | Value |
|--------|-------|
| Total Passed | 185 |
| Total Failed | 0 |
| Total Skipped | 0 |

## Test Suites

### Unit Tests
- Passed: 83 | Failed: 0 | Skipped: 0
- Status: ✅ PASS


### Integration Tests
- Passed: 62 | Failed: 0 | Skipped: 0
- Status: ✅ PASS


### E2E Tests
- Passed: 40 | Failed: 0 | Skipped: 0
- Status: ✅ PASS



## Test Points Checklist

### Unit Tests — messageTuner (9 points)
- [x] applyContractions — basic conversions (I am → I'm, do not → don't, etc.)
- [x] applyContractions — preserves case
- [x] applyContractions — multiple contractions
- [x] removeEmDashes — converts em/en dashes
- [x] tuneSubjectLine — removes Re:/Fwd:, truncates, contracts
- [x] tuneMessage — applies all transformations
- [x] tuneMessage — adjusts length
- [x] tuneMessage — collapses newlines
- [x] tuneMessage — adds filler words

### Unit Tests — messageGenerator (18 points)
- [x] formatUserPrompt — includes all profile fields
- [x] formatUserPrompt — handles minimal profile
- [x] buildCandidateContext — extracts name/title/company
- [x] buildCandidateContext — detects notable companies
- [x] buildCandidateContext — detects leadership roles
- [x] buildCandidateContext — detects team size
- [x] buildCandidateContext — calculates years
- [x] buildCandidateContext — detects promotions
- [x] generateOutreachMessage — recruiter mode
- [x] generateOutreachMessage — sales mode
- [x] generateOutreachMessage — custom prompt
- [x] regenerateWithFeedback — returns string
- [x] evolvePrompt — returns evolved prompt
- [x] generatePromptFromContext — recruiter/sales
- [x] scoreMessage — returns score object
- [x] generateFromCampaignGoal — with outcome
- [x] evolvePromptFromDataset — from dataset
- [x] prompts — contain expected placeholders

### Unit Tests — store (18 points)
- [x] Campaign CRUD — create, read, update, delete
- [x] Campaign scoping — user isolation
- [x] Campaign — goal-based fields
- [x] Campaign — promptLibrary initialization
- [x] Candidate — create, read, update
- [x] Candidate — getPendingCandidates
- [x] Candidate — getHistory ordering
- [x] Candidate — getCandidatesByCampaign
- [x] Run — create, update, getLatest
- [x] Cookies — get, save, persist
- [x] Settings — get, update, merge
- [x] Data persistence across module reload

### Integration Tests — Auth (10 points)
- [x] Login — valid credentials
- [x] Login — invalid password/user
- [x] Login — missing fields
- [x] /me — valid token, no token, invalid token, cookie token
- [x] Register — admin only, duplicate rejection
- [x] Change password — success, short password rejection
- [x] Logout

### Integration Tests — Campaigns (12 points)
- [x] Create campaign with all fields
- [x] List campaigns (scoped)
- [x] Get single campaign / 404
- [x] Update campaign
- [x] Delete campaign
- [x] Generate prompt from context / empty context rejection
- [x] Prompt versions endpoint
- [x] Analytics endpoint

### Integration Tests — Cookies (7 points)
- [x] Save cookies / validation
- [x] Get cookies
- [x] Activate cookie user / 404
- [x] Delete cookie user / 404 / active clear

### Integration Tests — Legacy Routes (9 points)
- [x] GET /api/status
- [x] POST /api/run
- [x] POST /api/stop
- [x] GET /api/history
- [x] GET /api/pending
- [x] POST /api/regenerate — success, missing feedback, 404
- [x] POST /api/approve, /api/skip, /api/force-reset
- [x] GET /health (no auth)

### Integration Tests — Feedback (10 points)
- [x] Improve — too_long, not_personalized, too_salesy, custom
- [x] Improve — missing feedbackType / 404
- [x] Improve — returns score and replyProbability
- [x] Approve candidate
- [x] Campaign feedback — evolves prompt
- [x] Campaign feedback — empty / 404
- [x] Auto-evolve — prompt version increments

### E2E Tests — WebSocket (6 points)
- [x] Connect with valid JWT
- [x] Connect without token
- [x] Connect with invalid token
- [x] Receives connected event with timestamp
- [x] Multiple simultaneous connections
- [x] Clean disconnect

### E2E Tests — Engine (11 points)
- [x] Exports all required functions
- [x] getStatus shape and initial state
- [x] setBroadcast / setSessionCookies
- [x] forceReset clears state + marks runs as stopped
- [x] requestStop
- [x] approveCandidate — nonexistent / non-pending rejection
- [x] closeBrowser safe without browser

### E2E Tests — Tunnel (3 points)
- [x] Exports startTunnel and ensureCloudflared
- [x] startTunnel rejects when cloudflared unavailable

### E2E Tests — Error Handling (14 points)
- [x] Expired token rejected
- [x] Malformed JWT rejected
- [x] Missing auth header → 401
- [x] Campaign 404s (GET, PUT, analytics)
- [x] Candidate 404s (improve, approve)
- [x] Candidate 400 (missing feedbackType)
- [x] Cookie 400s and 404s
- [x] Feedback 400s (empty feedback, missing feedback)
- [x] Registration 403 (non-admin)
- [x] Short password rejection

---

**Total Test Points: ~90+**
