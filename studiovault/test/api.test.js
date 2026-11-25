import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { ensureAdmin } from '../src/auth.js';
import { openDb } from '../src/db.js';
import { createApp } from '../src/server.js';

let server;
let base;

// A tiny client that remembers its session cookie, like a browser would.
function client() {
  let cookie = '';
  return async (path, body, headers = {}) => {
    const res = await fetch(base + path, {
      method: body ? 'POST' : 'GET',
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    return { status: res.status, data: await res.json() };
  };
}

const dataset = {
  loc: 300000,
  engine: 'unity',
  commitYears: 5,
  shippedTitles: 2,
  rights: 'full',
  exclusivity: 'exclusive',
  extras: { codeReview: true, tests: true },
};
const listing = {
  ...dataset,
  title: 'Platformer codebase',
  description: 'A complete platformer codebase with five years of history.',
  languages: 'C#',
  askingPrice: 50000,
  repoUrl: 'https://example.com/private/repo',
};

const admin = client();
const studio = client();
const buyer = client();
const buyer2 = client();

before(async () => {
  const db = openDb(':memory:');
  ensureAdmin(db, { email: 'admin@test.dev', password: 'admin-password' });
  server = createApp({ db, feeRate: 0.2 });
  await new Promise((resolve) => server.listen(0, resolve));
  base = `http://localhost:${server.address().port}`;
});

after(() => server.close());

test('estimate works without an account and rejects bad input', async () => {
  const ok = await client()('/api/estimate', dataset);
  assert.equal(ok.status, 200);
  assert.ok(ok.data.high > ok.data.low);
  const bad = await client()('/api/estimate', { ...dataset, loc: -5 });
  assert.equal(bad.status, 400);
});

test('accounts: register, duplicate email, wrong password, role limits', async () => {
  const reg = { name: 'Sam', company: 'Sam Games', email: 'studio@test.dev', password: 'password-1', role: 'studio' };
  assert.equal((await studio('/api/auth/register', reg)).status, 200);
  assert.equal((await client()('/api/auth/register', reg)).status, 409);
  assert.equal((await client()('/api/auth/register', { ...reg, email: 'x@test.dev', role: 'admin' })).status, 400);
  assert.equal((await client()('/api/auth/login', { email: reg.email, password: 'wrong' })).status, 401);

  await buyer('/api/auth/register', { ...reg, company: 'Lab One', email: 'buyer@test.dev', role: 'buyer' });
  await buyer2('/api/auth/register', { ...reg, company: 'Lab Two', email: 'buyer2@test.dev', role: 'buyer' });
  assert.equal((await admin('/api/auth/login', { email: 'admin@test.dev', password: 'admin-password' })).status, 200);

  assert.equal((await client()('/api/catalog')).status, 401);
  assert.equal((await studio('/api/catalog')).status, 403);
  assert.equal((await buyer('/api/admin/overview')).status, 403);
});

test('a listing is hidden until approved, and buyers never see the repository link', async () => {
  const created = await studio('/api/studio/listings', listing);
  assert.equal(created.status, 200);
  assert.equal((await buyer('/api/catalog')).data.listings.length, 0);
  assert.equal((await buyer(`/api/catalog/${created.data.id}`)).status, 404);

  const overview = await admin('/api/admin/overview');
  assert.equal(overview.data.stats.pendingListings, 1);
  assert.equal(overview.data.listings[0].repo_url, listing.repoUrl);

  assert.equal((await admin(`/api/admin/listings/${created.data.id}/review`, { decision: 'approve', note: '' })).status, 200);
  const catalog = await buyer('/api/catalog');
  assert.equal(catalog.data.listings.length, 1);
  assert.equal(catalog.data.listings[0].repo_url, undefined);
  assert.equal(catalog.data.listings[0].studio_company, 'Sam Games');
  assert.equal((await buyer('/api/catalog?q=nothing-matches')).data.listings.length, 0);
});

test('offers: accept creates a deal with the platform fee, exclusive listing closes', async () => {
  assert.equal((await buyer('/api/catalog/1/offers', { amount: 40000, termMonths: 12, message: 'Hello' })).status, 200);
  assert.equal((await buyer('/api/catalog/1/offers', { amount: 41000, termMonths: 12, message: '' })).status, 409);
  await buyer2('/api/catalog/1/offers', { amount: 30000, termMonths: 12, message: '' });

  const offers = (await studio('/api/studio/offers')).data.offers;
  assert.equal(offers.length, 2);
  const winning = offers.find((o) => o.amount === 40000);

  // Another studio cannot answer this studio's offer.
  const other = client();
  await other('/api/auth/register', { name: 'Eve', company: 'Eve Games', email: 'eve@test.dev', password: 'password-1', role: 'studio' });
  assert.equal((await other(`/api/studio/offers/${winning.id}/respond`, { decision: 'accept' })).status, 404);

  assert.equal((await studio(`/api/studio/offers/${winning.id}/respond`, { decision: 'accept' })).status, 200);
  assert.equal((await studio(`/api/studio/offers/${winning.id}/respond`, { decision: 'accept' })).status, 409);

  const deal = (await studio('/api/deals')).data.deals[0];
  assert.deepEqual([deal.gross, deal.fee, deal.payout], [40000, 8000, 32000]);
  const buyerDeal = (await buyer('/api/deals')).data.deals[0];
  assert.equal(buyerDeal.gross, 40000);
  assert.equal(buyerDeal.fee, undefined);

  // Exclusive licence: the listing leaves the catalogue and the other offer is declined.
  assert.equal((await buyer('/api/catalog')).data.listings.length, 0);
  assert.equal((await buyer2('/api/buyer/offers')).data.offers[0].status, 'rejected');

  assert.equal((await admin('/api/admin/deals/1/status', { status: 'paid' })).status, 200);
  const stats = (await admin('/api/admin/overview')).data.stats;
  assert.equal(stats.feesCollected, 8000);
});

test('writes are refused from other sites and without JSON', async () => {
  const crossSite = await buyer('/api/auth/logout', {}, { Origin: 'https://evil.example' });
  assert.equal(crossSite.status, 403);
  const res = await fetch(`${base}/api/auth/login`, { method: 'POST', body: 'email=a' });
  assert.equal(res.status, 415);
});

test('logout ends the session; static files and unknown paths are served safely', async () => {
  await studio('/api/auth/logout', {});
  assert.equal((await studio('/api/studio/listings')).status, 401);

  const page = await fetch(`${base}/`);
  assert.match(await page.text(), /StudioVault/);
  const traversal = await fetch(`${base}/..%2Fsrc%2Fmain.js`);
  assert.match(traversal.headers.get('content-type'), /text\/html/);
});
