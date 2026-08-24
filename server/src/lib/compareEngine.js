/**
 * Diff two lists of holdings (already merged-by-CUSIP within each filing) by
 * a key function. Matching is always by key (CUSIP, or CUSIP+putCall for
 * options) — never by issuer name, so a rebrand/CUSIP-change across quarters
 * correctly shows as an EXIT + NEW pair rather than being silently matched
 * or double-counted.
 */
function diffHoldings(holdingsA, holdingsB, keyFn) {
  const byKeyA = new Map(holdingsA.map((h) => [keyFn(h), h]));
  const byKeyB = new Map(holdingsB.map((h) => [keyFn(h), h]));
  const allKeys = new Set([...byKeyA.keys(), ...byKeyB.keys()]);

  const rows = [];
  for (const key of allKeys) {
    const a = byKeyA.get(key);
    const b = byKeyB.get(key);
    const sharesA = a?.shares || 0;
    const sharesB = b?.shares || 0;
    const valueUsdA = a?.valueUsd || 0;
    const valueUsdB = b?.valueUsd || 0;

    let tag;
    if (!a && b) tag = 'NEW';
    else if (a && !b) tag = 'EXIT';
    else if (sharesB > sharesA) tag = 'INCREASE';
    else if (sharesB < sharesA) tag = 'DECREASE';
    else tag = 'UNCHANGED';

    const shareDelta = sharesB - sharesA;
    const valueDelta = valueUsdB - valueUsdA;
    const pctChange = sharesA > 0 ? (shareDelta / sharesA) * 100 : b ? Infinity : 0;

    rows.push({
      key,
      cusip: (a || b).cusip,
      nameOfIssuer: (b || a).nameOfIssuer,
      titleOfClass: (b || a).titleOfClass,
      putCall: (b || a).putCall || '',
      sharesA,
      sharesB,
      shareDelta,
      valueUsdA,
      valueUsdB,
      valueDelta,
      pctChange,
      tag,
    });
  }
  return rows;
}

function summarize(rows) {
  const newPositions = rows.filter((r) => r.tag === 'NEW').length;
  const exits = rows.filter((r) => r.tag === 'EXIT').length;
  const increased = rows.filter((r) => r.tag === 'INCREASE').length;
  const decreased = rows.filter((r) => r.tag === 'DECREASE').length;
  const netShareFlow = rows.reduce((sum, r) => sum + r.shareDelta, 0);
  const netValueFlow = rows.reduce((sum, r) => sum + r.valueDelta, 0);
  return {
    totalPositionsBefore: rows.filter((r) => r.sharesA > 0).length,
    totalPositionsAfter: rows.filter((r) => r.sharesB > 0).length,
    newPositions,
    exits,
    buyerCount: increased, // positions the manager added shares to
    sellerCount: decreased, // positions the manager trimmed shares from
    netShareFlow,
    netValueFlow,
  };
}

function topMovers(rows, sortBy = 'shares') {
  const field = sortBy === 'value' ? 'valueDelta' : 'shareDelta';
  const finite = rows.filter((r) => Number.isFinite(r[field]));
  const buys = finite
    .filter((r) => r[field] > 0)
    .sort((a, b) => b[field] - a[field])
    .slice(0, 10);
  const sells = finite
    .filter((r) => r[field] < 0)
    .sort((a, b) => a[field] - b[field])
    .slice(0, 10);
  return { buys, sells };
}

/**
 * Full quarter-over-quarter compare for one filer between two filings.
 * `common`/`options`/`bonds` are the mergeByCusip() buckets for each filing.
 */
export function computeCompare(filingA, filingB, { sortBy = 'shares' } = {}) {
  const common = diffHoldings(filingA.rows.common, filingB.rows.common, (h) => h.cusip);
  const options = diffHoldings(filingA.rows.options, filingB.rows.options, (h) => `${h.cusip}:${h.putCall}`);
  const bonds = diffHoldings(filingA.rows.bonds, filingB.rows.bonds, (h) => h.cusip);

  return {
    filingA: { period: filingA.periodOfReport, filingDate: filingA.filingDate, accession: filingA.accessionNumber },
    filingB: { period: filingB.periodOfReport, filingDate: filingB.filingDate, accession: filingB.accessionNumber },
    common: {
      rows: common,
      stats: summarize(common),
      ...topMovers(common, sortBy),
    },
    options: { rows: options, stats: summarize(options) },
    bonds: { rows: bonds, stats: summarize(bonds) },
  };
}

/** Look up a single CUSIP's row (from an already-computed common.rows) and derive a plain-English verdict. */
export function verdictFor(commonRows, cusip) {
  const row = commonRows.find((r) => r.cusip === cusip);
  if (!row) return { found: false };
  let verdict;
  if (row.tag === 'NEW') verdict = 'NEW POSITION';
  else if (row.tag === 'EXIT') verdict = 'EXIT';
  else if (row.tag === 'INCREASE') verdict = 'NET BUY';
  else if (row.tag === 'DECREASE') verdict = 'NET SELL';
  else verdict = 'UNCHANGED';
  return { found: true, verdict, row };
}
