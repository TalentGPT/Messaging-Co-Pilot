# Messaging Co-Pilot — Full System Specification

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│              Web Dashboard (public/)                 │
│         React SPA served by Express                  │
│     Login → Campaign Setup → Run → Review → Send     │
└───────────────────┬─────────────────────────────────┘
                    │ REST API + WebSocket (real-time)
┌───────────────────▼─────────────────────────────────┐
│               server.js (Express + WS)               │
│  Auth · Campaign CRUD · Run orchestration · Scoring  │
│  Feedback loop · Cookie mgmt · Cloudflare tunnel     │
└───┬───────────┬──────────┬──────────┬───────────────┘
    │           │          │          │
┌───▼───┐ ┌────▼────┐ ┌───▼────┐ ┌───▼────┐
│store.js│ │ engine  │ │msgGen  │ │ tuner  │
│JSON DB │ │Playwright│ │OpenAI  │ │Post-   │
│per-user│ │Chromium  │ │GPT-4o  │ │process │
└────────┘ └─────────┘ └────────┘ └────────┘
```

**Runs on:** Joe's Windows machine (headed Chromium with real LinkedIn session)
**Tunnel:** Cloudflare Quick Tunnel exposes localhost:3847 → public URL for dashboard access
**No PhantomBuster.** Everything is local Playwright + OpenAI API.

---

## 1. AUTHENTICATION SYSTEM (`server.js`)

### Components
- JWT-based auth (7-day expiry)
- Password hashing via bcrypt
- User store: `users.json` (flat file)
- Default admin: `admin / admin123` (with `mustChangePassword` flag)

### Endpoints
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/auth/login` | No | Login → JWT token + cookie |
| POST | `/api/auth/logout` | No | Clear cookie |
| GET | `/api/auth/me` | Yes | Current user info |
| POST | `/api/auth/register` | Admin | Create new user |
| POST | `/api/auth/change-password` | Yes | Change own password |

### Test Points
- [ ] Login with valid credentials → returns JWT token
- [ ] Login with invalid credentials → 401
- [ ] Default admin account exists on first boot
- [ ] `mustChangePassword` flag enforced
- [ ] JWT token expires after 7 days
- [ ] Register requires admin role
- [ ] Auth middleware blocks unauthenticated requests to all `/api/*` routes

---

## 2. CAMPAIGN SYSTEM (`server.js` + `store.js`)

### Data Model (per campaign)
```json
{
  "id": "uuid",
  "name": "string",
  "type": "recruiting | sales",
  "outcome": "Goal text — what does success look like?",
  "tone": "executive | conversational | etc.",
  "constraints": ["max 100 words", "no jargon"],
  "context": "Legacy: raw context for prompt generation",
  "prompt": "The active system prompt for message generation",
  "promptVersion": 1,
  "promptLibrary": [{ version, prompt, score, active, createdAt, feedbackCount }],
  "feedbackDataset": [{ message, candidateContext, promptUsed, feedback, correction, timestamp }],
  "linkedinProjectUrl": "https://linkedin.com/talent/hire/...",
  "status": "draft | active"
}
```

### Endpoints
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/campaigns` | List user's campaigns |
| POST | `/api/campaigns` | Create campaign |
| GET | `/api/campaigns/:id` | Get single campaign |
| PUT | `/api/campaigns/:id` | Update campaign |
| DELETE | `/api/campaigns/:id` | Delete campaign |
| POST | `/api/campaigns/:id/generate-prompt` | Auto-generate prompt from context via OpenAI |
| POST | `/api/campaigns/:id/run` | Start outreach run |
| GET | `/api/campaigns/:id/prompt-versions` | Get prompt version history |
| GET | `/api/campaigns/:id/analytics` | Get campaign analytics |
| POST | `/api/campaigns/:id/feedback` | Legacy: apply feedback + evolve prompt |

### Test Points
- [ ] CRUD: create, read, update, delete campaigns
- [ ] Campaign scoped to authenticated user (user A can't see user B's campaigns)
- [ ] `generate-prompt` creates prompt from context and adds to promptLibrary
- [ ] Prompt library tracks versions, active flag, feedback count
- [ ] Analytics returns: totalGenerated, avgScore, approvalRate, feedbackBreakdown

---

## 3. AUTOMATION ENGINE (`automationEngine.js`)

### Browser Lifecycle
1. **Launch:** Headed Chromium via Playwright, persistent profile at `./browser-data`
2. **Login check:** Navigates to LinkedIn Recruiter, verifies logged-in state
3. **Cookie injection:** Optional — can inject session cookies from dashboard

### Pipeline Flow (per run)
```
1. Navigate to LinkedIn Recruiter project URL
2. Click "Uncontacted" filter
3. Scroll to load all candidate cards (up to stable count)
4. For each candidate (up to maxCandidates):
   a. Extract basic info from card (name, headline, URL)
   b. Click candidate → open profile panel
   c. NEW: Scrape full profile (experience, education, skills, summary, location)
   d. Close profile panel
   e. Generate personalized message via OpenAI
   f. Auto-score message (0-100)
   g. If score < 70: auto-regenerate (up to 2 attempts)
   h. Based on run mode:
      - dry_run: log message, don't send
      - manual_review: queue for dashboard approval
      - auto_send: open compose → fill subject + body → click Send
   i. Rate limit delay (random 20-60s between candidates)
```

### Key Functions

| Function | Purpose |
|----------|---------|
| `launchBrowser()` | Start Playwright Chromium with persistent data dir |
| `ensureLoggedIn(url)` | Navigate + verify LinkedIn Recruiter session |
| `clickUncontactedFilter()` | Click "Uncontacted" pipeline filter |
| `getCandidateCards()` | Scroll + collect all `.row__top-card` elements |
| `extractCandidateInfo(card)` | Pull name, headline, URL from card DOM |
| `scrapeProfilePanel(card, name)` | **NEW** — Click into profile, scrape experience/edu/skills/summary/location |
| `openMessageCompose(card, name)` | Click Message button (4 fallback approaches) |
| `fillSubject(subject)` | Fill InMail subject field |
| `fillMessageBody(message)` | Fill InMail body (handles contenteditable + textarea) |
| `clickSend()` | Click Send button (JS click primary, Playwright fallback) |
| `closeMessageDialog()` | Close compose dialog |
| `moveToCont(card)` | Move candidate to "Contacted" pipeline stage |
| `approveCandidate(id)` | Manual review flow: navigate to profile → compose → fill → send |
| `takeScreenshot(label)` | Save debug screenshot to `./screenshots/` |

### Notification Overlay Fix
Before any click on Message/Send buttons, the engine dismisses LinkedIn's notification dropdown:
```js
await page.evaluate(() => {
  const notif = document.querySelector('[data-test-notifications-dropdown-trigger][aria-expanded="true"]');
  if (notif) notif.click();
  document.body.click();
});
```

### Profile Panel Scraping (NEW)
Extracts from LinkedIn Recruiter profile panel:
- **Location**: `[data-test-candidate-location]`, `.artdeco-entity-lockup__caption`, `[class*="location"]`
- **Summary/About**: `[class*="summary"]`, `[class*="about"]`, `[data-test-summary]`
- **Experiences**: `[class*="experience"] li` → title, company, dates, location, description
- **Education**: `[class*="education"] li` → school, degree, dates
- **Skills**: `[class*="skill"]` elements

### Test Points
- [ ] Browser launches headed with persistent data dir
- [ ] Login detection works (doesn't re-login if session valid)
- [ ] Uncontacted filter click works
- [ ] Scrolling loads all cards (stable count detection after 4 rounds)
- [ ] Card extraction pulls name + headline + URL
- [ ] **Profile scrape returns experience data (not empty)**
- [ ] **Profile scrape returns education data**
- [ ] **Profile scrape returns skills**
- [ ] **Profile scrape returns location**
- [ ] Profile panel closes after scrape (Escape or back button)
- [ ] Notification dropdown dismissed before Message button click
- [ ] Message compose dialog opens (4 fallback approaches)
- [ ] Subject field fills correctly
- [ ] Body field fills correctly (contenteditable handling)
- [ ] Send button clicked via JS (bypasses overlay interception)
- [ ] Rate limiting: random delay between candidates
- [ ] `dry_run` mode: generates but doesn't send
- [ ] `manual_review` mode: queues for dashboard review
- [ ] `auto_send` mode: composes and sends InMail
- [ ] `approveCandidate()`: navigates to profile → composes → sends
- [ ] Screenshots saved at each step for debugging
- [ ] Stop requested → gracefully stops processing
- [ ] Skip list (`SKIP_CANDIDATES` env var) works
- [ ] Already-processed candidates skipped on re-navigation
- [ ] Candidates with no name/URL skipped

---

## 4. MESSAGE GENERATION (`messageGenerator.js`)

### OpenAI Integration
- **Model:** `gpt-4o`
- **API Key:** From `OPENAI_API_KEY` env var

### Generation Modes

#### A. Custom Prompt Mode (campaign has a prompt)
- System prompt = campaign's custom prompt
- User prompt = `formatUserPrompt(candidateInfo)` → formatted profile text

#### B. Goal-Based Mode (campaign has an `outcome` field)
- System prompt built from: outcome + tone + constraints + active prompt from library
- Includes candidate context (signals, experience, education, skills)
- Template: `generateFromCampaignGoal(candidateCtx, campaign)`

#### C. Default Mode (RECRUITER_PROMPT or SALES_PROMPT)
- Built-in prompts for Managing Partner recruiting or sales outreach
- RECRUITER_PROMPT: ~3300 chars, focuses on structural ownership, equity, control
- SALES_PROMPT: different positioning for sales outreach

### `formatUserPrompt(profile)` — What Gets Sent to OpenAI
```
Name: Sarah Spang Reagan
Headline: Sales Manager at Insight Global
Location: Atlanta, GA
Industry: Staffing
Summary: 10+ years in enterprise IT staffing...
Experience:
- Sales Manager at Insight Global (2020-Present) — Atlanta, GA
  Led a team of 12 AEs focused on IT staffing...
- Senior AE at TEKsystems (2016-2020) — Charlotte, NC
Education:
- University of Georgia — BBA Marketing (2012-2016)
Skills: IT Staffing, Enterprise Sales, Team Leadership, Salesforce
```

### `buildCandidateContext(profileData)` — Signal Extraction
Automatically detects:
- Notable companies (Google, Insight Global, TEKsystems, etc.)
- Promotion paths (multiple titles at same company)
- Leadership roles (VP, Director, Managing, Partner, etc.)
- Team sizes (from description text: "led a team of 12")
- Revenue references ("$5M portfolio")
- Total years of experience (from date ranges)
- Location and industry

### `scoreMessage(message, candidateContext, campaignGoal)`
- **Model:** GPT-4o
- **Dimensions scored (0-100 each):**
  - Personalization
  - Clarity
  - Tone
  - Response Likelihood
  - Length Efficiency
- **Also returns:** overall score, reply probability %, signal references
- **Auto-regeneration:** If score < 70, regenerates up to 2x with feedback

### `regenerateWithFeedback(candidateInfo, prompt, originalMessage, feedback, mode)`
- Takes original message + feedback text → generates improved version
- Preserves profile context and prompt

### `evolvePrompt(currentPrompt, feedbackHistory)` 
- Takes accumulated feedback → asks GPT-4o to evolve the prompt
- Auto-triggers every 5 feedback entries

### `evolvePromptFromDataset(currentPrompt, feedbackDataset)`
- More advanced: uses full feedback dataset (approved + rejected + custom corrections)
- Identifies patterns across all feedback to produce better prompts

### Test Points
- [ ] Message generated with full profile context (not just name + headline)
- [ ] Custom prompt mode uses campaign prompt as system prompt
- [ ] Goal-based mode builds prompt from outcome + tone + constraints
- [ ] Default recruiter prompt used when no campaign prompt exists
- [ ] `formatUserPrompt` includes: name, headline, location, experience, education, skills, summary
- [ ] `buildCandidateContext` extracts signals from notable companies
- [ ] `buildCandidateContext` detects promotion paths
- [ ] `buildCandidateContext` identifies leadership roles
- [ ] `buildCandidateContext` extracts team sizes and revenue references
- [ ] `scoreMessage` returns score 0-100 with breakdown
- [ ] Auto-regeneration triggers when score < 70
- [ ] Auto-regeneration caps at 2 attempts
- [ ] `regenerateWithFeedback` improves message based on feedback text
- [ ] `evolvePrompt` auto-triggers every 5 feedback entries
- [ ] Prompt library tracks version history

---

## 5. MESSAGE TUNER (`messageTuner.js`)

Post-processes every generated message before display/send:

| Step | What It Does |
|------|-------------|
| `removeEmDashes()` | Replaces `—` with periods (AI loves em dashes, humans don't) |
| `applyContractions()` | "I am" → "I'm", "you are" → "you're", etc. (40+ patterns) |
| `addFillerWords()` | "I think" → "I actually think" (max 1 filler per message) |
| `adjustLength()` | Trims to 150 words max (sentence-aware truncation) |
| `tuneSubjectLine()` | Remove Re:/Fwd:, apply contractions, cap at 60 chars |

### Test Points
- [ ] Contractions applied ("I am" → "I'm")
- [ ] Em dashes replaced with periods
- [ ] Messages capped at 150 words
- [ ] Subject lines capped at 60 chars
- [ ] Filler words added naturally (max 1)

---

## 6. DATA STORE (`store.js`)

### Storage
- **Format:** JSON files on disk
- **Per-user data:** `data/{userId}.json` — campaigns, candidates, runs, cookies
- **Legacy global:** `outreach.json` — engine compat (candidates + runs)
- **Dual write:** candidates and runs written to both user file AND legacy file

### Data Entities

#### Run
```json
{
  "id": "uuid",
  "status": "running | completed | stopped | error",
  "project_url": "LinkedIn Recruiter URL",
  "run_mode": "dry_run | manual_review | auto_send",
  "max_candidates": 20,
  "processed": 5, "succeeded": 4, "failed": 1, "skipped": 0,
  "started_at": "ISO", "finished_at": "ISO",
  "userId": "user-id", "campaignId": "campaign-id"
}
```

#### Candidate
```json
{
  "id": "uuid",
  "name": "Sarah Spang Reagan",
  "headline": "Sales Manager at Insight Global",
  "linkedin_url": "https://linkedin.com/talent/profile/...",
  "profile_data": {},
  "status": "pending | pending_review | sent | skipped | error | dry_run",
  "subject": "Subject line",
  "message": "Original message",
  "tuned_message": "Post-tuner message",
  "score": 78,
  "scoreBreakdown": { "personalization": 80, "clarity": 85, ... },
  "replyProbability": 65,
  "signals": ["Referenced: Insight Global", "Referenced: team leadership"],
  "error": null,
  "screenshot_path": null,
  "userId": "user-id",
  "campaignId": "campaign-id"
}
```

### Test Points
- [ ] User data isolated per userId
- [ ] Campaign CRUD works (create, read, update, delete)
- [ ] Candidate created with full fields
- [ ] Candidate update persists to both legacy + user store
- [ ] Run status transitions: running → completed/stopped/error
- [ ] `getPendingCandidates()` returns only `pending_review` status
- [ ] `getCandidatesByCampaign()` filters correctly

---

## 7. REAL-TIME UPDATES (WebSocket)

### Events Broadcast

| Event | When | Data |
|-------|------|------|
| `connected` | WS connection established | timestamp |
| `run_started` | Run begins | runId, mode, maxCandidates |
| `candidates_found` | Cards loaded | total, processing count |
| `processing_candidate` | Starting a candidate | index, total, name |
| `generating_message` | Message gen started | candidate name |
| `message_generated` | Message + score ready | candidateId, name, subject, message, score, replyProbability, signals |
| `pending_review` | Queued for review | candidateId, name |
| `message_sent` | InMail sent | candidateId, name |
| `candidate_skipped` | Candidate skipped | candidateId |
| `message_regenerated` | Feedback → new message | candidateId, new message, new score |
| `run_completed` | Run finished | runId, status, processed, succeeded, failed |
| `run_error` | Fatal error | runId, error message |
| `stop_requested` | Stop signal sent | — |
| `prompt_evolved` | Prompt auto-evolved | campaignId, promptVersion |
| `campaign_feedback_applied` | Bulk feedback applied | campaignId, regenerated count |
| `status` | Progress update | message text |

### Test Points
- [ ] WebSocket connects with JWT token
- [ ] Events received in real-time during run
- [ ] Dashboard updates live (no polling needed)

---

## 8. FEEDBACK LOOP SYSTEM

### Per-Candidate Feedback (👍/👎)

**Approve (👍):**
1. Logs positive signal in campaign's `feedbackDataset`
2. Calls `engine.approveCandidate()` → navigates to profile → compose → fill → send
3. Returns success/error

**Improve (👎):**
1. User selects feedback type: `too_long`, `not_personalized`, `too_salesy`, `wrong_tone`, `missed_profile_signal`, `custom`
2. Feedback logged in campaign's `feedbackDataset`
3. Message regenerated with feedback context
4. New message scored
5. **Every 5 feedback entries:** prompt auto-evolves via `evolvePromptFromDataset()`

### Prompt Evolution
- Prompt library tracks every version
- Each version stores: prompt text, score, active flag, creation date, feedback count
- When prompt evolves: old version deactivated, new version added as active
- Analytics track prompt performance over time

### Test Points
- [ ] Approve sends InMail and logs positive signal
- [ ] Improve regenerates message with feedback
- [ ] Feedback types map to correct feedback text
- [ ] Custom feedback passes user text to regeneration
- [ ] Auto-evolve triggers at feedback count 5, 10, 15...
- [ ] Evolved prompt becomes new active version in library
- [ ] Old prompt versions preserved (not deleted)

---

## 9. COOKIE MANAGEMENT

### Per-User Cookie Store
- Users can save multiple LinkedIn session cookies (e.g., different LinkedIn accounts)
- One cookie set marked as "active" — used by the browser engine
- Stored in user's data file under `cookies` key

### Endpoints
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/cookies` | List saved cookie sets |
| PUT | `/api/cookies` | Save/update cookie set |
| POST | `/api/cookies/activate` | Switch active cookie set |
| DELETE | `/api/cookies/:name` | Delete cookie set |

### Test Points
- [ ] Cookies saved per user
- [ ] Active cookie injected into browser
- [ ] Switching cookies updates engine session
- [ ] Deleting active cookie clears engine session

---

## 10. TUNNEL (`tunnel.js`)

- Uses Cloudflare's `cloudflared` binary (`bin/cloudflared.exe`)
- Creates a quick tunnel: `cloudflared tunnel --url http://localhost:3847`
- Provides public URL (e.g., `https://xyz.trycloudflare.com`)
- No Cloudflare account needed (but no uptime guarantee)
- URL changes on every restart

### Test Points
- [ ] Tunnel starts automatically on server boot
- [ ] Public URL logged to console
- [ ] Dashboard accessible via tunnel URL
- [ ] Tunnel gracefully shuts down on SIGINT

---

## 11. ENVIRONMENT VARIABLES

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | 3847 | Local server port |
| `OPENAI_API_KEY` | — | Required for message gen + scoring |
| `PROJECT_URL` | — | LinkedIn Recruiter project URL |
| `RUN_MODE` | `dry_run` | Default: `dry_run`, `manual_review`, `auto_send` |
| `MAX_CANDIDATES` | 20 | Max candidates per run |
| `RATE_LIMIT_MIN` | 20 | Min seconds between candidates |
| `RATE_LIMIT_MAX` | 60 | Max seconds between candidates |
| `OUTREACH_MODE` | `recruiter` | Prompt mode: `recruiter` or `sales` |
| `USER_DATA_DIR` | `./browser-data` | Chromium persistent profile |
| `SCREENSHOTS_DIR` | `./screenshots` | Debug screenshot output |
| `SKIP_CANDIDATES` | — | Comma-separated names to skip |
| `JWT_SECRET` | auto-generated | JWT signing key |

---

## 12. ERROR HANDLING & RECOVERY

| Scenario | Behavior |
|----------|----------|
| Candidate card stale/empty | Skipped (name=Unknown, no URL) |
| Profile panel scrape fails | Falls back to basic info (name + headline only) |
| Message compose dialog doesn't open | 4 fallback approaches tried, screenshot on failure |
| Notification dropdown blocks clicks | Auto-dismissed before every click |
| Non-standard compose dialog (checkboxes) | Detects and tries to advance past |
| Send button disabled | Waits up to 10s for enable |
| InMail credits exhausted | Error logged, candidate marked as error |
| OpenAI API error | Score defaults to 75, continues |
| Browser crash | Run fails, error status set |

### Test Points
- [ ] Stale cards skipped gracefully
- [ ] Profile scrape failure doesn't crash the run
- [ ] All 4 compose fallback approaches work
- [ ] Non-standard dialog detection works
- [ ] Send button wait-for-enable works
- [ ] OpenAI failures don't crash the run
- [ ] Error screenshots saved for debugging

---

## 13. LEGACY API ROUTES (backward compat)

These older endpoints still work alongside the campaign-based system:

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/status` | Engine status (running, pending count, etc.) |
| POST | `/api/run` | Start run without campaign |
| POST | `/api/stop` | Stop current run |
| POST | `/api/approve/:id` | Approve + send candidate |
| POST | `/api/skip/:id` | Skip candidate |
| GET | `/api/history` | Get candidate + run history |
| GET | `/api/pending` | Get pending review candidates |
| POST | `/api/regenerate/:id` | Regenerate message with feedback |

---

## 14. FILE STRUCTURE

```
linkedin-outreach-local/
├── automationEngine.js    # Playwright browser automation (1650 lines)
├── messageGenerator.js    # OpenAI message gen, scoring, evolution (831 lines)
├── messageTuner.js        # Post-processing: contractions, length, etc. (105 lines)
├── server.js              # Express API + WebSocket + auth (892 lines)
├── store.js               # JSON file-based data store (238 lines)
├── tunnel.js              # Cloudflare tunnel management (112 lines)
├── diagnose.js            # Debug utility (36 lines)
├── start.bat              # Windows launcher
├── install.bat            # Windows installer
├── .env                   # Environment config
├── users.json             # User accounts
├── outreach.json          # Legacy candidate/run data
├── prompts.json           # Saved prompts (if any)
├── public/                # Dashboard SPA
├── data/                  # Per-user JSON data files
├── browser-data/          # Chromium persistent profile
├── screenshots/           # Debug screenshots
├── bin/                   # cloudflared.exe
└── node_modules/          # Dependencies
```
