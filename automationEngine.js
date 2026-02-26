const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { tuneMessage } = require('./messageTuner');
const { generateOutreachMessage } = require('./messageGenerator');
const store = require('./store');

const SCREENSHOT_DIR = process.env.SCREENSHOTS_DIR || './screenshots';
const USER_DATA_DIR = process.env.USER_DATA_DIR || './browser-data';

let browser = null;
let context = null;
let page = null;
let currentRun = null;
let stopRequested = false;
let broadcastFn = () => {};

function setBroadcast(fn) { broadcastFn = fn; }

function broadcast(event, data) {
  broadcastFn({ event, ...data, timestamp: new Date().toISOString() });
}

// ── Selectors with fallbacks ──

const SELECTORS = {
  candidateCards: [
    'div.row__top-card',
    '[class*="row__top-card"]',
    '[data-test-pipeline-kanban] .pipeline-card',
    '.hire-pipeline-card',
    '[class*="pipeline"] [class*="card"]',
    '.artdeco-list__item',
    '[data-test-row]',
    'li[class*="candidate"]',
  ],
  candidateLink: [
    'a[href*="/talent/profile/"]',
    'a[href*="linkedin.com/in/"]',
    'a[href*="/talent/hire/"]',
    'a[class*="profile-link"]',
  ],
  candidateName: [
    'a[href*="/talent/profile/"]',
    '[data-test-candidate-name]',
    '.artdeco-entity-lockup__title',
    '[class*="candidate-name"]',
    'span[class*="name"]',
    'a[href*="/in/"]',
  ],
  candidateHeadline: [
    '[data-test-candidate-headline]',
    '.artdeco-entity-lockup__subtitle',
    '[class*="headline"]',
    'span[class*="title"]',
  ],
  messageButton: [
    'button[data-test-send-inmail]',
    '[class*="message-icon"]',
    'button[aria-label*="Message"]',
    'button[aria-label*="InMail"]',
    'a[aria-label*="Message"]',
    'a[aria-label*="InMail"]',
    '[class*="mail"] button',
    '[class*="mail"] a',
    'svg[data-test-icon="send-privately-small"]',
    'button:has-text("Message")',
    'button:has-text("InMail")',
    '[class*="inmail"] button',
    'button:has-text("Send message")',
  ],
  subjectInput: [
    'input[name="subject"]',
    '[data-test-inmail-subject]',
    'input[placeholder*="Subject"]',
    'input[placeholder*="subject"]',
    '[class*="subject"] input',
  ],
  messageBody: [
    '[data-test-inmail-body]',
    'div[contenteditable="true"][role="textbox"]',
    'div[contenteditable="true"]',
    'textarea[name="body"]',
    'textarea',
    '[class*="message-body"] [contenteditable]',
  ],
  sendButton: [
    'button[data-test-send-inmail-button]',
    'button:has-text("Send")',
    '[class*="send"] button',
  ],
  pipelineStage: [
    'button:has-text("Change stage")',
    '[data-test-pipeline-stage-selector]',
    'button:has-text("Uncontacted")',
    '[class*="pipeline-stage"] button',
    '[class*="stage-selector"]',
    '[class*="change-stage"]',
  ],
  uncontactedTab: [
    '[data-test-pipeline-stage="UNCONTACTED"]',
    'button:has-text("Uncontacted")',
    '[class*="stage"]:has-text("Uncontacted")',
    'div[role="tab"]:has-text("Uncontacted")',
  ],
  contactedOption: [
    'li:has-text("Contacted")',
    'option:has-text("Contacted")',
    '[data-test-pipeline-stage="CONTACTED"]',
    '[class*="stage"]:has-text("Contacted")',
  ],
  closeMessageDialog: [
    'button[data-test-modal-close-btn]',
    'button:has-text("Discard")',
    '[class*="close"] button',
    'button[aria-label="Close"]',
  ],
};

async function trySelector(pageOrEl, selectors, options = {}) {
  const { timeout = 5000, state = 'visible' } = options;
  for (const sel of selectors) {
    try {
      const el = await pageOrEl.waitForSelector(sel, { timeout, state });
      if (el) return el;
    } catch {}
  }
  return null;
}

async function trySelectorAll(pageOrEl, selectors, options = {}) {
  const { timeout = 5000 } = options;
  for (const sel of selectors) {
    try {
      await pageOrEl.waitForSelector(sel, { timeout });
      const els = await pageOrEl.$$(sel);
      if (els.length > 0) return els;
    } catch {}
  }
  return [];
}

async function takeScreenshot(label) {
  if (!page) return null;
  if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const filename = `${label}-${Date.now()}.png`;
  const filepath = path.join(SCREENSHOT_DIR, filename);
  try {
    await page.screenshot({ path: filepath, fullPage: false });
    return filepath;
  } catch (err) {
    console.error(`[screenshot] Failed: ${err.message}`);
    return null;
  }
}

async function sleep(min, max) {
  const ms = (Math.random() * (max - min) + min) * 1000;
  console.log(`[rate-limit] Waiting ${(ms / 1000).toFixed(1)}s...`);
  broadcast('waiting', { seconds: (ms / 1000).toFixed(1) });
  return new Promise(r => setTimeout(r, ms));
}

// ── Browser lifecycle ──

async function launchBrowser() {
  const userDataDir = path.resolve(USER_DATA_DIR);
  if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir, { recursive: true });

  console.log(`[browser] Launching headed Chromium (data: ${userDataDir})`);
  context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1440, height: 900 },
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ],
    ignoreDefaultArgs: ['--enable-automation'],
    locale: 'en-US',
    timezoneId: 'America/New_York',
  });

  page = context.pages()[0] || await context.newPage();

  // Stealth: remove webdriver flag
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  console.log('[browser] Browser launched');
  return { context, page };
}

async function ensureLoggedIn(projectUrl) {
  if (!page) throw new Error('Browser not launched');

  console.log('[login] Navigating to LinkedIn Recruiter...');
  broadcast('status', { message: 'Navigating to LinkedIn Recruiter...' });
  await page.goto(projectUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);

  const url = page.url();
  if (url.includes('login') || url.includes('authwall') || url.includes('checkpoint')) {
    console.log('[login] Login required — please log in in the browser window');
    broadcast('login_required', { message: 'Please log in to LinkedIn Recruiter in the browser window...' });

    try {
      await page.waitForURL('**/talent/**', { timeout: 300000 });
      console.log('[login] Login successful!');
      broadcast('login_success', { message: 'Login successful!' });
    } catch {
      throw new Error('Login timed out after 5 minutes. Please restart and try again.');
    }
  } else if (url.includes('/talent/')) {
    console.log('[login] Already logged in');
    broadcast('login_success', { message: 'Already logged in' });
  } else {
    console.log(`[login] Unexpected URL: ${url}, attempting to continue...`);
  }

  // Navigate to the project URL if not already there
  if (!page.url().includes(projectUrl.split('/').pop())) {
    await page.goto(projectUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);
  }
}

// ── Candidate extraction ──

async function clickUncontactedFilter() {
  console.log('[pipeline] Looking for Uncontacted filter...');
  const el = await trySelector(page, SELECTORS.uncontactedTab, { timeout: 10000 });
  if (el) {
    await el.click();
    await page.waitForTimeout(2000);
    console.log('[pipeline] Clicked Uncontacted filter');
    return true;
  }
  console.log('[pipeline] Uncontacted filter not found, may already be filtered');
  return false;
}

async function getCandidateCards() {
  // Scroll down repeatedly to load all visible candidate cards (LinkedIn lazy-loads them)
  let previousCount = 0;
  let scrollAttempts = 0;
  const MAX_SCROLL_ATTEMPTS = 20;

  while (scrollAttempts < MAX_SCROLL_ATTEMPTS) {
    const cards = await trySelectorAll(page, SELECTORS.candidateCards, { timeout: 10000 });
    const currentCount = cards.length;
    console.log(`[candidates] Scroll ${scrollAttempts + 1}: found ${currentCount} cards`);

    if (currentCount === 0 && scrollAttempts === 0) {
      console.log('[candidates] No candidate cards found, taking screenshot for debugging');
      await takeScreenshot('no-candidates');
    }

    if (currentCount > 0 && currentCount === previousCount) {
      // No new cards loaded after scroll — check for "Next" / pagination button
      const nextBtn = await page.$('button[aria-label*="Next"], button[aria-label*="next"], [class*="pagination"] button:last-child, button[class*="next"]');
      if (nextBtn) {
        const isDisabled = await nextBtn.getAttribute('disabled');
        if (!isDisabled) {
          console.log('[candidates] Clicking next page...');
          await nextBtn.click();
          await page.waitForTimeout(3000);
          scrollAttempts++;
          previousCount = 0; // Reset — new page will have fresh cards
          continue;
        }
      }
      // No more cards to load
      break;
    }

    previousCount = currentCount;
    scrollAttempts++;

    // Scroll to bottom to trigger lazy loading
    await page.evaluate(() => {
      const scrollable = document.querySelector('[class*="pipeline"], [class*="list"], main, [role="main"]') || document.documentElement;
      scrollable.scrollTop = scrollable.scrollHeight;
      window.scrollTo(0, document.body.scrollHeight);
    });
    await page.waitForTimeout(2000);
  }

  const finalCards = await trySelectorAll(page, SELECTORS.candidateCards, { timeout: 5000 });
  console.log(`[candidates] Final count: ${finalCards.length} cards after ${scrollAttempts} scroll(s)`);
  return finalCards;
}

async function extractCandidateInfo(card) {
  const info = { name: 'Unknown', headline: '', linkedin_url: '' };

  // Name
  for (const sel of SELECTORS.candidateName) {
    try {
      const el = await card.$(sel);
      if (el) {
        info.name = (await el.innerText()).trim();
        break;
      }
    } catch {}
  }

  // Headline
  for (const sel of SELECTORS.candidateHeadline) {
    try {
      const el = await card.$(sel);
      if (el) {
        info.headline = (await el.innerText()).trim();
        break;
      }
    } catch {}
  }

  // Profile URL — try multiple strategies
  // First: look for /in/ links (public profile)
  try {
    const publicLink = await card.$('a[href*="/in/"]');
    if (publicLink) {
      info.linkedin_url = await publicLink.getAttribute('href') || '';
    }
  } catch {}
  
  // Second: any profile link
  if (!info.linkedin_url) {
    for (const sel of SELECTORS.candidateLink) {
      try {
        const el = await card.$(sel);
        if (el) {
          info.linkedin_url = await el.getAttribute('href') || '';
          break;
        }
      } catch {}
    }
  }
  
  if (info.linkedin_url && !info.linkedin_url.startsWith('http')) {
    info.linkedin_url = 'https://www.linkedin.com' + info.linkedin_url;
  }

  console.log(`[extract] ${info.name} | ${info.headline} | URL: ${info.linkedin_url || 'none'}`);
  return info;
}

// ── Message generation ──

function parseRecruiterResponse(content) {
  let subject = '';
  let body = content;

  // Try to parse structured output: A) ... B) ... C) ...
  const subjectMatch = content.match(/A\)\s*(?:SUBJECT LINE OPTION 1[^:\n]*[:\n]\s*)?(.+)/i);
  if (subjectMatch) {
    subject = subjectMatch[1].trim();
  }

  const bodyMatch = content.match(/C\)\s*(?:INMAIL BODY[^:\n]*[:\n]\s*)?([\s\S]+)/i);
  if (bodyMatch) {
    body = bodyMatch[1].trim();
  }

  return { subject, body };
}

async function generateMessage(candidateInfo) {
  console.log(`[message] Generating message for ${candidateInfo.name}...`);
  broadcast('generating_message', { candidate: candidateInfo.name });

  const mode = process.env.OUTREACH_MODE || 'recruiter';
  const result = await generateOutreachMessage(candidateInfo, mode);

  // Parse structured response for recruiter mode
  if (mode === 'recruiter') {
    const parsed = parseRecruiterResponse(result.message);
    return {
      subject: parsed.subject,
      message: parsed.body,
      profile: result.profile,
    };
  }

  // Sales mode returns plain message
  return {
    subject: '',
    message: result.message,
    profile: result.profile,
  };
}

// ── InMail compose & send ──

async function openMessageCompose(card) {
  // Strategy 1: Find the message/envelope icon directly on the card row
  // (avoids clicking the card which opens an overlay that blocks everything)
  console.log('[compose] Looking for message icon on card...');
  
  // Try finding the message icon within the card first
  let btn = null;
  const cardMessageSelectors = [
    'a[aria-label*="Message"]',
    'a[aria-label*="InMail"]',
    'button[aria-label*="Message"]',
    'button[aria-label*="InMail"]',
    '[data-test-send-inmail]',
    '[class*="message-icon"]',
    '[class*="mail-icon"]',
    'a[href*="message"]',
    // The envelope icon next to Archive button
    'a[class*="icon"]',
    'button[class*="icon"]',
  ];

  for (const sel of cardMessageSelectors) {
    try {
      const el = await card.$(sel);
      if (el) {
        const ariaLabel = await el.getAttribute('aria-label') || '';
        const text = await el.innerText().catch(() => '');
        console.log(`[compose] Found element: ${sel} (aria: "${ariaLabel}", text: "${text}")`);
        btn = el;
        break;
      }
    } catch {}
  }

  // Strategy 2: Look for any clickable element near the Archive button area
  if (!btn) {
    console.log('[compose] Trying to find envelope icon near action buttons...');
    try {
      // Find all links/buttons in the card's action area
      const actionElements = await card.$$('a, button');
      for (const el of actionElements) {
        const ariaLabel = await el.getAttribute('aria-label') || '';
        const title = await el.getAttribute('title') || '';
        const className = await el.getAttribute('class') || '';
        if (ariaLabel.toLowerCase().includes('message') || 
            ariaLabel.toLowerCase().includes('inmail') || 
            ariaLabel.toLowerCase().includes('mail') ||
            title.toLowerCase().includes('message') ||
            title.toLowerCase().includes('inmail') ||
            className.includes('message') ||
            className.includes('mail')) {
          console.log(`[compose] Found action element: aria="${ariaLabel}" title="${title}" class="${className}"`);
          btn = el;
          break;
        }
      }
    } catch (err) {
      console.log(`[compose] Action scan failed: ${err.message}`);
    }
  }

  // Strategy 3: Click candidate name to open profile, then find message button
  if (!btn) {
    console.log('[compose] No message icon on card, clicking candidate to open profile...');
    try {
      const nameLink = await card.$('a[href*="/talent/profile/"]') || await card.$('a');
      if (nameLink) {
        await nameLink.click({ force: true });
        await page.waitForTimeout(3000);
      }
    } catch (err) {
      console.log(`[compose] Name click failed: ${err.message}`);
    }

    btn = await trySelector(page, SELECTORS.messageButton, { timeout: 8000 });
  }

  if (!btn) {
    // Take a screenshot for debugging
    await takeScreenshot('no-message-button');
    throw new Error('Could not find Message/InMail button');
  }

  await btn.click({ force: true });
  await page.waitForTimeout(2000);
  
  // Verify a compose dialog opened (look for subject or body input)
  const composeOpen = await trySelector(page, SELECTORS.subjectInput, { timeout: 5000 }) ||
                      await trySelector(page, SELECTORS.messageBody, { timeout: 3000 });
  if (!composeOpen) {
    console.log('[compose] Compose dialog may not have opened, taking screenshot...');
    await takeScreenshot('compose-not-open');
  }
  
  return true;
}

async function fillSubject(subject) {
  const el = await trySelector(page, SELECTORS.subjectInput, { timeout: 5000 });
  if (el) {
    await el.click();
    await el.fill('');
    await el.type(subject, { delay: 30 + Math.random() * 40 });
    return true;
  }
  console.log('[compose] Subject input not found (may not be required)');
  return false;
}

async function fillMessageBody(message) {
  const el = await trySelector(page, SELECTORS.messageBody, { timeout: 5000 });
  if (!el) throw new Error('Could not find message body field');

  await el.click();
  await page.waitForTimeout(500);

  // Clear existing content
  const tagName = await el.evaluate(e => e.tagName.toLowerCase());
  if (tagName === 'textarea' || tagName === 'input') {
    await el.fill('');
    await el.type(message, { delay: 25 + Math.random() * 35 });
  } else {
    // contenteditable div
    await el.evaluate(e => e.innerHTML = '');
    await el.type(message, { delay: 25 + Math.random() * 35 });
  }
  return true;
}

async function clickSend() {
  const btn = await trySelector(page, SELECTORS.sendButton, { timeout: 5000 });
  if (!btn) throw new Error('Could not find Send button');
  await btn.click();
  await page.waitForTimeout(2000);
  return true;
}

async function closeMessageDialog() {
  const btn = await trySelector(page, SELECTORS.closeMessageDialog, { timeout: 3000 });
  if (btn) {
    await btn.click();
    await page.waitForTimeout(1000);
  }
}

// ── Pipeline stage ──

async function moveToCont(card) {
  try {
    const stageBtn = await trySelector(card, SELECTORS.pipelineStage, { timeout: 3000 });
    if (stageBtn) {
      await stageBtn.click();
      await page.waitForTimeout(1000);
      const contacted = await trySelector(page, SELECTORS.contactedOption, { timeout: 3000 });
      if (contacted) {
        await contacted.click();
        await page.waitForTimeout(1000);
        console.log('[pipeline] Moved candidate to Contacted');
        return true;
      }
    }
  } catch (err) {
    console.log(`[pipeline] Could not move to Contacted: ${err.message}`);
  }
  return false;
}

// ── Main run ──

async function runOutreach(options = {}) {
  const {
    projectUrl = process.env.PROJECT_URL,
    runMode = process.env.RUN_MODE || 'dry_run',
    maxCandidates = parseInt(process.env.MAX_CANDIDATES) || 20,
    rateLimitMin = parseInt(process.env.RATE_LIMIT_MIN) || 20,
    rateLimitMax = parseInt(process.env.RATE_LIMIT_MAX) || 60,
  } = options;

  stopRequested = false;
  const runId = store.createRun(projectUrl, runMode, maxCandidates);
  currentRun = runId;

  broadcast('run_started', { runId, runMode, maxCandidates, projectUrl });
  console.log(`[run] Started run ${runId} (mode: ${runMode}, max: ${maxCandidates})`);

  try {
    // Launch browser if not running
    if (!context || !page) {
      await launchBrowser();
    }

    // Ensure logged in
    await ensureLoggedIn(projectUrl);
    await takeScreenshot('after-login');

    // Click Uncontacted filter
    await clickUncontactedFilter();
    await takeScreenshot('uncontacted-filter');

    // Get candidate cards (with scroll/pagination)
    let cards = await getCandidateCards();
    let total = Math.min(cards.length, maxCandidates);
    console.log(`[run] Found ${cards.length} candidates, processing up to ${total}`);
    broadcast('candidates_found', { total: cards.length, processing: total });

    if (total === 0) {
      store.updateRun(runId, { status: 'completed', finished_at: new Date().toISOString() });
      broadcast('run_completed', { runId, processed: 0 });
      return { runId, processed: 0, status: 'completed' };
    }

    let processed = 0, succeeded = 0, failed = 0, skipped = 0;
    let cardIndex = 0;

    while (processed < maxCandidates) {
      if (stopRequested) {
        console.log('[run] Stop requested');
        broadcast('run_stopped', { runId, processed });
        break;
      }

      // Re-query cards to handle stale DOM refs (after scroll/page change)
      if (cardIndex >= cards.length) {
        // Try to load more via scroll or pagination
        const prevCount = cards.length;
        const nextBtn = await page.$('button[aria-label*="Next"], button[aria-label*="next"], [class*="pagination"] button:last-child, button[class*="next"]');
        if (nextBtn) {
          const isDisabled = await nextBtn.getAttribute('disabled');
          if (!isDisabled) {
            console.log('[run] Navigating to next page...');
            await nextBtn.click();
            await page.waitForTimeout(3000);
            cards = await trySelectorAll(page, SELECTORS.candidateCards, { timeout: 10000 });
            cardIndex = 0;
            if (cards.length === 0) {
              console.log('[run] No more candidates on next page');
              break;
            }
            console.log(`[run] Next page: ${cards.length} candidates`);
            continue;
          }
        }
        // No next page — try scrolling
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(2000);
        cards = await trySelectorAll(page, SELECTORS.candidateCards, { timeout: 5000 });
        if (cards.length <= prevCount) {
          console.log('[run] No more candidates to load');
          break;
        }
        console.log(`[run] Scrolled: now ${cards.length} candidates`);
        // cardIndex stays the same — continue from where we left off
        continue;
      }

      const card = cards[cardIndex];
      cardIndex++;
      let candidateId;

      try {
        // Extract candidate info
        const info = await extractCandidateInfo(card);
        console.log(`[run] Processing ${processed + 1}/${maxCandidates}: ${info.name}`);
        broadcast('processing_candidate', { index: processed + 1, total: maxCandidates, name: info.name });

        candidateId = store.createCandidate({ ...info, run_mode: runMode });

        // Generate message
        const generated = await generateMessage(info, card);
        const tuned = tuneMessage(generated.message, generated.subject);

        store.updateCandidate(candidateId, {
          subject: generated.subject,
          message: generated.message,
          tuned_message: tuned.message,
        });

        broadcast('message_generated', {
          candidateId,
          name: info.name,
          subject: tuned.subject || generated.subject,
          message: tuned.message,
          original: generated.message,
        });

        if (runMode === 'dry_run') {
          console.log(`[dry_run] Would send to ${info.name}:`);
          console.log(`  Subject: ${tuned.subject || generated.subject}`);
          console.log(`  Message: ${tuned.message.substring(0, 100)}...`);
          store.updateCandidate(candidateId, { status: 'dry_run' });
          succeeded++;
        } else if (runMode === 'manual_review') {
          store.updateCandidate(candidateId, { status: 'pending_review' });
          broadcast('pending_review', { candidateId, name: info.name });
          console.log(`[manual_review] Queued ${info.name} for review`);
          succeeded++;
        } else if (runMode === 'auto_send') {
          // Open compose, fill, send
          await openMessageCompose(card);
          await takeScreenshot(`compose-${processed}`);

          const subjectToSend = tuned.subject || generated.subject;
          if (subjectToSend) await fillSubject(subjectToSend);
          await fillMessageBody(tuned.message);
          await takeScreenshot(`filled-${processed}`);

          await clickSend();
          await takeScreenshot(`sent-${processed}`);

          // Move to Contacted
          await moveToCont(card);

          store.updateCandidate(candidateId, { status: 'sent' });
          broadcast('message_sent', { candidateId, name: info.name });
          console.log(`[auto_send] Sent message to ${info.name}`);
          succeeded++;
        }

        processed++;
        store.updateRun(runId, { processed, succeeded, failed, skipped });

        // Rate limit between candidates
        if (processed < maxCandidates) {
          await sleep(rateLimitMin, rateLimitMax);
        }

      } catch (err) {
        console.error(`[run] Error processing candidate: ${err.message}`);
        const screenshot = await takeScreenshot(`error-${processed}`);
        if (candidateId) {
          store.updateCandidate(candidateId, {
            status: 'error',
            error: err.message,
            screenshot_path: screenshot || '',
          });
        }
        failed++;
        processed++;
        store.updateRun(runId, { processed, succeeded, failed, skipped });
        broadcast('candidate_error', { index: i + 1, error: err.message });

        // Try to close any open dialogs
        await closeMessageDialog();
      }
    }

    const finalStatus = stopRequested ? 'stopped' : 'completed';
    store.updateRun(runId, {
      status: finalStatus,
      finished_at: new Date().toISOString(),
      processed, succeeded, failed, skipped,
    });

    broadcast('run_completed', { runId, status: finalStatus, processed, succeeded, failed, skipped });
    console.log(`[run] ${finalStatus}: ${processed} processed, ${succeeded} succeeded, ${failed} failed`);
    return { runId, status: finalStatus, processed, succeeded, failed, skipped };

  } catch (err) {
    console.error(`[run] Fatal error: ${err.message}`);
    store.updateRun(runId, {
      status: 'error',
      error: err.message,
      finished_at: new Date().toISOString(),
    });
    broadcast('run_error', { runId, error: err.message });
    throw err;
  }
}

async function approveCandidate(candidateId) {
  const candidate = store.getCandidate(candidateId);
  if (!candidate) throw new Error('Candidate not found');
  if (candidate.status !== 'pending_review') throw new Error('Candidate not pending review');

  if (!page) throw new Error('Browser not running');

  try {
    // Navigate to candidate profile if we have a URL
    if (candidate.linkedin_url) {
      await page.goto(candidate.linkedin_url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2000);
    }

    // Find and click message button
    const msgBtn = await trySelector(page, SELECTORS.messageButton, { timeout: 8000 });
    if (!msgBtn) throw new Error('Could not find Message button');
    await msgBtn.click();
    await page.waitForTimeout(2000);

    const subject = candidate.subject;
    const message = candidate.tuned_message || candidate.message;

    if (subject) await fillSubject(subject);
    await fillMessageBody(message);
    await clickSend();

    store.updateCandidate(candidateId, { status: 'sent' });
    broadcast('message_sent', { candidateId, name: candidate.name });
    return { success: true };
  } catch (err) {
    store.updateCandidate(candidateId, { status: 'error', error: err.message });
    throw err;
  }
}

function requestStop() {
  stopRequested = true;
  broadcast('stop_requested', {});
}

function getStatus() {
  const run = currentRun ? store.getRun(currentRun) : store.getLatestRun();
  return {
    running: run?.status === 'running',
    currentRun: run || null,
    browserConnected: !!page,
    pendingReview: store.getPendingCandidates().length,
  };
}

async function closeBrowser() {
  if (context) {
    await context.close();
    context = null;
    page = null;
    console.log('[browser] Closed');
  }
}

module.exports = {
  runOutreach, approveCandidate, requestStop, getStatus,
  launchBrowser, closeBrowser, setBroadcast,
};
