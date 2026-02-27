// Quick diagnostic: shows failed candidates and their error messages
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'store.db');
const db = new Database(dbPath, { readonly: true });

const errors = db.prepare(`
  SELECT name, status, error, created_at 
  FROM candidates 
  WHERE status = 'error' 
  ORDER BY rowid DESC 
  LIMIT 10
`).all();

console.log(`\n=== FAILED CANDIDATES (showing last 10) ===\n`);
if (errors.length === 0) {
  console.log('No errors found in database.');
} else {
  errors.forEach((row, i) => {
    console.log(`${i + 1}. ${row.name}`);
    console.log(`   Error: ${row.error}`);
    console.log(`   Time: ${row.created_at}\n`);
  });
}

const summary = db.prepare(`
  SELECT status, COUNT(*) as count 
  FROM candidates 
  GROUP BY status
`).all();

console.log(`=== SUMMARY ===`);
summary.forEach(r => console.log(`  ${r.status}: ${r.count}`));

db.close();
