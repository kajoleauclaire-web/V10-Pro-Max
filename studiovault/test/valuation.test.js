import assert from 'node:assert/strict';
import { test } from 'node:test';

import { estimate } from '../src/valuation.js';

const base = {
  loc: 200_000,
  engine: 'godot',
  commitYears: 0,
  shippedTitles: 0,
  rights: 'full',
  exclusivity: 'non_exclusive',
  extras: {},
};

test('a plain dataset is priced per line', () => {
  const result = estimate(base);
  assert.equal(result.low, 6000);
  assert.equal(result.high, 18000);
});

test('history, records and exclusivity raise the estimate', () => {
  const plain = estimate(base);
  assert.ok(estimate({ ...base, commitYears: 5 }).high > plain.high);
  assert.ok(estimate({ ...base, extras: { codeReview: true } }).high > plain.high);
  assert.ok(estimate({ ...base, exclusivity: 'exclusive' }).high > plain.high);
});

test('unclear rights lower the estimate', () => {
  assert.ok(estimate({ ...base, rights: 'unsure' }).high < estimate({ ...base, rights: 'partial' }).high);
  assert.ok(estimate({ ...base, rights: 'partial' }).high < estimate(base).high);
});

test('very large codebases get a bulk discount', () => {
  const one = estimate({ ...base, loc: 1_000_000 }).high;
  const two = estimate({ ...base, loc: 2_000_000 }).high;
  assert.ok(two > one && two < one * 2);
});

test('bad input falls back to safe defaults', () => {
  const result = estimate({ loc: 'abc', engine: 'nope', rights: 'nope', exclusivity: 'nope' });
  assert.equal(result.low, 0);
  assert.equal(result.normalized.engine, 'other');
  assert.equal(result.normalized.rights, 'unsure');
});

test('readiness stays between 0 and 100', () => {
  const full = estimate({
    ...base,
    commitYears: 30,
    extras: { issueTracker: 1, codeReview: 1, designDocs: 1, tests: 1, buildLogs: 1, playtestTelemetry: 1 },
  });
  assert.equal(full.readiness, 100);
  assert.ok(estimate({ ...base, rights: 'unsure' }).readiness >= 0);
});
