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
    'input[aria-label*="Subject"]',
    'input[aria-label*="subject"]',
  ],
  messageBody: [
    '[data-test-inmail-body]',
    'div[contenteditable="true"][role="textbox"]',
    'div[contenteditable="true"]',
    'textarea[name="body"]',
    'textarea[name="message"]',
    'textarea',
    '[class*="message-body"] [contenteditable]',
    '[role="textbox"]',
    '[aria-label*="message body"]',
    '[aria-label*="Write a message"]',
    '[placeholder*="Write a message"]',
    '[class*="msg-form"] [contenteditable]',
    '[class*="compose"] [contenteditable]',
    '[class*="inmail"] [contenteditable]',
    '[class*="compose"] textarea',
  ],
  sendButton: [
    'button[data-test-send-inmail-button]',
    'button:has-text("Send")',
    '[class*="send"] button',
    'button[aria-label*="Send"]',
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

async function inspectDOM() {
  // Auto-detect the right candidate card selector by examining the actual DOM
  console.log('[inspect] Analyzing page DOM to find candidate card selectors...');

  const results = await page.evaluate(() => {
    const report = {};

    // Test various selectors and count matches
    const testSelectors = [
      'div.row__top-card',
      '[class*="row__top-card"]',
      '[class*="pipeline"] [class*="card"]',
      '.hire-pipeline-card',
      '.artdeco-list__item',
      '[data-test-row]',
      'li[class*="candidate"]',
      // Broader selectors
      '[class*="hiring-pipeline"] li',
      '[class*="manage-pipeline"] li',
      '[class*="candidate-row"]',
      '[class*="hire-pipeline"] [class*="row"]',
      // Profile link based - find parent containers of profile links
      'a[href*="/talent/profile/"]',
    ];

    for (const sel of testSelectors) {
      try {
        const els = document.querySelectorAll(sel);
        report[sel] = els.length;
      } catch (e) {
        report[sel] = `error: ${e.message}`;
      }
    }

    // Find parent elements of profile links (these ARE the candidate cards)
    const profileLinks = document.querySelectorAll('a[href*="/talent/profile/"]');
    report['_profileLinkCount'] = profileLinks.length;

    if (profileLinks.length > 0) {
      // Examine the parent chain of the first profile link to find the card container
      const link = profileLinks[0];
      const parentChain = [];
      let el = link.parentElement;
      for (let i = 0; i < 8 && el; i++) {
        const tag = el.tagName.toLowerCase();
        const cls = el.className ? el.className.toString().substring(0, 120) : '';
        parentChain.push(`${tag}.${cls}`);
        el = el.parentElement;
      }
      report['_firstProfileLink_parentChain'] = parentChain;

      // Try to find common ancestor class for all profile links
      if (profileLinks.length >= 2) {
        const parent1 = profileLinks[0].closest('li, [class*="row"], [class*="card"], [class*="item"]');
        const parent2 = profileLinks[1].closest('li, [class*="row"], [class*="card"], [class*="item"]');
        if (parent1) report['_card1_tag_class'] = `${parent1.tagName}.${parent1.className.toString().substring(0, 120)}`;
        if (parent2) report['_card2_tag_class'] = `${parent2.tagName}.${parent2.className.toString().substring(0, 120)}`;

        // Find the most specific common selector
        if (parent1 && parent1.className) {
          const classes = parent1.className.toString().split(/\s+/).filter(c => c.length > 3);
          for (const cls of classes) {
            const count = document.querySelectorAll(`.${cls}`).length;
            if (count >= profileLinks.length) {
              report[`_potentialSelector_.${cls}`] = count;
            }
          }
        }
      }
    }

    // Also check what the scroll container might be
    const scrollContainers = [];
    document.querySelectorAll('main, [role="main"], [class*="pipeline"], [class*="scaffold"], [class*="manage"]').forEach(el => {
      if (el.scrollHeight > el.clientHeight + 100) {
        scrollContainers.push({
          tag: el.tagName,
          class: el.className.toString().substring(0, 100),
          scrollHeight: el.scrollHeight,
          clientHeight: el.clientHeight,
        });
      }
    });
    report['_scrollableContainers'] = scrollContainers;

    return report;
  });

  console.log('[inspect] DOM analysis results:');
  for (const [key, val] of Object.entries(results)) {
    if (key.startsWith('_')) {
      console.log(`[inspect]   ${key}: ${JSON.stringify(val)}`);
    } else {
      console.log(`[inspect]   "${key}" → ${val} matches`);
    }
  }

  return results;
}

async function scrollToLoadAllCards() {
  // LinkedIn Recruiter lazy-loads candidate cards as you scroll.
  // We scroll slowly and incrementally to give the page time to render.
  const MAX_SCROLL_ATTEMPTS = 40;
  const SCROLL_PAUSE_MS = 3000; // 3 seconds between scrolls
  const STABLE_THRESHOLD = 4;   // need 4 stable rounds before stopping
  let previousCount = 0;
  let stableRounds = 0;

  // Initial wait for page to settle
  await page.waitForTimeout(2000);

  for (let attempt = 0; attempt < MAX_SCROLL_ATTEMPTS; attempt++) {
    const cards = await trySelectorAll(page, SELECTORS.candidateCards, { timeout: 10000 });
    const currentCount = cards.length;
    console.log(`[scroll] Attempt ${attempt + 1}: ${currentCount} cards visible`);

    if (currentCount === 0 && attempt === 0) {
      console.log('[scroll] No cards found on first attempt, waiting longer...');
      await page.waitForTimeout(5000);
      const retry = await trySelectorAll(page, SELECTORS.candidateCards, { timeout: 10000 });
      if (retry.length === 0) {
        console.log('[scroll] Still no cards — taking debug screenshot');
        await takeScreenshot('no-candidates');
        return [];
      }
      previousCount = retry.length;
      console.log(`[scroll] After extra wait: ${retry.length} cards`);
      continue;
    }

    if (currentCount === previousCount) {
      stableRounds++;
      if (stableRounds >= STABLE_THRESHOLD) {
        console.log(`[scroll] Card count stable at ${currentCount} for ${STABLE_THRESHOLD} rounds — done scrolling`);
        break;
      }
    } else {
      stableRounds = 0;
    }
    previousCount = currentCount;

    // Incremental scroll — move down by viewport height, not jumping to bottom
    await page.evaluate(() => {
      // Find all potential scrollable containers
      const containers = [
        document.querySelector('.hiring-pipeline-candidates'),
        document.querySelector('[class*="pipeline-candidates"]'),
        document.querySelector('[class*="hiring-pipeline"] [class*="list"]'),
        document.querySelector('[class*="manage-candidates"]'),
        document.querySelector('.scaffold-layout__main'),
        document.querySelector('[class*="scaffold"] [class*="main"]'),
        document.querySelector('main'),
        document.querySelector('[role="main"]'),
      ].filter(Boolean);

      // Scroll each container incrementally (by ~800px, roughly one viewport)
      for (const el of containers) {
        el.scrollTop += 800;
      }
      // Also scroll the window incrementally
      window.scrollBy(0, 800);
    });

    // Scroll last visible card into view for precision
    const lastCard = cards[cards.length - 1];
    if (lastCard) {
      try {
        await lastCard.scrollIntoViewIfNeeded();
      } catch (e) { /* ignore */ }
    }

    await page.waitForTimeout(SCROLL_PAUSE_MS);
  }

  // Final full scroll to absolute bottom + wait
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(3000);

  const finalCards = await trySelectorAll(page, SELECTORS.candidateCards, { timeout: 5000 });
  console.log(`[scroll] Final: ${finalCards.length} cards loaded on this page`);
  return finalCards;
}

// Pagination selectors for LinkedIn Recruiter
const PAGINATION_SELECTORS = {
  nextButton: [
    'a:has-text("Next")',
    'button:has-text("Next")',
    'li.artdeco-pagination__indicator--number:last-child a',
    '[class*="pagination"] a:has-text("Next")',
    '[class*="pagination"] button:has-text("Next")',
    'a[aria-label*="Next"]',
    'button[aria-label*="Next"]',
    '[class*="pagination"] li:last-child a',
  ],
  pageNumbers: [
    'li.artdeco-pagination__indicator--number a',
    '[class*="pagination"] li a',
    '[class*="pagination"] button[aria-label*="Page"]',
  ],
};

async function getNextPageButton() {
  for (const sel of PAGINATION_SELECTORS.nextButton) {
    try {
      const btn = await page.$(sel);
      if (btn) {
        const isVisible = await btn.isVisible();
        if (isVisible) {
          // Check if disabled
          const isDisabled = await btn.getAttribute('disabled');
          const ariaDisabled = await btn.getAttribute('aria-disabled');
          if (!isDisabled && ariaDisabled !== 'true') {
            return btn;
          }
        }
      }
    } catch (e) { /* try next selector */ }
  }
  return null;
}

async function getCurrentPageInfo() {
  // Try to read "1 – 25" style indicator
  try {
    const rangeText = await page.$eval(
      '[class*="results-context"], [class*="displaying"], [class*="pagination-text"], [class*="page-range"]',
      el => el.textContent.trim()
    );
    if (rangeText) return rangeText;
  } catch (e) { /* ignore */ }
  return 'unknown';
}

async function getCandidateCards() {
  // Phase 1: Load all cards on current page via scrolling
  let allCards = await scrollToLoadAllCards();
  console.log(`[candidates] Page 1: ${allCards.length} cards`);

  // Note: We return only the current page's cards here.
  // Pagination across pages is handled in the main run loop.
  // This keeps the DOM refs fresh (navigating pages invalidates old refs).
  return allCards;
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

async function openMessageCompose(card, candidateName) {
  // STEP 1: Click candidate name to open profile panel
  console.log(`[compose] Opening profile panel for: ${candidateName}...`);
  const nameLink = await card.$('a[href*="/talent/profile/"]') || await card.$('a');
  if (!nameLink) throw new Error('Could not find candidate name link');
  
  await nameLink.click({ force: true });
  await page.waitForTimeout(4000);
  await takeScreenshot('profile-panel-opened');

  // STEP 2: Find and click the "Message" button using Playwright's text matching
  // The button text is "Message [FirstName] [LastName]" — it's the envelope icon
  console.log('[compose] Looking for Message button in profile panel...');

  let clicked = false;

  // Approach 1: Use Playwright's getByRole with name matching "Message"
  try {
    // Find all buttons, look for one starting with "Message "
    const messageBtn = await page.evaluateHandle(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.find(b => {
        const text = b.textContent.trim();
        return text.startsWith('Message ') && b.offsetParent !== null; // visible
      }) || null;
    });
    
    if (messageBtn && await messageBtn.evaluate(el => el !== null)) {
      const btnText = await messageBtn.evaluate(el => el.textContent.trim().substring(0, 50));
      console.log(`[compose] Found Message button: "${btnText}"`);
      
      // Validate button matches expected candidate (first name check)
      if (candidateName) {
        const firstName = candidateName.split(' ')[0];
        if (!btnText.includes(firstName)) {
          console.log(`[compose] ⚠ Name mismatch! Expected "${firstName}" but button says "${btnText}". Retrying...`);
          // Try clicking the card name link again and wait longer
          const retryLink = await card.$('a[href*="/talent/profile/"]') || await card.$('a');
          if (retryLink) {
            await retryLink.click({ force: true });
            await page.waitForTimeout(5000);
          }
          // Re-find the button
          const retryBtn = await page.evaluateHandle(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            return buttons.find(b => b.textContent.trim().startsWith('Message ') && b.offsetParent !== null) || null;
          });
          if (retryBtn && await retryBtn.evaluate(el => el !== null)) {
            const retryText = await retryBtn.evaluate(el => el.textContent.trim().substring(0, 50));
            console.log(`[compose] Retry found: "${retryText}"`);
            if (!retryText.includes(firstName)) {
              throw new Error(`Profile panel shows wrong candidate: "${retryText}" (expected "${firstName}")`);
            }
            await retryBtn.evaluate(el => { el.scrollIntoView({ block: 'center' }); });
            await page.waitForTimeout(500);
            await retryBtn.evaluate(el => el.click());
            console.log('[compose] ✓ JS click on Message button executed (after retry)');
            clicked = true;
          }
        }
      }
      
      if (!clicked) {
        // Click using JavaScript directly on the DOM element
        await messageBtn.evaluate(el => {
          el.scrollIntoView({ block: 'center' });
        });
        await page.waitForTimeout(500);
        
        // Try JS click first (most reliable for LinkedIn's Ember.js components)
        await messageBtn.evaluate(el => el.click());
        console.log('[compose] ✓ JS click on Message button executed');
        clicked = true;
      }
    }
  } catch (err) {
    console.log(`[compose] Approach 1 (JS find+click) failed: ${err.message}`);
  }

  // Approach 2: Use Playwright's page.click with text selector
  if (!clicked) {
    try {
      console.log('[compose] Trying Playwright text-based click...');
      await page.click('button:has-text("Message")', { timeout: 5000, force: true });
      console.log('[compose] ✓ Playwright text click executed');
      clicked = true;
    } catch (err) {
      console.log(`[compose] Approach 2 (text click) failed: ${err.message}`);
    }
  }

  // Approach 3: Find via Archive button position, then use dispatchEvent
  if (!clicked) {
    try {
      console.log('[compose] Trying Archive+1 with dispatchEvent...');
      const result = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const archiveBtn = buttons.find(b => b.textContent.trim() === 'Archive');
        if (!archiveBtn) return { found: false, reason: 'No Archive button' };
        
        let next = archiveBtn.nextElementSibling;
        while (next) {
          if (next.tagName === 'BUTTON' || next.tagName === 'A') {
            next.scrollIntoView({ block: 'center' });
            // Fire full click event sequence
            next.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
            next.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            next.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
            next.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            return { found: true, text: next.textContent.trim().substring(0, 50) };
          }
          next = next.nextElementSibling;
        }
        return { found: false, reason: 'No element after Archive' };
      });
      console.log(`[compose] Archive+1 dispatchEvent result: ${JSON.stringify(result)}`);
      if (result.found) clicked = true;
    } catch (err) {
      console.log(`[compose] Approach 3 (dispatchEvent) failed: ${err.message}`);
    }
  }

  // Approach 4: Click the Messages tab in the profile panel instead
  if (!clicked) {
    try {
      console.log('[compose] Trying Messages tab in profile panel...');
      await page.click('a:has-text("Messages")', { timeout: 5000 });
      console.log('[compose] ✓ Clicked Messages tab');
      clicked = true;
    } catch (err) {
      console.log(`[compose] Approach 4 (Messages tab) failed: ${err.message}`);
    }
  }

  if (!clicked) {
    await takeScreenshot('all-compose-approaches-failed');
    throw new Error('All message compose approaches failed');
  }

  await page.waitForTimeout(3000);
  await takeScreenshot('after-message-click');

  // STEP 3: Verify compose dialog opened
  const composeOpen = await trySelector(page, SELECTORS.subjectInput, { timeout: 8000 }) ||
                      await trySelector(page, SELECTORS.messageBody, { timeout: 5000 });
  if (composeOpen) {
    console.log('[compose] ✓ Compose dialog detected');
  } else {
    console.log('[compose] Compose dialog not detected — checking for new message area...');
    await takeScreenshot('compose-detection-failed');
    
    // Maybe the compose area uses different selectors — check what's on page
    const inputs = await page.$$('input, textarea, [contenteditable="true"], [role="textbox"]');
    console.log(`[compose] Found ${inputs.length} input-like elements on page`);
    for (let i = 0; i < inputs.length; i++) {
      const el = inputs[i];
      const tag = await el.evaluate(e => e.tagName.toLowerCase());
      const type = await el.getAttribute('type') || '';
      const placeholder = await el.getAttribute('placeholder') || '';
      const aria = await el.getAttribute('aria-label') || '';
      const cls = await el.getAttribute('class') || '';
      const isVis = await el.isVisible().catch(() => false);
      if (isVis) {
        console.log(`[compose]   Input[${i}]: <${tag}> type="${type}" placeholder="${placeholder}" aria="${aria}" class="${cls.substring(0,60)}"`);
      }
    }
  }

  return true;
}

async function fillSubject(subject) {
  const el = await trySelector(page, SELECTORS.subjectInput, { timeout: 5000 });
  if (el) {
    await el.click();
    await el.fill('');
    await el.fill(subject);
    console.log(`[compose] ✓ Subject filled: "${subject}"`);
    return true;
  }
  console.log('[compose] Subject input not found (may not be required)');
  return false;
}

async function fillMessageBody(message) {
  let el = await trySelector(page, SELECTORS.messageBody, { timeout: 8000 });
  
  if (!el) {
    // Extra attempt: look for ANY contenteditable or textarea on the page
    console.log('[compose] Standard selectors failed, scanning for any text input...');
    const inputs = await page.$$('div[contenteditable="true"], textarea, [role="textbox"]');
    for (const input of inputs) {
      const isVis = await input.isVisible().catch(() => false);
      if (isVis) {
        const cls = await input.getAttribute('class') || '';
        const aria = await input.getAttribute('aria-label') || '';
        const placeholder = await input.getAttribute('placeholder') || '';
        console.log(`[compose] Found visible input: class="${cls.substring(0,60)}" aria="${aria}" placeholder="${placeholder}"`);
        el = input;
        break;
      }
    }
  }
  
  if (!el) {
    await takeScreenshot('no-message-body');
    throw new Error('Could not find message body field');
  }

  await el.click();
  await page.waitForTimeout(500);

  // Clear existing content and fill via clipboard-style paste (type() is too slow and times out)
  const tagName = await el.evaluate(e => e.tagName.toLowerCase());
  if (tagName === 'textarea' || tagName === 'input') {
    await el.fill('');
    await el.fill(message);
  } else {
    // contenteditable div — use evaluate to set text, then dispatch input event
    await el.evaluate((e, msg) => {
      e.focus();
      e.innerText = msg;
      e.dispatchEvent(new Event('input', { bubbles: true }));
      e.dispatchEvent(new Event('change', { bubbles: true }));
    }, message);
  }
  console.log(`[compose] ✓ Message body filled (${message.length} chars)`);
  return true;
}

async function clickSend() {
  const btn = await trySelector(page, SELECTORS.sendButton, { timeout: 5000 });
  if (!btn) throw new Error('Could not find Send button');

  // Wait for the Send button to become enabled (LinkedIn disables it briefly after fill)
  console.log('[compose] Waiting for Send button to become enabled...');
  for (let i = 0; i < 20; i++) {
    const disabled = await btn.evaluate(el => el.disabled || el.getAttribute('aria-disabled') === 'true' || el.classList.contains('artdeco-button--disabled'));
    if (!disabled) break;
    await page.waitForTimeout(500);
  }

  // Try JS click first (more reliable than Playwright click for LinkedIn buttons)
  try {
    await btn.evaluate(el => el.click());
    console.log('[compose] ✓ Send button clicked via JS');
  } catch (e) {
    console.log('[compose] JS click failed, trying Playwright click...');
    await btn.click({ timeout: 10000 });
  }
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

    // Inspect DOM to find the right selectors
    await page.waitForTimeout(3000); // Let page fully load
    const domInfo = await inspectDOM();
    await takeScreenshot('after-inspect');

    // Get candidate cards on first page (with scrolling to load all)
    let cards = await getCandidateCards();
    const pageInfo = await getCurrentPageInfo();
    console.log(`[run] Page 1: ${cards.length} candidates loaded (${pageInfo})`);
    broadcast('candidates_found', { total: cards.length, processing: Math.min(cards.length, maxCandidates) });

    if (cards.length === 0) {
      store.updateRun(runId, { status: 'completed', finished_at: new Date().toISOString() });
      broadcast('run_completed', { runId, processed: 0 });
      return { runId, processed: 0, status: 'completed' };
    }

    let processed = 0, succeeded = 0, failed = 0, skipped = 0;
    let cardIndex = 0;
    let currentPage = 1;
    const processedNames = new Set(); // track sent candidates to skip after re-navigation

    while (processed < maxCandidates) {
      if (stopRequested) {
        console.log('[run] Stop requested');
        broadcast('run_stopped', { runId, processed });
        break;
      }

      // If we've exhausted cards on this page, try next page
      if (cardIndex >= cards.length) {
        console.log(`[run] Finished page ${currentPage} (${cards.length} cards). Looking for next page...`);

        // Scroll to bottom to make pagination visible
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(1000);

        const nextBtn = await getNextPageButton();
        if (nextBtn) {
          currentPage++;
          console.log(`[run] Clicking to page ${currentPage}...`);
          await nextBtn.click();
          await page.waitForTimeout(3000);

          // Scroll back to top of new page
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.waitForTimeout(1000);

          // Load all cards on new page
          cards = await scrollToLoadAllCards();
          cardIndex = 0;
          const newPageInfo = await getCurrentPageInfo();
          console.log(`[run] Page ${currentPage}: ${cards.length} candidates loaded (${newPageInfo})`);
          broadcast('page_changed', { page: currentPage, candidates: cards.length });

          if (cards.length === 0) {
            console.log('[run] No candidates on new page — stopping');
            break;
          }
          continue;
        } else {
          console.log('[run] No next page button found — all pages processed');
          break;
        }
      }

      const card = cards[cardIndex];
      cardIndex++;
      let candidateId;

      try {
        // Extract candidate info
        const info = await extractCandidateInfo(card);

        // Skip already-processed candidates (after re-navigation)
        if (processedNames.has(info.name)) {
          console.log(`[run] Skipping already-processed: ${info.name}`);
          continue;
        }

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
          processedNames.add(info.name);
          succeeded++;
        } else if (runMode === 'manual_review') {
          store.updateCandidate(candidateId, { status: 'pending_review' });
          broadcast('pending_review', { candidateId, name: info.name });
          console.log(`[manual_review] Queued ${info.name} for review`);
          succeeded++;
        } else if (runMode === 'auto_send') {
          // Open compose, fill, send
          await openMessageCompose(card, info.name);
          await takeScreenshot(`compose-${processed}`);

          const subjectToSend = tuned.subject || generated.subject;
          if (subjectToSend) await fillSubject(subjectToSend);
          await fillMessageBody(tuned.message);
          await takeScreenshot(`filled-${processed}`);

          await clickSend();
          await takeScreenshot(`sent-${processed}`);

          // Close compose dialog / any overlays, return to list view
          console.log('[compose] Closing dialogs and returning to list...');
          await closeMessageDialog();
          await page.waitForTimeout(1000);

          // Close any remaining modals/overlays
          for (const closeSelector of [
            'button[aria-label="Close"]',
            'button[aria-label="Dismiss"]',
            'button[data-test-modal-close-btn]',
            '[class*="artdeco-modal__dismiss"]',
          ]) {
            try {
              const closeBtn = await page.$(closeSelector);
              if (closeBtn && await closeBtn.isVisible().catch(() => false)) {
                await closeBtn.click();
                await page.waitForTimeout(500);
              }
            } catch (_) {}
          }

          // Press Escape to dismiss any remaining overlay
          await page.keyboard.press('Escape');
          await page.waitForTimeout(1000);

          // Navigate back to project URL and re-load the list
          const projectUrl = process.env.PROJECT_URL;
          console.log('[compose] Navigating back to candidate list...');
          await page.goto(projectUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForTimeout(3000);

          // Re-click Uncontacted filter
          try {
            const filterBtn = await page.$('button:has-text("Uncontacted")') ||
                              await page.$('[data-test-pipeline-filter="UNCONTACTED"]');
            if (filterBtn) {
              await filterBtn.click();
              await page.waitForTimeout(2000);
            }
          } catch (_) {}

          // Re-scroll to load all candidates
          cards = await scrollToLoadAllCards();
          cardIndex = 0; // reset — we'll skip already-processed by name
          console.log(`[compose] Re-loaded ${cards.length} cards after navigation`);

          store.updateCandidate(candidateId, { status: 'sent' });
          processedNames.add(info.name);
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
        broadcast('candidate_error', { index: processed, error: err.message });

        // Force-close everything and reset to list view
        console.log('[recovery] Cleaning up after error...');
        try {
          await closeMessageDialog();
          await page.waitForTimeout(500);

          // Close any remaining modals/overlays
          for (const closeSelector of [
            'button[aria-label="Close"]',
            'button[aria-label="Dismiss"]',
            'button[data-test-modal-close-btn]',
            '[class*="artdeco-modal__dismiss"]',
          ]) {
            try {
              const closeBtn = await page.$(closeSelector);
              if (closeBtn && await closeBtn.isVisible().catch(() => false)) {
                await closeBtn.click();
                await page.waitForTimeout(300);
              }
            } catch (_) {}
          }

          // Escape any remaining overlay
          await page.keyboard.press('Escape');
          await page.waitForTimeout(500);
          await page.keyboard.press('Escape');
          await page.waitForTimeout(500);

          // Navigate back to project URL to fully reset state
          const projectUrl = process.env.PROJECT_URL;
          console.log('[recovery] Navigating back to candidate list...');
          await page.goto(projectUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForTimeout(3000);

          // Re-click Uncontacted filter
          try {
            const filterBtn = await page.$('button:has-text("Uncontacted")') ||
                              await page.$('[data-test-pipeline-filter="UNCONTACTED"]');
            if (filterBtn) {
              await filterBtn.click();
              await page.waitForTimeout(2000);
            }
          } catch (_) {}

          // Re-scroll to load all candidates
          cards = await scrollAndCollect(page);
          console.log(`[recovery] Re-loaded ${cards.length} cards after error recovery`);
        } catch (recoveryErr) {
          console.error(`[recovery] Recovery failed: ${recoveryErr.message}`);
        }
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
