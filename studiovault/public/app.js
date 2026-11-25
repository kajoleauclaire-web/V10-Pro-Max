// StudioVault single-page app. Views are plain functions that return HTML; every value that
// comes from a user or the server goes through esc() before it is put into the page.

const app = document.getElementById('app');
const nav = document.getElementById('nav');
const toastEl = document.getElementById('toast');

const state = { user: null, meta: null, estimate: null };

const LABELS = {
  engine: { custom: 'Custom engine', unreal: 'Unreal Engine', unity: 'Unity', godot: 'Godot', web: 'Web / HTML5', other: 'Other' },
  extras: {
    issueTracker: 'Bug / issue tracker history',
    codeReview: 'Code review discussions',
    designDocs: 'Design documents',
    tests: 'Automated tests',
    buildLogs: 'Build and CI logs',
    playtestTelemetry: 'Playtest telemetry',
  },
  rights: {
    full: 'We own all of it',
    partial: 'Some third-party or licensed parts',
    unsure: 'Not sure yet',
  },
  exclusivity: { non_exclusive: 'Non-exclusive (can license to many)', exclusive: 'Exclusive (one buyer only)' },
  status: {
    pending: 'In review', approved: 'Live', rejected: 'Not approved', withdrawn: 'Withdrawn', licensed: 'Licensed',
    accepted: 'Accepted', pending_contract: 'Contract pending', contract_signed: 'Contract signed', paid: 'Paid',
    cancelled: 'Cancelled',
  },
};
const STATUS_TONE = {
  approved: 'good', accepted: 'good', paid: 'good', licensed: 'good', contract_signed: 'good',
  pending: 'warn', pending_contract: 'warn', rejected: 'bad', cancelled: 'bad',
};

// ---------- helpers ----------

const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const money = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
const number = (n) => new Intl.NumberFormat('en-US').format(n);
const date = (s) => new Date(`${s.replace(' ', 'T')}Z`).toLocaleDateString(undefined, { dateStyle: 'medium' });
const badge = (status) => `<span class="badge ${STATUS_TONE[status] || ''}">${esc(LABELS.status[status] || status)}</span>`;
const empty = (message) => `<div class="empty">${message}</div>`;

async function api(path, body) {
  const res = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}

let toastTimer;
function toast(message) {
  toastEl.textContent = message;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastEl.hidden = true), 4000);
}

const go = (hash) => {
  if (location.hash === hash) render();
  else location.hash = hash;
};
const home = () => ({ studio: '#/studio', buyer: '#/catalog', admin: '#/admin' })[state.user?.role] || '#/';

// ---------- shared form pieces ----------

const options = (map, selected) =>
  Object.entries(map)
    .map(([value, label]) => `<option value="${esc(value)}" ${value === selected ? 'selected' : ''}>${esc(label)}</option>`)
    .join('');

function datasetFields(v = {}) {
  return `
    <div class="fields-2">
      <label class="field">Lines of code
        <input name="loc" type="number" inputmode="numeric" min="1" max="500000000" required value="${esc(v.loc ?? 250000)}" />
      </label>
      <label class="field">Engine
        <select name="engine">${options(LABELS.engine, v.engine || 'unity')}</select>
      </label>
      <label class="field">Years of commit history
        <input name="commitYears" type="number" inputmode="numeric" min="0" max="50" required value="${esc(v.commitYears ?? 4)}" />
      </label>
      <label class="field">Shipped titles
        <input name="shippedTitles" type="number" inputmode="numeric" min="0" max="1000" required value="${esc(v.shippedTitles ?? 1)}" />
      </label>
    </div>
    <fieldset>
      <legend>Development records you can include</legend>
      <div class="checks">
        ${Object.entries(LABELS.extras)
          .map(
            ([key, label]) =>
              `<label class="check"><input type="checkbox" name="extra_${key}" ${v.extras?.[key] ? 'checked' : ''} />${esc(label)}</label>`,
          )
          .join('')}
      </div>
    </fieldset>
    <div class="fields-2">
      <label class="field">Who owns the code?
        <select name="rights">${options(LABELS.rights, v.rights || 'full')}</select>
      </label>
      <label class="field">Licence type
        <select name="exclusivity">${options(LABELS.exclusivity, v.exclusivity || 'non_exclusive')}</select>
      </label>
    </div>`;
}

function readDataset(form) {
  const data = new FormData(form);
  const extras = {};
  for (const key of Object.keys(LABELS.extras)) extras[key] = data.has(`extra_${key}`);
  return {
    loc: Number(data.get('loc')),
    engine: data.get('engine'),
    commitYears: Number(data.get('commitYears')),
    shippedTitles: Number(data.get('shippedTitles')),
    rights: data.get('rights'),
    exclusivity: data.get('exclusivity'),
    extras,
  };
}

function estimateCard(result) {
  return `
    <div class="card result">
      <span class="eyebrow">Indicative licence value</span>
      <div class="range">${money(result.low)} – ${money(result.high)}</div>
      <div class="row between small muted"><span>Data readiness</span><span>${result.readiness} / 100</span></div>
      <div class="meter" role="img" aria-label="Data readiness ${result.readiness} out of 100"><span style="width:${result.readiness}%"></span></div>
      <ul class="factors">
        ${result.factors.map((f) => `<li><span>${esc(f.label)}</span><b>×${f.multiplier.toFixed(2)}</b></li>`).join('')}
      </ul>
      <p class="small muted" style="margin:14px 0 0">A guide based on size, history and rights. The real price is whatever a buyer agrees to pay.</p>
    </div>`;
}

function listingTags(l) {
  const extras = Object.keys(LABELS.extras).filter((key) => l.extras[key]);
  return `
    <div class="tags">
      <span class="tag">${esc(LABELS.engine[l.engine])}</span>
      <span class="tag">${esc(l.languages)}</span>
      <span class="tag">${number(l.loc)} lines</span>
      <span class="tag">${l.commit_years} yrs history</span>
      <span class="tag">${l.shipped_titles} shipped</span>
      <span class="tag">${l.exclusivity === 'exclusive' ? 'Exclusive' : 'Non-exclusive'}</span>
      ${extras.map((key) => `<span class="tag">${esc(LABELS.extras[key])}</span>`).join('')}
    </div>`;
}

// ---------- views ----------

const views = {};

views.home = async () => `
  <section class="split hero">
    <div>
      <span class="eyebrow">For game studios</span>
      <h1>Your old code can earn again.</h1>
      <p class="lead">AI labs pay for real-world code and the story of how it was built. StudioVault tells you what
        yours could be worth, lists it for vetted buyers, and handles the offers.</p>
      <div class="row">
        <a class="btn" href="#estimate">Get my estimate</a>
        <a class="btn ghost" href="#/register?role=buyer">I'm an AI lab</a>
      </div>
    </div>
    <div class="stack" id="estimate">
      <form class="card stack" data-form="estimate">
        <h2>Estimate your licence value</h2>
        ${datasetFields(state.estimate?.normalized)}
        <div class="fields-2">
          <label class="field">Studio name (optional)<input name="studio" maxlength="120" autocomplete="organization" /></label>
          <label class="field">Email me the next steps (optional)<input name="email" type="email" maxlength="254" autocomplete="email" /></label>
        </div>
        <p class="error" data-error hidden></p>
        <button class="btn" type="submit">Unlock my estimate</button>
      </form>
      <div id="estimate-result">${
        state.estimate
          ? `${estimateCard(state.estimate)}<a class="btn" style="margin-top:14px" href="#/register?role=studio">List this dataset</a>`
          : ''
      }</div>
    </div>
  </section>

  <section class="section">
    <h2>How it works</h2>
    <div class="grid steps">
      <div class="card"><h3>Estimate</h3><p class="muted">Answer a few questions about your codebase and records. Get a price range in seconds, with no upload.</p></div>
      <div class="card"><h3>List</h3><p class="muted">Describe the dataset and set your asking price. We review every listing before buyers see it.</p></div>
      <div class="card"><h3>Review offers</h3><p class="muted">Vetted AI labs send offers. Accept, decline or wait. You stay in control of who gets a licence.</p></div>
      <div class="card"><h3>Get paid</h3><p class="muted">We arrange the contract and transfer. Our fee is ${Math.round(state.meta.feeRate * 100)}% of the deal, taken only when you are paid.</p></div>
    </div>
  </section>

  <section class="section split">
    <div>
      <span class="eyebrow">For AI labs</span>
      <h2>Licensed, documented, rights-cleared game code.</h2>
      <p class="muted">Browse production codebases with their commit history, reviews, bug trackers and design documents.
        Every listing states who owns the rights, and you deal with the studio through one contract.</p>
      <a class="btn ghost" href="#/register?role=buyer">Request catalogue access</a>
    </div>
    <div class="card">
      <h3>What raises a dataset's value</h3>
      <ul class="factors">
        <li><span>Long, unbroken commit history</span><b>+</b></li>
        <li><span>Code review and issue discussions</span><b>+</b></li>
        <li><span>Design documents explaining decisions</span><b>+</b></li>
        <li><span>Shipped, played titles</span><b>+</b></li>
        <li><span>Clear ownership of every file</span><b>+</b></li>
      </ul>
    </div>
  </section>`;

views.auth = async (mode, query) => {
  if (state.user) return go(home());
  const register = mode === 'register';
  const role = query.get('role') === 'buyer' ? 'buyer' : 'studio';
  return `
    <section class="card stack" style="max-width:460px;margin:24px auto 0">
      <h2>${register ? 'Create your account' : 'Sign in'}</h2>
      <form class="stack" data-form="${register ? 'register' : 'login'}">
        ${
          register
            ? `<label class="field">I am a
                 <select name="role">
                   <option value="studio" ${role === 'studio' ? 'selected' : ''}>Game studio — I want to license my code</option>
                   <option value="buyer" ${role === 'buyer' ? 'selected' : ''}>AI lab — I want to license data</option>
                 </select>
               </label>
               <label class="field">Your name<input name="name" required maxlength="120" autocomplete="name" /></label>
               <label class="field">Company<input name="company" required maxlength="120" autocomplete="organization" /></label>`
            : ''
        }
        <label class="field">Email<input name="email" type="email" required maxlength="254" autocomplete="email" /></label>
        <label class="field">Password${register ? ' (at least 8 characters)' : ''}
          <input name="password" type="password" required minlength="${register ? 8 : 1}" maxlength="200"
            autocomplete="${register ? 'new-password' : 'current-password'}" />
        </label>
        <p class="error" data-error hidden></p>
        <button class="btn" type="submit">${register ? 'Create account' : 'Sign in'}</button>
      </form>
      <p class="small muted" style="margin:0">${
        register ? 'Already have an account? <a href="#/login">Sign in</a>' : 'New here? <a href="#/register">Create an account</a>'
      }</p>
    </section>`;
};

function dealsSection(deals, role) {
  if (!deals.length) return '';
  return `
    <section class="section">
      <h2>Deals</h2>
      <div class="list">
        ${deals
          .map(
            (d) => `
          <div class="card">
            <div class="row between"><span class="item-title">${esc(d.listing_title)}</span>${badge(d.status)}</div>
            <p class="small muted" style="margin:6px 0 0">
              ${role === 'studio' ? `Buyer: ${esc(d.buyer_company)}` : `Studio: ${esc(d.studio_company)}`} · ${date(d.created_at)}
            </p>
            <p style="margin:8px 0 0">${
              role === 'studio'
                ? `Deal ${money(d.gross)} − fee ${money(d.fee)} = <b>you receive ${money(d.payout)}</b>`
                : `Licence price <b>${money(d.gross)}</b>`
            }</p>
          </div>`,
          )
          .join('')}
      </div>
    </section>`;
}

views.studio = async () => {
  const [{ listings }, { offers }, { deals }] = await Promise.all([
    api('/api/studio/listings'),
    api('/api/studio/offers'),
    api('/api/deals'),
  ]);
  const pending = offers.filter((o) => o.status === 'pending');
  return `
    <div class="row between">
      <div><span class="eyebrow">${esc(state.user.company)}</span><h1 style="font-size:2rem">Studio dashboard</h1></div>
      <a class="btn" href="#/studio/new">New listing</a>
    </div>

    <section class="section" style="margin-top:28px">
      <h2>Offers waiting for you</h2>
      ${
        pending.length
          ? `<div class="list">${pending
              .map(
                (o) => `
            <div class="card">
              <div class="row between">
                <span class="item-title">${esc(o.buyer_company)}</span>
                <span class="price">${money(o.amount)}</span>
              </div>
              <p class="small muted" style="margin:6px 0">For “${esc(o.listing_title)}” · ${o.term_months}-month licence · you asked ${money(o.asking_price)}</p>
              ${o.message ? `<p class="pre">${esc(o.message)}</p>` : ''}
              <div class="row">
                <button class="btn sm" data-action="respond" data-id="${o.id}" data-decision="accept">Accept</button>
                <button class="btn sm danger" data-action="respond" data-id="${o.id}" data-decision="reject">Decline</button>
              </div>
            </div>`,
              )
              .join('')}</div>`
          : empty('No open offers right now. Offers appear here once a listing is live.')
      }
    </section>

    <section class="section">
      <h2>Your listings</h2>
      ${
        listings.length
          ? `<div class="list">${listings
              .map(
                (l) => `
            <div class="card">
              <div class="row between"><span class="item-title">${esc(l.title)}</span>${badge(l.status)}</div>
              ${listingTags(l)}
              <div class="row between">
                <span class="small muted">Asking ${money(l.asking_price)} · estimate ${money(l.est_low)}–${money(l.est_high)}</span>
                ${
                  ['pending', 'approved'].includes(l.status)
                    ? `<button class="btn sm ghost" data-action="withdraw-listing" data-id="${l.id}">Withdraw</button>`
                    : ''
                }
              </div>
              ${l.admin_note ? `<p class="small" style="margin:10px 0 0">Reviewer note: ${esc(l.admin_note)}</p>` : ''}
            </div>`,
              )
              .join('')}</div>`
          : empty('You have no listings yet. <a href="#/studio/new">Create your first listing</a>.')
      }
    </section>
    ${dealsSection(deals, 'studio')}`;
};

views.newListing = async () => {
  const v = state.estimate?.normalized;
  return `
    <a class="small" href="#/studio">← Back to dashboard</a>
    <form class="card stack" data-form="listing" style="margin-top:14px">
      <h2>New listing</h2>
      <label class="field">Title<input name="title" required minlength="3" maxlength="120" placeholder="Co-op roguelike — full repository and history" /></label>
      <label class="field">Description (what is included, and anything a buyer should know)
        <textarea name="description" required minlength="20" maxlength="4000"></textarea>
      </label>
      <label class="field">Programming languages<input name="languages" required maxlength="200" placeholder="C#, HLSL" /></label>
      ${datasetFields(v)}
      <div class="fields-2">
        <label class="field">Asking price (USD)
          <input name="askingPrice" type="number" inputmode="numeric" min="1" max="1000000000" required
            value="${state.estimate ? Math.round((state.estimate.low + state.estimate.high) / 2) : ''}" />
        </label>
        <label class="field">Private repository link (optional, only our reviewers see it)
          <input name="repoUrl" type="url" maxlength="500" placeholder="https://" />
        </label>
      </div>
      <label class="check"><input type="checkbox" name="confirm" required />I confirm my studio has the right to license this material.</label>
      <p class="error" data-error hidden></p>
      <button class="btn" type="submit">Submit for review</button>
    </form>`;
};

views.catalog = async (query) => {
  const engine = query.get('engine') || '';
  const q = query.get('q') || '';
  const { listings } = await api(`/api/catalog?${new URLSearchParams({ engine, q })}`);
  return `
    <span class="eyebrow">Catalogue</span>
    <h1 style="font-size:2rem">Datasets available to license</h1>
    <form class="row" data-form="catalog-filter" style="margin:16px 0 20px">
      <input name="q" value="${esc(q)}" placeholder="Search title, language…" aria-label="Search" style="flex:1;min-width:180px" />
      <select name="engine" aria-label="Engine" style="width:auto">
        <option value="">All engines</option>${options(LABELS.engine, engine)}
      </select>
      <button class="btn ghost" type="submit">Filter</button>
    </form>
    ${
      listings.length
        ? `<div class="list">${listings
            .map(
              (l) => `
          <div class="card">
            <div class="row between">
              <a class="item-title" href="#/catalog/${l.id}">${esc(l.title)}</a>
              <span class="price">${money(l.asking_price)}</span>
            </div>
            <p class="small muted" style="margin:4px 0 0">${esc(l.studio_company)}</p>
            ${listingTags(l)}
          </div>`,
            )
            .join('')}</div>`
        : empty('No datasets match. Try a different search.')
    }`;
};

views.listing = async (id) => {
  const { listing: l } = await api(`/api/catalog/${id}`);
  return `
    <a class="small" href="#/catalog">← Back to catalogue</a>
    <section class="split" style="margin-top:14px">
      <div class="card">
        <span class="eyebrow">${esc(l.studio_company)}</span>
        <h2>${esc(l.title)}</h2>
        ${listingTags(l)}
        <p class="pre">${esc(l.description)}</p>
        <p class="small muted" style="margin:0">Rights: ${esc(LABELS.rights[l.rights])} · Listed ${date(l.created_at)}</p>
      </div>
      <div class="card stack">
        <div><span class="small muted">Asking price</span><div class="range">${money(l.asking_price)}</div></div>
        ${
          state.user.role === 'buyer'
            ? `<form class="stack" data-form="offer" data-id="${l.id}">
                <div class="fields-2">
                  <label class="field">Your offer (USD)
                    <input name="amount" type="number" inputmode="numeric" min="1" max="1000000000" required value="${l.asking_price}" />
                  </label>
                  <label class="field">Licence term (months)
                    <input name="termMonths" type="number" inputmode="numeric" min="1" max="1200" required value="24" />
                  </label>
                </div>
                <label class="field">Message to the studio (optional)<textarea name="message" maxlength="2000"></textarea></label>
                <p class="error" data-error hidden></p>
                <button class="btn" type="submit">Send offer</button>
              </form>`
            : '<p class="muted">Sign in as an AI lab to send an offer.</p>'
        }
      </div>
    </section>`;
};

views.buyerOffers = async () => {
  const [{ offers }, { deals }] = await Promise.all([api('/api/buyer/offers'), api('/api/deals')]);
  return `
    <span class="eyebrow">${esc(state.user.company)}</span>
    <h1 style="font-size:2rem">Your offers</h1>
    ${
      offers.length
        ? `<div class="list" style="margin-top:16px">${offers
            .map(
              (o) => `
          <div class="card">
            <div class="row between"><a class="item-title" href="#/catalog/${o.listing_id}">${esc(o.listing_title)}</a>${badge(o.status)}</div>
            <div class="row between" style="margin-top:8px">
              <span class="small muted">You offered ${money(o.amount)} for ${o.term_months} months · asking ${money(o.asking_price)} · ${date(o.created_at)}</span>
              ${o.status === 'pending' ? `<button class="btn sm ghost" data-action="withdraw-offer" data-id="${o.id}">Withdraw</button>` : ''}
            </div>
          </div>`,
            )
            .join('')}</div>`
        : empty('You have not made any offers yet. <a href="#/catalog">Browse the catalogue</a>.')
    }
    ${dealsSection(deals, 'buyer')}`;
};

views.admin = async () => {
  const { stats, listings, deals, leads } = await api('/api/admin/overview');
  const stat = (label, value) => `<div class="card"><div class="small muted">${label}</div><div class="stat">${value}</div></div>`;
  const pending = listings.filter((l) => l.status === 'pending');
  const dealStatuses = ['pending_contract', 'contract_signed', 'paid', 'cancelled'];
  return `
    <span class="eyebrow">Admin</span>
    <h1 style="font-size:2rem">Business overview</h1>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));margin-top:16px">
      ${stat('Fees earned', money(stats.feesEarned))}
      ${stat('Fees collected', money(stats.feesCollected))}
      ${stat('Deal volume', money(stats.dealVolume))}
      ${stat('Live listings', stats.liveListings)}
      ${stat('Open offers', stats.openOffers)}
      ${stat('Studios', stats.studios)}
      ${stat('AI labs', stats.buyers)}
      ${stat('Estimate leads', stats.leads)}
    </div>

    <section class="section">
      <h2>Listings to review (${pending.length})</h2>
      ${
        pending.length
          ? `<div class="list">${pending
              .map(
                (l) => `
            <div class="card">
              <div class="row between"><span class="item-title">${esc(l.title)}</span><span class="price">${money(l.asking_price)}</span></div>
              <p class="small muted" style="margin:4px 0 0">${esc(l.studio_company)} · ${esc(l.studio_email)} · estimate ${money(l.est_low)}–${money(l.est_high)}</p>
              ${listingTags(l)}
              <p class="pre">${esc(l.description)}</p>
              <p class="small muted">Rights: ${esc(LABELS.rights[l.rights])}${
                l.repo_url ? ` · <a href="${esc(l.repo_url)}" target="_blank" rel="noopener noreferrer">Repository link</a>` : ''
              }</p>
              <form class="stack" data-form="review" data-id="${l.id}">
                <label class="field">Note to the studio (optional)<input name="note" maxlength="1000" /></label>
                <div class="row">
                  <button class="btn sm" type="submit" name="decision" value="approve">Approve</button>
                  <button class="btn sm danger" type="submit" name="decision" value="reject">Reject</button>
                </div>
              </form>
            </div>`,
              )
              .join('')}</div>`
          : empty('Nothing waiting for review.')
      }
    </section>

    <section class="section">
      <h2>Deals</h2>
      ${
        deals.length
          ? `<div class="list">${deals
              .map(
                (d) => `
            <div class="card">
              <div class="row between"><span class="item-title">${esc(d.listing_title)}</span>${badge(d.status)}</div>
              <p class="small muted" style="margin:6px 0">${esc(d.studio_company)} (${esc(d.studio_email)}) → ${esc(d.buyer_company)} (${esc(d.buyer_email)})</p>
              <p>Deal ${money(d.gross)} · <b>your fee ${money(d.fee)}</b> · studio payout ${money(d.payout)}</p>
              <label class="field" style="max-width:260px">Status
                <select data-action="deal-status" data-id="${d.id}">${options(
                  Object.fromEntries(dealStatuses.map((s) => [s, LABELS.status[s]])),
                  d.status,
                )}</select>
              </label>
            </div>`,
              )
              .join('')}</div>`
          : empty('No deals yet. A deal is created when a studio accepts an offer.')
      }
    </section>

    <section class="section">
      <h2>Estimate leads</h2>
      ${
        leads.length
          ? `<div class="list">${leads
              .map(
                (l) => `
            <div class="card row between">
              <span><b>${esc(l.studio || 'Unnamed studio')}</b> · <a href="mailto:${esc(l.email)}">${esc(l.email)}</a></span>
              <span class="small muted">${money(l.est_low)}–${money(l.est_high)} · ${date(l.created_at)}</span>
            </div>`,
              )
              .join('')}</div>`
          : empty('Studios who leave an email on the estimate form appear here.')
      }
    </section>

    <section class="section">
      <h2>All listings</h2>
      <div class="list">${
        listings
          .map(
            (l) => `<div class="card row between"><span>${esc(l.title)} <span class="small muted">· ${esc(l.studio_company)}</span></span>${badge(l.status)}</div>`,
          )
          .join('') || empty('No listings yet.')
      }</div>
    </section>`;
};

// ---------- router ----------

const ROUTES = [
  { pattern: /^\/$/, view: () => views.home() },
  { pattern: /^\/login$/, view: (m, q) => views.auth('login', q) },
  { pattern: /^\/register$/, view: (m, q) => views.auth('register', q) },
  { pattern: /^\/studio$/, roles: ['studio'], view: () => views.studio() },
  { pattern: /^\/studio\/new$/, roles: ['studio'], view: () => views.newListing() },
  { pattern: /^\/catalog$/, roles: ['buyer', 'admin'], view: (m, q) => views.catalog(q) },
  { pattern: /^\/catalog\/(\d+)$/, roles: ['buyer', 'admin'], view: (m) => views.listing(m[1]) },
  { pattern: /^\/offers$/, roles: ['buyer'], view: () => views.buyerOffers() },
  { pattern: /^\/admin$/, roles: ['admin'], view: () => views.admin() },
];

function renderNav(path) {
  const links = {
    studio: [['#/studio', 'Dashboard'], ['#/studio/new', 'New listing']],
    buyer: [['#/catalog', 'Catalogue'], ['#/offers', 'My offers']],
    admin: [['#/admin', 'Overview'], ['#/catalog', 'Catalogue']],
  }[state.user?.role] || [['#/login', 'Sign in'], ['#/register', 'Get started']];
  nav.innerHTML =
    links.map(([href, label]) => `<a href="${href}" ${href === `#${path}` ? 'aria-current="page"' : ''}>${label}</a>`).join('') +
    (state.user ? '<a href="#/" data-action="logout">Sign out</a>' : '');
}

let renderId = 0;
async function render() {
  const id = ++renderId;
  const [path, queryString = ''] = (location.hash.slice(1) || '/').split('?');
  // Plain anchors such as #estimate scroll within the home page.
  const anchor = !path.startsWith('/') ? path : null;
  const route = ROUTES.find((r) => r.pattern.test(anchor ? '/' : path));
  renderNav(anchor ? '/' : path);

  if (!route) {
    app.innerHTML = empty('That page does not exist. <a href="#/">Go to the home page</a>.');
    return;
  }
  if (route.roles && !state.user) return go('#/login');
  if (route.roles && !route.roles.includes(state.user.role)) return go(home());

  try {
    const html = await route.view(route.pattern.exec(anchor ? '/' : path), new URLSearchParams(queryString));
    if (id !== renderId || typeof html !== 'string') return;
    app.innerHTML = html;
    if (anchor) document.getElementById(anchor)?.scrollIntoView();
    else window.scrollTo(0, 0);
  } catch (err) {
    if (id === renderId) app.innerHTML = empty(`${esc(err.message)} <a href="#/">Go to the home page</a>.`);
  }
}

// ---------- actions ----------

const forms = {
  async estimate(form) {
    const data = new FormData(form);
    state.estimate = await api('/api/estimate', {
      ...readDataset(form),
      email: data.get('email').trim(),
      studio: data.get('studio').trim(),
    });
    const target = document.getElementById('estimate-result');
    target.innerHTML = `${estimateCard(state.estimate)}<a class="btn" style="margin-top:14px" href="${
      state.user?.role === 'studio' ? '#/studio/new' : '#/register?role=studio'
    }">List this dataset</a>`;
    target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  },
  async login(form) {
    const data = Object.fromEntries(new FormData(form));
    state.user = (await api('/api/auth/login', data)).user;
    go(home());
  },
  async register(form) {
    const data = Object.fromEntries(new FormData(form));
    state.user = (await api('/api/auth/register', data)).user;
    go(state.user.role === 'studio' && state.estimate ? '#/studio/new' : home());
  },
  async listing(form) {
    const data = new FormData(form);
    await api('/api/studio/listings', {
      ...readDataset(form),
      title: data.get('title'),
      description: data.get('description'),
      languages: data.get('languages'),
      askingPrice: Number(data.get('askingPrice')),
      repoUrl: data.get('repoUrl'),
    });
    toast('Listing submitted. We will review it shortly.');
    go('#/studio');
  },
  async offer(form) {
    const data = new FormData(form);
    await api(`/api/catalog/${form.dataset.id}/offers`, {
      amount: Number(data.get('amount')),
      termMonths: Number(data.get('termMonths')),
      message: data.get('message'),
    });
    toast('Offer sent to the studio.');
    go('#/offers');
  },
  async review(form, submitter) {
    await api(`/api/admin/listings/${form.dataset.id}/review`, {
      decision: submitter.value,
      note: new FormData(form).get('note'),
    });
    toast(submitter.value === 'approve' ? 'Listing approved and now live.' : 'Listing rejected.');
    render();
  },
  async 'catalog-filter'(form) {
    const data = new FormData(form);
    go(`#/catalog?${new URLSearchParams({ q: data.get('q'), engine: data.get('engine') })}`);
  },
};

const actions = {
  async logout() {
    await api('/api/auth/logout', {});
    state.user = null;
    go('#/');
  },
  async respond(el) {
    const accept = el.dataset.decision === 'accept';
    if (!confirm(accept ? 'Accept this offer and create a deal?' : 'Decline this offer?')) return;
    await api(`/api/studio/offers/${el.dataset.id}/respond`, { decision: el.dataset.decision });
    toast(accept ? 'Offer accepted. We will be in touch about the contract.' : 'Offer declined.');
    render();
  },
  async 'withdraw-listing'(el) {
    if (!confirm('Withdraw this listing? Open offers on it will be declined.')) return;
    await api(`/api/studio/listings/${el.dataset.id}/withdraw`, {});
    render();
  },
  async 'withdraw-offer'(el) {
    if (!confirm('Withdraw this offer?')) return;
    await api(`/api/buyer/offers/${el.dataset.id}/withdraw`, {});
    render();
  },
};

document.addEventListener('submit', async (event) => {
  const form = event.target.closest('[data-form]');
  if (!form) return;
  event.preventDefault();
  const errorEl = form.querySelector('[data-error]');
  const button = event.submitter;
  if (errorEl) errorEl.hidden = true;
  if (button) button.disabled = true;
  try {
    await forms[form.dataset.form](form, button);
  } catch (err) {
    if (errorEl) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
    } else toast(err.message);
  } finally {
    if (button) button.disabled = false;
  }
});

document.addEventListener('click', async (event) => {
  const el = event.target.closest('button[data-action], a[data-action]');
  if (!el) return;
  event.preventDefault();
  try {
    await actions[el.dataset.action](el);
  } catch (err) {
    toast(err.message);
  }
});

document.addEventListener('change', async (event) => {
  const el = event.target.closest('select[data-action="deal-status"]');
  if (!el) return;
  try {
    await api(`/api/admin/deals/${el.dataset.id}/status`, { status: el.value });
    toast('Deal status updated.');
    render();
  } catch (err) {
    toast(err.message);
  }
});

window.addEventListener('hashchange', render);

const [me, meta] = await Promise.all([api('/api/me'), api('/api/meta')]);
state.user = me.user;
state.meta = meta;
render();
