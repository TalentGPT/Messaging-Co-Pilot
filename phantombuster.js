/**
 * PhantomBuster Integration — LinkedIn Profile Scraper
 * 
 * Scrapes full LinkedIn profile data via PhantomBuster's Profile Scraper Phantom.
 * Supports per-user configuration (API key, li_at cookie, phantom ID).
 */

const BASE_URL = 'https://api.phantombuster.com/api/v2';
const DEFAULT_PHANTOM_ID = process.env.PHANTOMBUSTER_PROFILE_SCRAPER_ID || '';
const DEFAULT_API_KEY = process.env.PHANTOMBUSTER_API_KEY || '';

// In-memory cache to avoid re-scraping the same profile
const profileCache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

async function fetchJSON(url, options = {}) {
  // Use dynamic import for node-fetch if native fetch not available
  const fetchFn = globalThis.fetch || (await import('node-fetch')).default;
  const res = await fetchFn(url, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PhantomBuster API error ${res.status}: ${text}`);
  }
  return res.json();
}

/**
 * Launch the Profile Scraper phantom for a single LinkedIn profile URL.
 * Returns the container ID for polling.
 */
async function launchProfileScrape(profileUrl, { apiKey, phantomId, liAtCookie } = {}) {
  const key = apiKey || DEFAULT_API_KEY;
  const id = phantomId || DEFAULT_PHANTOM_ID;

  if (!key) throw new Error('PhantomBuster API key not configured');
  if (!id) throw new Error('PhantomBuster Profile Scraper Phantom ID not configured');
  if (!liAtCookie) throw new Error('LinkedIn li_at cookie not configured');

  // Check cache first
  const cached = profileCache.get(profileUrl);
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
    console.log(`[phantombuster] Cache hit for ${profileUrl}`);
    return { cached: true, data: cached.data };
  }

  console.log(`[phantombuster] Launching scrape for: ${profileUrl}`);

  const result = await fetchJSON(`${BASE_URL}/agents/launch`, {
    method: 'POST',
    headers: {
      'X-Phantombuster-Key': key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      id,
      argument: {
        spreadsheetUrl: profileUrl,
        sessionCookie: liAtCookie,
        numberOfAddsPerLaunch: 1,
      },
    }),
  });

  return { cached: false, containerId: result.containerId };
}

/**
 * Poll for phantom completion and fetch results.
 * Returns the scraped profile data or null on failure.
 */
async function waitForResults(phantomId, { apiKey, timeoutMs = 90000 } = {}) {
  const key = apiKey || DEFAULT_API_KEY;
  const id = phantomId || DEFAULT_PHANTOM_ID;
  const startTime = Date.now();
  const pollInterval = 5000;

  while (Date.now() - startTime < timeoutMs) {
    const output = await fetchJSON(`${BASE_URL}/agents/fetch-output?id=${id}`, {
      headers: { 'X-Phantombuster-Key': key },
    });

    if (output.status === 'finished' || output.status === 'error') {
      if (output.resultObject) {
        try {
          const parsed = JSON.parse(output.resultObject);
          return parsed;
        } catch (e) {
          console.log(`[phantombuster] Failed to parse resultObject: ${e.message}`);
        }
      }

      // Try to get the output CSV URL
      if (output.s3Folder) {
        try {
          const csvData = await fetchOutputCSV(id, key);
          if (csvData && csvData.length > 0) {
            return csvData;
          }
        } catch (e) {
          console.log(`[phantombuster] CSV fetch failed: ${e.message}`);
        }
      }

      // Check output for errors
      if (output.output && output.output.includes('❌')) {
        const errorMatch = output.output.match(/❌\s*(.+)/);
        throw new Error(`PhantomBuster error: ${errorMatch ? errorMatch[1] : 'Unknown error'}`);
      }

      return null;
    }

    // Still running — wait and poll again
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  throw new Error(`PhantomBuster timeout after ${timeoutMs / 1000}s`);
}

/**
 * Fetch the output CSV/JSON from PhantomBuster storage.
 */
async function fetchOutputCSV(phantomId, apiKey) {
  const key = apiKey || DEFAULT_API_KEY;
  const id = phantomId || DEFAULT_PHANTOM_ID;

  // Get the result file URL
  const output = await fetchJSON(`${BASE_URL}/agents/fetch-output?id=${id}`, {
    headers: { 'X-Phantombuster-Key': key },
  });

  // PhantomBuster stores results in S3 — get the JSON result file
  if (output.s3Folder) {
    const fetchFn = globalThis.fetch || (await import('node-fetch')).default;
    const jsonUrl = `https://phantombuster.s3.amazonaws.com/${output.s3Folder}/result.json`;
    try {
      const res = await fetchFn(jsonUrl);
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      // Try CSV instead
      const csvUrl = `https://phantombuster.s3.amazonaws.com/${output.s3Folder}/result.csv`;
      const csvRes = await fetchFn(csvUrl);
      if (csvRes.ok) {
        const csvText = await csvRes.text();
        return parseCSV(csvText);
      }
    }
  }

  return null;
}

/**
 * Simple CSV parser for PhantomBuster output.
 */
function parseCSV(csvText) {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || [];
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = (values[idx] || '').replace(/^"|"$/g, '').trim();
    });
    rows.push(row);
  }

  return rows;
}

/**
 * Map PhantomBuster profile data to our internal format.
 * PhantomBuster returns flat fields — we structure them for formatUserPrompt().
 */
function mapPhantomBusterProfile(pb) {
  // pb can be an array (from CSV) or a single object
  const profile = Array.isArray(pb) ? pb[0] : pb;
  if (!profile) return null;

  const data = {
    full_name: profile.fullName || profile.firstName && profile.lastName
      ? `${profile.firstName || ''} ${profile.lastName || ''}`.trim()
      : '',
    headline: profile.linkedinHeadline || profile.job || '',
    location: profile.location || '',
    industry: profile.companyIndustry || '',
    summary: profile.linkedinDescription || '',
    linkedin_url: profile.linkedinProfileUrl || profile.profileUrl || '',
    experiences: [],
    education: [],
    skills: [],
  };

  // Current job
  if (profile.linkedinJobTitle || profile.companyName) {
    data.experiences.push({
      title: profile.linkedinJobTitle || '',
      company: profile.companyName || '',
      date: profile.linkedinJobDateRange || '',
      location: profile.linkedinJobLocation || '',
      description: profile.linkedinJobDescription || '',
    });
  }

  // Previous job
  if (profile.linkedinPreviousJobTitle || profile.previousCompanyName) {
    data.experiences.push({
      title: profile.linkedinPreviousJobTitle || '',
      company: profile.previousCompanyName || '',
      date: profile.linkedinPreviousJobDateRange || '',
      location: profile.linkedinPreviousJobLocation || '',
      description: profile.linkedinPreviousJobDescription || '',
    });
  }

  // Current school
  if (profile.linkedinSchoolName) {
    data.education.push({
      school: profile.linkedinSchoolName || '',
      degree: profile.linkedinSchoolDegree || '',
      date: profile.linkedinSchoolDateRange || '',
    });
  }

  // Previous school
  if (profile.linkedinPreviousSchoolName) {
    data.education.push({
      school: profile.linkedinPreviousSchoolName || '',
      degree: profile.linkedinPreviousSchoolDegree || '',
      date: profile.linkedinPreviousSchoolDateRange || '',
    });
  }

  // Skills
  if (profile.linkedinSkillsLabel) {
    data.skills = profile.linkedinSkillsLabel.split(',').map(s => s.trim()).filter(Boolean);
  }

  return data;
}

/**
 * Main entry point: scrape a LinkedIn profile via PhantomBuster.
 * Returns enriched profile data in our internal format, or null on failure.
 * 
 * @param {string} profileUrl - LinkedIn /in/ URL
 * @param {object} config - { apiKey, phantomId, liAtCookie }
 */
async function scrapeProfile(profileUrl, config = {}) {
  // Validate URL — PhantomBuster needs /in/ URLs
  if (!profileUrl || !profileUrl.includes('/in/')) {
    console.log(`[phantombuster] Skipping non-public URL: ${profileUrl}`);
    return null;
  }

  // Normalize URL
  if (!profileUrl.startsWith('http')) {
    profileUrl = 'https://www.linkedin.com' + profileUrl;
  }

  try {
    // Check cache
    const cached = profileCache.get(profileUrl);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
      console.log(`[phantombuster] Cache hit for ${profileUrl}`);
      return cached.data;
    }

    // Launch scrape
    const launch = await launchProfileScrape(profileUrl, config);
    if (launch.cached) {
      return launch.data;
    }

    // Wait for results
    console.log(`[phantombuster] Waiting for results (container: ${launch.containerId})...`);
    const results = await waitForResults(config.phantomId, {
      apiKey: config.apiKey,
      timeoutMs: config.timeoutMs || 90000,
    });

    if (!results) {
      console.log('[phantombuster] No results returned');
      return null;
    }

    // Map to our format
    const mapped = mapPhantomBusterProfile(results);
    if (mapped) {
      // Cache it
      profileCache.set(profileUrl, { data: mapped, timestamp: Date.now() });

      const stats = [];
      if (mapped.location) stats.push(`location: ${mapped.location}`);
      if (mapped.summary) stats.push(`summary: ${mapped.summary.length} chars`);
      if (mapped.experiences.length) stats.push(`${mapped.experiences.length} experiences`);
      if (mapped.education.length) stats.push(`${mapped.education.length} education`);
      if (mapped.skills.length) stats.push(`${mapped.skills.length} skills`);
      console.log(`[phantombuster] ✓ Enriched: ${stats.join(', ')}`);
    }

    return mapped;
  } catch (err) {
    console.error(`[phantombuster] Scrape failed for ${profileUrl}: ${err.message}`);
    return null;
  }
}

/**
 * Clear the profile cache.
 */
function clearCache() {
  profileCache.clear();
}

module.exports = {
  scrapeProfile,
  mapPhantomBusterProfile,
  clearCache,
  launchProfileScrape,
  waitForResults,
};
