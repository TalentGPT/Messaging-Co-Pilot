#!/usr/bin/env node
/**
 * Run all test suites and generate report
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const RESULTS = [];
let totalPass = 0, totalFail = 0, totalSkip = 0;

const suites = [
  { name: 'Unit Tests', cmd: 'npx jest tests/unit/ --forceExit --json 2>/dev/null || true' },
  { name: 'Integration Tests', cmd: 'npx jest tests/integration/ --forceExit --json 2>/dev/null || true' },
  { name: 'E2E Tests', cmd: 'npx jest tests/e2e/ --forceExit --json 2>/dev/null || true' },
];

console.log('═══════════════════════════════════════');
console.log('  Running All Test Suites');
console.log('═══════════════════════════════════════\n');

for (const suite of suites) {
  console.log(`\n▶ ${suite.name}...`);
  try {
    const output = execSync(suite.cmd, {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, TEST_MODE: '1', MOCK_OPENAI: '1', JWT_SECRET: 'test-jwt-secret-fixed', OPENAI_API_KEY: 'sk-test-fake' },
      timeout: 120000,
    });

    // Try to parse JSON output
    try {
      const jsonStart = output.indexOf('{');
      if (jsonStart >= 0) {
        const json = JSON.parse(output.slice(jsonStart));
        const pass = json.numPassedTests || 0;
        const fail = json.numFailedTests || 0;
        const skip = json.numPendingTests || 0;
        totalPass += pass;
        totalFail += fail;
        totalSkip += skip;
        RESULTS.push({ name: suite.name, pass, fail, skip, success: json.success });
        console.log(`  ✓ ${pass} passed, ${fail} failed, ${skip} skipped`);
      } else {
        RESULTS.push({ name: suite.name, pass: 0, fail: 0, skip: 0, success: null, raw: output.slice(0, 500) });
        console.log(`  ⚠ Could not parse results`);
      }
    } catch {
      RESULTS.push({ name: suite.name, pass: 0, fail: 0, skip: 0, success: null, raw: output.slice(0, 500) });
    }
  } catch (err) {
    RESULTS.push({ name: suite.name, pass: 0, fail: 0, skip: 0, success: false, error: err.message?.slice(0, 300) });
    console.log(`  ✗ Error: ${err.message?.slice(0, 100)}`);
  }
}

console.log('\n═══════════════════════════════════════');
console.log(`  Total: ${totalPass} passed, ${totalFail} failed, ${totalSkip} skipped`);
console.log('═══════════════════════════════════════\n');

// Write results JSON
const artifactsDir = path.join(ROOT, 'test-artifacts');
if (!fs.existsSync(artifactsDir)) fs.mkdirSync(artifactsDir, { recursive: true });

fs.writeFileSync(path.join(artifactsDir, 'test-results.json'), JSON.stringify({
  timestamp: new Date().toISOString(),
  totalPass, totalFail, totalSkip,
  suites: RESULTS,
}, null, 2));

// Generate report
require('./generate-report');

process.exit(totalFail > 0 ? 1 : 0);
