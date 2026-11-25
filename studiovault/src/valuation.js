// Indicative licence-value estimate for a studio's code and development records.
// Every number that drives the result lives in RATES so the business owner can
// tune pricing in one place as real deals come in.

export const RATES = {
  // USD per line of code, before multipliers.
  perLineLow: 0.03,
  perLineHigh: 0.09,
  // Lines beyond this count are worth less each (bulk discount).
  bulkThreshold: 1_000_000,
  bulkFactor: 0.4,
  engine: { custom: 1.25, unreal: 1.15, unity: 1.1, godot: 1.0, web: 0.9, other: 0.9 },
  // Each year of commit history adds this much, capped.
  historyPerYear: 0.06,
  historyMaxYears: 10,
  // Each shipped title adds this much, capped.
  shippedPerTitle: 0.05,
  shippedMaxTitles: 10,
  // Development records that make a dataset more useful for training.
  extras: {
    issueTracker: 0.12,
    codeReview: 0.15,
    designDocs: 0.1,
    tests: 0.1,
    buildLogs: 0.06,
    playtestTelemetry: 0.12,
  },
  rights: { full: 1, partial: 0.6, unsure: 0.35 },
  exclusivity: { non_exclusive: 1, exclusive: 1.8 },
};

export const ENGINES = Object.keys(RATES.engine);
export const EXTRAS = Object.keys(RATES.extras);
export const RIGHTS = Object.keys(RATES.rights);
export const EXCLUSIVITY = Object.keys(RATES.exclusivity);

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

// Round to two significant figures so the estimate does not look more precise than it is.
function roundNice(n) {
  if (n < 100) return Math.round(n);
  const magnitude = 10 ** (Math.floor(Math.log10(n)) - 1);
  return Math.round(n / magnitude) * magnitude;
}

export function estimate(input) {
  const loc = clamp(Number(input.loc) || 0, 0, 500_000_000);
  const commitYears = clamp(Number(input.commitYears) || 0, 0, 50);
  const shippedTitles = clamp(Number(input.shippedTitles) || 0, 0, 1000);
  const engine = ENGINES.includes(input.engine) ? input.engine : 'other';
  const rights = RIGHTS.includes(input.rights) ? input.rights : 'unsure';
  const exclusivity = EXCLUSIVITY.includes(input.exclusivity) ? input.exclusivity : 'non_exclusive';
  const extras = EXTRAS.filter((key) => input.extras && input.extras[key]);

  const effectiveLoc =
    loc <= RATES.bulkThreshold
      ? loc
      : RATES.bulkThreshold + (loc - RATES.bulkThreshold) * RATES.bulkFactor;

  const factors = [
    { key: 'engine', label: `Engine (${engine})`, multiplier: RATES.engine[engine] },
    {
      key: 'history',
      label: `${commitYears} ${commitYears === 1 ? 'year' : 'years'} of commit history`,
      multiplier: 1 + Math.min(commitYears, RATES.historyMaxYears) * RATES.historyPerYear,
    },
    {
      key: 'shipped',
      label: `${shippedTitles} shipped ${shippedTitles === 1 ? 'title' : 'titles'}`,
      multiplier: 1 + Math.min(shippedTitles, RATES.shippedMaxTitles) * RATES.shippedPerTitle,
    },
    {
      key: 'extras',
      label: `${extras.length} of ${EXTRAS.length} development record types`,
      multiplier: 1 + extras.reduce((sum, key) => sum + RATES.extras[key], 0),
    },
    { key: 'rights', label: `Rights (${rights})`, multiplier: RATES.rights[rights] },
    { key: 'exclusivity', label: `Licence (${exclusivity.replace('_', '-')})`, multiplier: RATES.exclusivity[exclusivity] },
  ];
  const multiplier = factors.reduce((product, f) => product * f.multiplier, 1);

  const low = roundNice(effectiveLoc * RATES.perLineLow * multiplier);
  const high = roundNice(effectiveLoc * RATES.perLineHigh * multiplier);

  // Readiness: how complete the dataset is, independent of its size.
  const readiness = Math.round(
    (extras.length / EXTRAS.length) * 50 +
      (Math.min(commitYears, RATES.historyMaxYears) / RATES.historyMaxYears) * 20 +
      RATES.rights[rights] * 30,
  );

  return {
    low,
    high,
    readiness,
    factors: factors.map((f) => ({ ...f, multiplier: Math.round(f.multiplier * 100) / 100 })),
    normalized: { loc, commitYears, shippedTitles, engine, rights, exclusivity, extras },
  };
}
