import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { transaction } from './db.js';
import { createSession, destroySession, hashPassword, userFromToken, verifyPassword } from './auth.js';
import { ENGINES, EXCLUSIVITY, EXTRAS, RIGHTS, estimate } from './valuation.js';

const PUBLIC_DIR = fileURLToPath(new URL('../public/', import.meta.url));
const MAX_BODY_BYTES = 64 * 1024;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
};
const SECURITY_HEADERS = {
  'Content-Security-Policy':
    "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// ---------- input validation ----------

function text(value, field, { min = 0, max = 200 } = {}) {
  const s = typeof value === 'string' ? value.trim() : '';
  if (s.length < min) throw new HttpError(400, `${field} is required`);
  if (s.length > max) throw new HttpError(400, `${field} must be at most ${max} characters`);
  return s;
}

function integer(value, field, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new HttpError(400, `${field} must be a whole number between ${min} and ${max}`);
  }
  return n;
}

function oneOf(value, field, allowed) {
  if (!allowed.includes(value)) throw new HttpError(400, `${field} must be one of: ${allowed.join(', ')}`);
  return value;
}

function email(value) {
  const s = text(value, 'Email', { min: 3, max: 254 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw new HttpError(400, 'Email is not valid');
  return s;
}

function httpsUrl(value, field) {
  const s = text(value, field, { max: 500 });
  if (!s) return '';
  let url;
  try {
    url = new URL(s);
  } catch {
    throw new HttpError(400, `${field} is not a valid URL`);
  }
  if (url.protocol !== 'https:') throw new HttpError(400, `${field} must start with https://`);
  return url.toString();
}

function datasetInputs(body) {
  const extras = {};
  for (const key of EXTRAS) extras[key] = Boolean(body.extras && body.extras[key]);
  return {
    loc: integer(body.loc, 'Lines of code', { min: 1, max: 500_000_000 }),
    commitYears: integer(body.commitYears, 'Years of history', { max: 50 }),
    shippedTitles: integer(body.shippedTitles, 'Shipped titles', { max: 1000 }),
    engine: oneOf(body.engine, 'Engine', ENGINES),
    rights: oneOf(body.rights, 'Rights', RIGHTS),
    exclusivity: oneOf(body.exclusivity, 'Licence type', EXCLUSIVITY),
    extras,
  };
}

// ---------- helpers ----------

function parseCookies(header) {
  const cookies = {};
  for (const part of String(header || '').split(';')) {
    const index = part.indexOf('=');
    if (index > 0) cookies[part.slice(0, index).trim()] = part.slice(index + 1).trim();
  }
  return cookies;
}

async function readJson(req) {
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) {
    throw new HttpError(415, 'Content-Type must be application/json');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'Request is too large');
    chunks.push(chunk);
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    return parsed;
  } catch {
    throw new HttpError(400, 'Request body is not valid JSON');
  }
}

function rateLimiter({ limit, windowMs }) {
  const hits = new Map();
  return (key) => {
    const now = Date.now();
    const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (recent.length >= limit) throw new HttpError(429, 'Too many attempts. Please try again later.');
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 10_000) hits.clear();
  };
}

const listingRow = (row) => row && { ...row, extras: JSON.parse(row.extras) };

// What a buyer may see: no repository link and no studio contact details.
function publicListing(row) {
  const { repo_url: _repo, admin_note: _note, studio_id: _studio, ...rest } = listingRow(row);
  return rest;
}

// ---------- app ----------

export function createApp({ db, feeRate = 0.15, cookieSecure = false, trustProxy = false }) {
  const limitAuth = rateLimiter({ limit: 20, windowMs: 10 * 60 * 1000 });
  const limitEstimate = rateLimiter({ limit: 60, windowMs: 10 * 60 * 1000 });

  const routes = [];
  const route = (method, path, roles, handler) => {
    const keys = [];
    const pattern = new RegExp(
      `^${path.replace(/:(\w+)/g, (_, key) => {
        keys.push(key);
        return '(\\d+)';
      })}$`,
    );
    routes.push({ method, pattern, keys, roles, handler });
  };

  const sessionCookie = (token, maxAge) =>
    `sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${cookieSecure ? '; Secure' : ''}`;

  const publicUser = (u) => ({ id: u.id, role: u.role, name: u.name, company: u.company, email: u.email });

  // ----- public -----

  route('GET', '/api/meta', null, () => ({
    engines: ENGINES,
    extras: EXTRAS,
    rights: RIGHTS,
    exclusivity: EXCLUSIVITY,
    feeRate,
  }));

  route('POST', '/api/estimate', null, ({ body, ip }) => {
    limitEstimate(ip);
    const inputs = datasetInputs(body);
    const result = estimate(inputs);
    if (body.email) {
      db.prepare('INSERT INTO leads (email, studio, inputs, est_low, est_high) VALUES (?, ?, ?, ?, ?)').run(
        email(body.email),
        text(body.studio, 'Studio name', { max: 120 }),
        JSON.stringify(inputs),
        result.low,
        result.high,
      );
    }
    return result;
  });

  route('POST', '/api/auth/register', null, ({ body, ip, res }) => {
    limitAuth(ip);
    const role = oneOf(body.role, 'Account type', ['studio', 'buyer']);
    const name = text(body.name, 'Name', { min: 1, max: 120 });
    const company = text(body.company, 'Company', { min: 1, max: 120 });
    const userEmail = email(body.email);
    const password = typeof body.password === 'string' ? body.password : '';
    if (password.length < 8 || password.length > 200) {
      throw new HttpError(400, 'Password must be at least 8 characters');
    }
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(userEmail)) {
      throw new HttpError(409, 'An account with this email already exists');
    }
    const { lastInsertRowid } = db
      .prepare('INSERT INTO users (role, name, company, email, pass_hash) VALUES (?, ?, ?, ?, ?)')
      .run(role, name, company, userEmail, hashPassword(password));
    const id = Number(lastInsertRowid);
    const session = createSession(db, id);
    res.setHeader('Set-Cookie', sessionCookie(session.token, session.maxAge));
    return { user: { id, role, name, company, email: userEmail } };
  });

  route('POST', '/api/auth/login', null, ({ body, ip, res }) => {
    limitAuth(ip);
    const userEmail = email(body.email);
    const row = db.prepare('SELECT * FROM users WHERE email = ?').get(userEmail);
    const password = typeof body.password === 'string' ? body.password : '';
    if (!row || !verifyPassword(password, row.pass_hash)) {
      throw new HttpError(401, 'Email or password is incorrect');
    }
    const session = createSession(db, row.id);
    res.setHeader('Set-Cookie', sessionCookie(session.token, session.maxAge));
    return { user: publicUser(row) };
  });

  route('POST', '/api/auth/logout', null, ({ token, res }) => {
    destroySession(db, token);
    res.setHeader('Set-Cookie', sessionCookie('', 0));
    return { ok: true };
  });

  route('GET', '/api/me', null, ({ user }) => ({ user: user ? publicUser(user) : null }));

  // ----- studio -----

  route('GET', '/api/studio/listings', ['studio'], ({ user }) => ({
    listings: db
      .prepare(
        `SELECT l.*, (SELECT COUNT(*) FROM offers o WHERE o.listing_id = l.id AND o.status = 'pending') AS pending_offers
         FROM listings l WHERE l.studio_id = ? ORDER BY l.id DESC`,
      )
      .all(user.id)
      .map(listingRow),
  }));

  route('POST', '/api/studio/listings', ['studio'], ({ user, body }) => {
    const inputs = datasetInputs(body);
    const result = estimate(inputs);
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO listings (studio_id, title, description, engine, languages, loc, commit_years, shipped_titles,
           extras, rights, exclusivity, repo_url, est_low, est_high, asking_price)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        user.id,
        text(body.title, 'Title', { min: 3, max: 120 }),
        text(body.description, 'Description', { min: 20, max: 4000 }),
        inputs.engine,
        text(body.languages, 'Languages', { min: 1, max: 200 }),
        inputs.loc,
        inputs.commitYears,
        inputs.shippedTitles,
        JSON.stringify(inputs.extras),
        inputs.rights,
        inputs.exclusivity,
        httpsUrl(body.repoUrl, 'Repository link'),
        result.low,
        result.high,
        integer(body.askingPrice, 'Asking price', { min: 1, max: 1_000_000_000 }),
      );
    return { id: Number(lastInsertRowid), estimate: result };
  });

  route('POST', '/api/studio/listings/:id/withdraw', ['studio'], ({ user, params }) => {
    const { changes } = db
      .prepare(
        "UPDATE listings SET status = 'withdrawn' WHERE id = ? AND studio_id = ? AND status IN ('pending', 'approved')",
      )
      .run(params.id, user.id);
    if (!changes) throw new HttpError(404, 'Listing not found or cannot be withdrawn');
    db.prepare("UPDATE offers SET status = 'rejected' WHERE listing_id = ? AND status = 'pending'").run(params.id);
    return { ok: true };
  });

  route('GET', '/api/studio/offers', ['studio'], ({ user }) => ({
    offers: db
      .prepare(
        `SELECT o.id, o.amount, o.term_months, o.message, o.status, o.created_at,
                l.id AS listing_id, l.title AS listing_title, l.asking_price, b.company AS buyer_company
         FROM offers o JOIN listings l ON l.id = o.listing_id JOIN users b ON b.id = o.buyer_id
         WHERE l.studio_id = ? ORDER BY o.id DESC`,
      )
      .all(user.id),
  }));

  route('POST', '/api/studio/offers/:id/respond', ['studio'], ({ user, params, body }) => {
    const decision = oneOf(body.decision, 'Decision', ['accept', 'reject']);
    return transaction(db, () => {
      const offer = db
        .prepare(
          `SELECT o.*, l.studio_id, l.exclusivity, l.status AS listing_status
           FROM offers o JOIN listings l ON l.id = o.listing_id WHERE o.id = ?`,
        )
        .get(params.id);
      if (!offer || offer.studio_id !== user.id) throw new HttpError(404, 'Offer not found');
      if (offer.status !== 'pending') throw new HttpError(409, 'This offer has already been answered');

      if (decision === 'reject') {
        db.prepare("UPDATE offers SET status = 'rejected' WHERE id = ?").run(offer.id);
        return { status: 'rejected' };
      }
      if (offer.listing_status !== 'approved') throw new HttpError(409, 'This listing is not open for licensing');

      const fee = Math.round(offer.amount * feeRate);
      db.prepare("UPDATE offers SET status = 'accepted' WHERE id = ?").run(offer.id);
      const { lastInsertRowid } = db
        .prepare(
          `INSERT INTO deals (offer_id, listing_id, studio_id, buyer_id, gross, fee_rate, fee, payout)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(offer.id, offer.listing_id, user.id, offer.buyer_id, offer.amount, feeRate, fee, offer.amount - fee);

      // An exclusive licence can be sold once: close the listing and decline everyone else.
      if (offer.exclusivity === 'exclusive') {
        db.prepare("UPDATE listings SET status = 'licensed' WHERE id = ?").run(offer.listing_id);
        db.prepare("UPDATE offers SET status = 'rejected' WHERE listing_id = ? AND status = 'pending'").run(
          offer.listing_id,
        );
      }
      return { status: 'accepted', dealId: Number(lastInsertRowid) };
    });
  });

  // ----- buyer -----

  route('GET', '/api/catalog', ['buyer', 'admin'], ({ query }) => {
    const engine = query.get('engine');
    const search = (query.get('q') || '').trim().slice(0, 100).replace(/[\\%_]/g, '\\$&');
    const rows = db
      .prepare(
        `SELECT l.*, u.company AS studio_company FROM listings l JOIN users u ON u.id = l.studio_id
         WHERE l.status = 'approved'
           AND (? IS NULL OR l.engine = ?)
           AND (l.title LIKE ? ESCAPE '\\' OR l.description LIKE ? ESCAPE '\\' OR l.languages LIKE ? ESCAPE '\\')
         ORDER BY l.id DESC LIMIT 200`,
      )
      .all(
        ENGINES.includes(engine) ? engine : null,
        ENGINES.includes(engine) ? engine : null,
        `%${search}%`,
        `%${search}%`,
        `%${search}%`,
      );
    return { listings: rows.map(publicListing) };
  });

  route('GET', '/api/catalog/:id', ['buyer', 'admin'], ({ params }) => {
    const row = db
      .prepare(
        `SELECT l.*, u.company AS studio_company FROM listings l JOIN users u ON u.id = l.studio_id
         WHERE l.id = ? AND l.status = 'approved'`,
      )
      .get(params.id);
    if (!row) throw new HttpError(404, 'Listing not found');
    return { listing: publicListing(row) };
  });

  route('POST', '/api/catalog/:id/offers', ['buyer'], ({ user, params, body }) => {
    const listing = db.prepare("SELECT id FROM listings WHERE id = ? AND status = 'approved'").get(params.id);
    if (!listing) throw new HttpError(404, 'Listing not found');
    const open = db
      .prepare("SELECT 1 FROM offers WHERE listing_id = ? AND buyer_id = ? AND status = 'pending'")
      .get(params.id, user.id);
    if (open) throw new HttpError(409, 'You already have an open offer on this listing');
    const { lastInsertRowid } = db
      .prepare('INSERT INTO offers (listing_id, buyer_id, amount, term_months, message) VALUES (?, ?, ?, ?, ?)')
      .run(
        params.id,
        user.id,
        integer(body.amount, 'Offer amount', { min: 1, max: 1_000_000_000 }),
        integer(body.termMonths, 'Licence term', { min: 1, max: 1200 }),
        text(body.message, 'Message', { max: 2000 }),
      );
    return { id: Number(lastInsertRowid) };
  });

  route('GET', '/api/buyer/offers', ['buyer'], ({ user }) => ({
    offers: db
      .prepare(
        `SELECT o.id, o.amount, o.term_months, o.message, o.status, o.created_at,
                l.id AS listing_id, l.title AS listing_title, l.asking_price
         FROM offers o JOIN listings l ON l.id = o.listing_id
         WHERE o.buyer_id = ? ORDER BY o.id DESC`,
      )
      .all(user.id),
  }));

  route('POST', '/api/buyer/offers/:id/withdraw', ['buyer'], ({ user, params }) => {
    const { changes } = db
      .prepare("UPDATE offers SET status = 'withdrawn' WHERE id = ? AND buyer_id = ? AND status = 'pending'")
      .run(params.id, user.id);
    if (!changes) throw new HttpError(404, 'Offer not found or already answered');
    return { ok: true };
  });

  // ----- deals (studio and buyer see their own; amounts differ by side) -----

  route('GET', '/api/deals', ['studio', 'buyer'], ({ user }) => {
    const column = user.role === 'studio' ? 'studio_id' : 'buyer_id';
    const rows = db
      .prepare(
        `SELECT d.id, d.gross, d.fee, d.payout, d.status, d.created_at, l.title AS listing_title,
                s.company AS studio_company, b.company AS buyer_company
         FROM deals d JOIN listings l ON l.id = d.listing_id
           JOIN users s ON s.id = d.studio_id JOIN users b ON b.id = d.buyer_id
         WHERE d.${column} = ? ORDER BY d.id DESC`,
      )
      .all(user.id);
    // The platform fee comes out of the studio's side, so buyers only see the price they pay.
    return {
      deals: user.role === 'studio' ? rows : rows.map(({ fee: _fee, payout: _payout, ...rest }) => rest),
    };
  });

  // ----- admin -----

  route('GET', '/api/admin/overview', ['admin'], () => {
    const count = (sql) => db.prepare(sql).get().n;
    const money = db
      .prepare(
        `SELECT COALESCE(SUM(gross), 0) AS gross, COALESCE(SUM(fee), 0) AS fees,
                COALESCE(SUM(CASE WHEN status = 'paid' THEN fee ELSE 0 END), 0) AS fees_paid
         FROM deals WHERE status != 'cancelled'`,
      )
      .get();
    return {
      stats: {
        studios: count("SELECT COUNT(*) AS n FROM users WHERE role = 'studio'"),
        buyers: count("SELECT COUNT(*) AS n FROM users WHERE role = 'buyer'"),
        leads: count('SELECT COUNT(*) AS n FROM leads'),
        liveListings: count("SELECT COUNT(*) AS n FROM listings WHERE status = 'approved'"),
        pendingListings: count("SELECT COUNT(*) AS n FROM listings WHERE status = 'pending'"),
        openOffers: count("SELECT COUNT(*) AS n FROM offers WHERE status = 'pending'"),
        dealVolume: money.gross,
        feesEarned: money.fees,
        feesCollected: money.fees_paid,
      },
      listings: db
        .prepare(
          `SELECT l.*, u.company AS studio_company, u.email AS studio_email
           FROM listings l JOIN users u ON u.id = l.studio_id
           ORDER BY (l.status = 'pending') DESC, l.id DESC LIMIT 200`,
        )
        .all()
        .map(listingRow),
      deals: db
        .prepare(
          `SELECT d.*, l.title AS listing_title, s.company AS studio_company, s.email AS studio_email,
                  b.company AS buyer_company, b.email AS buyer_email
           FROM deals d JOIN listings l ON l.id = d.listing_id
             JOIN users s ON s.id = d.studio_id JOIN users b ON b.id = d.buyer_id
           ORDER BY d.id DESC LIMIT 200`,
        )
        .all(),
      leads: db.prepare('SELECT id, email, studio, est_low, est_high, created_at FROM leads ORDER BY id DESC LIMIT 200').all(),
    };
  });

  route('POST', '/api/admin/listings/:id/review', ['admin'], ({ params, body }) => {
    const decision = oneOf(body.decision, 'Decision', ['approve', 'reject']);
    const { changes } = db
      .prepare("UPDATE listings SET status = ?, admin_note = ? WHERE id = ? AND status = 'pending'")
      .run(decision === 'approve' ? 'approved' : 'rejected', text(body.note, 'Note', { max: 1000 }), params.id);
    if (!changes) throw new HttpError(404, 'Listing not found or already reviewed');
    return { ok: true };
  });

  route('POST', '/api/admin/deals/:id/status', ['admin'], ({ params, body }) => {
    const status = oneOf(body.status, 'Status', ['pending_contract', 'contract_signed', 'paid', 'cancelled']);
    const { changes } = db.prepare('UPDATE deals SET status = ? WHERE id = ?').run(status, params.id);
    if (!changes) throw new HttpError(404, 'Deal not found');
    return { ok: true };
  });

  // ---------- request handling ----------

  async function handleApi(req, res, url) {
    const match = routes
      .filter((r) => r.method === req.method)
      .map((r) => ({ r, m: r.pattern.exec(url.pathname) }))
      .find(({ m }) => m);
    if (!match) throw new HttpError(404, 'Not found');

    const isWrite = req.method !== 'GET';
    if (isWrite) {
      // Cookies are SameSite=Lax; this rejects cross-site writes from browsers that ignore that.
      const origin = req.headers.origin;
      if (origin && URL.parse(origin)?.host !== req.headers.host) {
        throw new HttpError(403, 'Cross-site request blocked');
      }
    }

    const token = parseCookies(req.headers.cookie).sid;
    const user = userFromToken(db, token);
    const { roles } = match.r;
    if (roles && !user) throw new HttpError(401, 'Please sign in');
    if (roles && !roles.includes(user.role)) throw new HttpError(403, 'Your account cannot do this');

    const params = {};
    match.r.keys.forEach((key, i) => (params[key] = Number(match.m[i + 1])));
    const forwarded = trustProxy && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const ip = forwarded || req.socket.remoteAddress || 'unknown';
    const body = isWrite ? await readJson(req) : {};

    return match.r.handler({ req, res, user, token, params, body, ip, query: url.searchParams });
  }

  async function serveStatic(res, pathname) {
    const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
    const filePath = normalize(join(PUBLIC_DIR, relative));
    const inside = filePath.startsWith(PUBLIC_DIR.endsWith(sep) ? PUBLIC_DIR : PUBLIC_DIR + sep);
    let data = null;
    let type = MIME[extname(filePath)];
    if (inside && type) data = await readFile(filePath).catch(() => null);
    if (!data) {
      // Unknown paths get the app shell, which shows its own "not found" view.
      data = await readFile(join(PUBLIC_DIR, 'index.html'));
      type = MIME['.html'];
    }
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
    res.end(data);
  }

  return createServer(async (req, res) => {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(name, value);
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) {
        const result = await handleApi(req, res, url);
        res.writeHead(200, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(result));
      } else if (req.method === 'GET' || req.method === 'HEAD') {
        await serveStatic(res, decodeURIComponent(url.pathname));
      } else {
        throw new HttpError(405, 'Method not allowed');
      }
    } catch (err) {
      const status = err instanceof HttpError ? err.status : err instanceof URIError ? 400 : 500;
      if (status === 500) console.error(err);
      if (!res.headersSent) res.writeHead(status, { 'Content-Type': MIME['.json'] });
      res.end(JSON.stringify({ error: status === 500 ? 'Something went wrong on our side' : err.message }));
    }
  });
}
