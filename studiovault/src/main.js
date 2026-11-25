import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { ensureAdmin } from './auth.js';
import { openDb } from './db.js';
import { createApp } from './server.js';

const port = Number(process.env.PORT) || 3000;
const dbPath = resolve(process.env.DB_PATH || 'data/studiovault.db');
const feeRate = Number(process.env.FEE_RATE ?? 0.15);
if (!(feeRate >= 0 && feeRate < 1)) {
  console.error('FEE_RATE must be a number from 0 up to (not including) 1, for example 0.15 for 15%.');
  process.exit(1);
}

mkdirSync(dirname(dbPath), { recursive: true });
const db = openDb(dbPath);

const admin = ensureAdmin(db, { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD });
if (admin) {
  console.log(`Admin account created: ${admin.email}`);
  if (admin.generated) console.log(`Admin password (shown only once, save it now): ${admin.password}`);
}

createApp({
  db,
  feeRate,
  cookieSecure: process.env.COOKIE_SECURE === '1',
  trustProxy: process.env.TRUST_PROXY === '1',
}).listen(port, () => {
  console.log(`StudioVault is running at http://localhost:${port}`);
});
