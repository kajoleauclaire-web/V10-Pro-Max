// Fills the database with demo accounts and listings so the app can be explored.
// For local demos only: the demo passwords below are public, so never run this on a live site.
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { ensureAdmin, hashPassword } from '../src/auth.js';
import { openDb } from '../src/db.js';
import { estimate } from '../src/valuation.js';

const DEMO_PASSWORD = 'demo-password';
const dbPath = resolve(process.env.DB_PATH || 'data/studiovault.db');
mkdirSync(dirname(dbPath), { recursive: true });
const db = openDb(dbPath);

if (db.prepare("SELECT 1 FROM users WHERE email = 'studio@demo.test'").get()) {
  console.log('Demo data is already present.');
  process.exit(0);
}

ensureAdmin(db, { email: 'admin@demo.test', password: DEMO_PASSWORD });

const addUser = (role, name, company, email) =>
  Number(
    db
      .prepare('INSERT INTO users (role, name, company, email, pass_hash) VALUES (?, ?, ?, ?, ?)')
      .run(role, name, company, email, hashPassword(DEMO_PASSWORD)).lastInsertRowid,
  );

const studio = addUser('studio', 'Rina Das', 'Pixel Harbor Games', 'studio@demo.test');
const studio2 = addUser('studio', 'Omar Vale', 'Tin Lantern Studio', 'studio2@demo.test');
const buyer = addUser('buyer', 'Jo Park', 'Northwind AI Lab', 'buyer@demo.test');

const all = { issueTracker: true, codeReview: true, designDocs: true, tests: true, buildLogs: true, playtestTelemetry: true };
const listings = [
  {
    studioId: studio, status: 'approved', title: 'Co-op roguelike — full repository and 6 years of history',
    description: 'Complete C# codebase for a shipped co-op roguelike, with every commit since the prototype, code review threads, the bug tracker export and design documents for each milestone.',
    languages: 'C#, HLSL', loc: 620000, commitYears: 6, shippedTitles: 2, engine: 'unity', rights: 'full', exclusivity: 'non_exclusive', extras: all,
  },
  {
    studioId: studio, status: 'pending', title: 'Mobile puzzle series — gameplay code and playtest telemetry',
    description: 'Three shipped puzzle games sharing one TypeScript framework. Includes anonymised playtest telemetry and automated test suites. Awaiting review.',
    languages: 'TypeScript', loc: 140000, commitYears: 4, shippedTitles: 3, engine: 'web', rights: 'full', exclusivity: 'non_exclusive',
    extras: { ...all, codeReview: false, buildLogs: false },
  },
  {
    studioId: studio2, status: 'approved', title: 'Custom C++ racing engine with physics and tooling',
    description: 'In-house engine built over nine years: renderer, vehicle physics, networking and editor tools. Exclusive licence available, with build logs and the full issue history.',
    languages: 'C++, Python, Lua', loc: 1850000, commitYears: 9, shippedTitles: 4, engine: 'custom', rights: 'full', exclusivity: 'exclusive',
    extras: { ...all, playtestTelemetry: false },
  },
  {
    studioId: studio2, status: 'approved', title: 'Narrative adventure — Blueprint and C++ gameplay systems',
    description: 'Dialogue, quest and save systems from a shipped narrative adventure, with design documents explaining each system and the decisions behind it.',
    languages: 'C++, Blueprints', loc: 310000, commitYears: 3, shippedTitles: 1, engine: 'unreal', rights: 'partial', exclusivity: 'non_exclusive',
    extras: { ...all, tests: false, buildLogs: false, playtestTelemetry: false },
  },
];

const insert = db.prepare(
  `INSERT INTO listings (studio_id, title, description, engine, languages, loc, commit_years, shipped_titles,
     extras, rights, exclusivity, est_low, est_high, asking_price, status)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);
const ids = listings.map((l) => {
  const est = estimate(l);
  return Number(
    insert.run(
      l.studioId, l.title, l.description, l.engine, l.languages, l.loc, l.commitYears, l.shippedTitles,
      JSON.stringify(l.extras), l.rights, l.exclusivity, est.low, est.high, Math.round((est.low + est.high) / 2), l.status,
    ).lastInsertRowid,
  );
});

db.prepare('INSERT INTO offers (listing_id, buyer_id, amount, term_months, message) VALUES (?, ?, ?, ?, ?)').run(
  ids[0], buyer, 95000, 24, 'We would like a 24-month non-exclusive training licence.',
);
db.prepare('INSERT INTO leads (email, studio, inputs, est_low, est_high) VALUES (?, ?, ?, ?, ?)').run(
  'founder@smallstudio.test', 'Small Studio', '{}', 18000, 54000,
);

console.log(`Demo data added. Sign in with password "${DEMO_PASSWORD}" as:`);
console.log('  admin@demo.test   (admin)\n  studio@demo.test  (studio)\n  buyer@demo.test   (AI lab)');
