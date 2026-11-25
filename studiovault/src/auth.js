import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const SESSION_DAYS = 14;

export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  const [saltHex, hashHex] = String(stored).split(':');
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return timingSafeEqual(expected, actual);
}

const hashToken = (token) => createHash('sha256').update(token).digest('hex');

// Only the hash of the session token is stored, so a leaked database cannot be used to log in.
export function createSession(db, userId) {
  const token = randomBytes(32).toString('hex');
  const expiresAt = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(
    hashToken(token),
    userId,
    expiresAt,
  );
  return { token, maxAge: SESSION_DAYS * 24 * 60 * 60 };
}

export function userFromToken(db, token) {
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT u.id, u.role, u.name, u.company, u.email, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`,
    )
    .get(hashToken(token));
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    destroySession(db, token);
    return null;
  }
  const { expires_at: _expiresAt, ...user } = row;
  return user;
}

export function destroySession(db, token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
}

// Creates the first admin account. Without ADMIN_PASSWORD a random one is generated and returned
// so the caller can show it once.
export function ensureAdmin(db, { email, password }) {
  const existing = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
  if (existing) return null;
  const adminEmail = (email || 'admin@example.com').toLowerCase();
  const adminPassword = password || randomBytes(9).toString('base64url');
  db.prepare(
    "INSERT INTO users (role, name, company, email, pass_hash) VALUES ('admin', 'Admin', 'StudioVault', ?, ?)",
  ).run(adminEmail, hashPassword(adminPassword));
  return { email: adminEmail, password: adminPassword, generated: !password };
}
