# LinkedIn Recruiter Automation — Local Runner

Runs on your Windows machine with a **real Chrome browser** (headed mode) so LinkedIn doesn't block it. Generates personalized outreach messages locally using OpenAI GPT-4o.

## Quick Start

1. **Install Node.js** from https://nodejs.org/ (v18+)
2. **Double-click `install.bat`** — installs dependencies and Chromium
3. **Copy `.env.example` to `.env`** and edit your settings
4. **Double-click `start.bat`** — launches the server + Cloudflare tunnel

## First Run

When you start for the first time:
1. The server starts and opens a Chromium browser window
2. It navigates to LinkedIn Recruiter
3. **You log in manually** in the browser window
4. The session is saved — you won't need to log in again (unless cookies expire)

## How It Works

- **Local Express server** on port 3847 with the same API as the cloud bridge
- **Cloudflare tunnel** auto-creates a public URL so Replit can reach your local machine
- **Playwright** controls a real headed Chromium browser (not headless)
- **Persistent browser context** keeps your LinkedIn session across restarts

## Run Modes

| Mode | Behavior |
|------|----------|
| `dry_run` | Generates messages but doesn't send — logs everything |
| `manual_review` | Queues messages for approval in the dashboard |
| `auto_send` | Composes and sends InMails automatically |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/run` | Start an outreach run |
| GET | `/api/status` | Current run status |
| POST | `/api/stop` | Stop current run |
| POST | `/api/approve/:id` | Approve a pending message |
| POST | `/api/skip/:id` | Skip a candidate |
| GET | `/api/history` | View run history |
| WS | `/ws` | Real-time WebSocket updates |

All endpoints require `X-API-Key` header matching `BRIDGE_API_KEY` in `.env`.

## After Starting

The tunnel URL is printed in the console. Copy it and set it as `BRIDGE_URL` in your Replit app's environment variables so the dashboard can talk to your local runner.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | **Yes** | OpenAI API key for message generation |
| `OUTREACH_MODE` | No | `recruiter` (default) or `sales` |
| `PROJECT_URL` | Yes | LinkedIn Recruiter project URL |
| `RUN_MODE` | No | `dry_run` (default), `manual_review`, or `auto_send` |
| `MAX_CANDIDATES` | No | Max candidates per run (default: 20) |
| `RATE_LIMIT_MIN` | No | Min seconds between candidates (default: 20) |
| `RATE_LIMIT_MAX` | No | Max seconds between candidates (default: 60) |
| `BRIDGE_API_KEY` | No | API key for server auth |

## Files

- `server.js` — Express API server + WebSocket
- `automationEngine.js` — Playwright browser automation
- `messageGenerator.js` — Local OpenAI message generation (replaces Replit API)
- `messageTuner.js` — Post-processes AI messages to sound natural
- `store.js` — SQLite database for run history
- `tunnel.js` — Cloudflare tunnel manager
- `browser-data/` — Persistent browser session (auto-created)
- `screenshots/` — Automation screenshots (auto-created)
- `outreach.db` — SQLite database (auto-created)

## Troubleshooting

- **Login keeps appearing**: Delete `browser-data/` folder and log in fresh
- **Tunnel won't start**: Check firewall, or manually install cloudflared
- **Selectors failing**: LinkedIn may have updated their UI — check screenshots in `screenshots/`
- **Rate limited**: Increase `RATE_LIMIT_MIN` and `RATE_LIMIT_MAX` in `.env`
