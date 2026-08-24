import { secFetch } from './secClient.js';
import { padCik } from './submissions.js';
import { listFilings, getFilingHoldings } from './holdingsService.js';
import { MAJOR_MANAGER_CIKS } from './majorManagers.js';

function reAccession(id) {
  if (/^\d{10}-\d{2}-\d{6}$/.test(id)) return id;
  const digits = id.replace(/\D/g, '');
  if (digits.length !== 18) return null;
  return `${digits.slice(0, 10)}-${digits.slice(10, 12)}-${digits.slice(12)}`;
}

/**
 * Best-effort EDGAR full-text search for filings whose text mentions a raw
 * CUSIP string. EDGAR's search API pages results ~10 at a time, so this
 * walks pages (via `from`) until it has gathered `limit` unique filers or
 * runs out of hits — otherwise every search would silently cap at ~10
 * candidates regardless of the requested limit.
 */
async function ftsSearchCusip(cusip, limit) {
  const seen = new Set();
  const candidates = [];
  let from = 0;
  let totalMentions = 0;
  const hardScanCap = 300; // don't walk more than ~30 pages even if limit is high

  while (candidates.length < limit && from < hardScanCap) {
    const url = `https://efts.sec.gov/LATEST/search-index?q=%22${encodeURIComponent(
      cusip
    )}%22&forms=13F-HR&from=${from}`;
    const data = await secFetch(url, { as: 'json', ttlMs: 60 * 60 * 1000 });
    const hits = data?.hits?.hits || [];
    if (from === 0) totalMentions = data?.hits?.total?.value ?? hits.length;
    if (hits.length === 0) break;

    for (const hit of hits) {
      const cik = padCik((hit._source?.ciks || [])[0] || '');
      const adsh = hit._source?.adsh || reAccession((hit._id || '').split(':')[0]);
      if (!cik || !adsh || seen.has(cik)) continue;
      seen.add(cik);
      candidates.push({ cik, accession: adsh, entityName: (hit._source?.display_names || [])[0] || null });
      if (candidates.length >= limit) break;
    }

    from += hits.length;
    if (hits.length < 10) break; // last page
  }

  return { candidates, totalMentions };
}

function findRow(holdings, cusip) {
  return holdings.rows.common.find((r) => r.cusip === cusip) || holdings.rows.bonds.find((r) => r.cusip === cusip);
}

/**
 * Diffs one filer's true MOST RECENT 13F-HR against their prior one for a
 * given CUSIP — never the specific (possibly years-old) filing where the
 * full-text search happened to find the mention. That distinction matters:
 * a manager who has since fully exited the position won't mention the CUSIP
 * in their current filing at all, so using the FTS-hit filing as "current"
 * would silently miss every full exit — the single most dramatic kind of
 * sell signal. Checking each manager's actual latest filing catches those
 * as EXIT (sharesNow === 0) instead of dropping them entirely.
 *
 * The current and prior filings don't depend on each other, so they're
 * fetched with Promise.all rather than one after another — halves this
 * function's own critical-path latency, since each candidate otherwise
 * waits on two full filing downloads+parses in sequence for no reason.
 */
async function diffCandidate(cusip, cik, fallbackName) {
  const { manager, filings } = await listFilings(cik);
  const currentMeta = filings[0];
  if (!currentMeta) return null;
  const priorMeta = filings[1];

  const [holdingsNow, holdingsPrior] = await Promise.all([
    getFilingHoldings(cik, currentMeta.accessionNumber),
    priorMeta ? getFilingHoldings(cik, priorMeta.accessionNumber) : Promise.resolve(null),
  ]);

  const rowNow = findRow(holdingsNow, cusip);
  let sharesPrior = 0;
  let hadPrior = false;
  if (holdingsPrior) {
    const rowPrior = findRow(holdingsPrior, cusip);
    if (rowPrior) {
      sharesPrior = rowPrior.shares;
      hadPrior = true;
    }
  }

  // FTS matched some older filing for this manager, but they neither hold
  // it now nor held it last quarter — stale match, not relevant.
  if (!rowNow && !hadPrior) return null;

  const sharesNow = rowNow?.shares || 0;
  const shareDelta = sharesNow - sharesPrior;
  let verdict;
  if (!hadPrior && sharesNow > 0) verdict = 'NEW POSITION';
  else if (hadPrior && sharesNow === 0) verdict = 'EXIT';
  else if (shareDelta > 0) verdict = 'NET BUY';
  else if (shareDelta < 0) verdict = 'NET SELL';
  else verdict = 'UNCHANGED';

  // Infinity for a brand-new position (no prior base to divide by) — the UI
  // renders that as "NEW" rather than a percentage, same convention used in
  // the main manager-vs-manager compare view.
  const pctChange = sharesPrior > 0 ? (shareDelta / sharesPrior) * 100 : sharesNow > 0 ? Infinity : 0;

  return {
    cik,
    name: manager.name || fallbackName,
    period: currentMeta.periodOfReport,
    filingDate: currentMeta.filingDate,
    accession: currentMeta.accessionNumber,
    sharesNow,
    sharesPrior,
    shareDelta,
    pctChange,
    valueUsdNow: rowNow?.valueUsd || 0,
    verdict,
  };
}

/**
 * "Who's buying/selling <CUSIP>?" — searches EDGAR full text for filings
 * that mention the CUSIP to discover candidate filers, and also
 * unconditionally checks a handful of mega-cap institutional managers on
 * every search regardless of what full-text search finds: EDGAR's search
 * ranks by text relevance, not position size, so for a widely-held security
 * it surfaces an essentially arbitrary sample of mostly small/mid-tier
 * filers rather than the largest holders. Checking the majors directly
 * ensures the biggest, most consequential moves aren't missed just because
 * search relevance scoring has nothing to do with how large a position is.
 *
 * The major-manager checks and the full-text search+checks run concurrently
 * (rather than waiting for full-text search to fully paginate before even
 * starting on the majors) so their SEC requests share the same throttled
 * queue from the start instead of being strictly staged one phase after
 * another — this alone removes several seconds of dead time on a typical
 * search without increasing the request rate to SEC at all.
 *
 * Best-effort: any single filer's fetch failing doesn't fail the whole call.
 */
export async function crossManagerActivity(cusip, limit = 15) {
  // Normalize to zero-padded form up front — MAJOR_MANAGER_CIKS is unpadded
  // while FTS candidates come pre-padded from ftsSearchCusip, and comparing
  // "1067983" to "0001067983" as raw strings would silently defeat dedup.
  const majorCiks = [...new Set(MAJOR_MANAGER_CIKS.map(padCik))];
  const ftsNeeded = Math.max(5, limit - majorCiks.length);

  const majorsPromise = Promise.allSettled(majorCiks.map((cik) => diffCandidate(cusip, cik, null)));

  const ftsPromise = ftsSearchCusip(cusip, ftsNeeded).then(async ({ candidates: ftsCandidates, totalMentions }) => {
    const seen = new Set(majorCiks);
    const extras = [];
    for (const c of ftsCandidates) {
      const cik = padCik(c.cik);
      if (seen.has(cik)) continue;
      seen.add(cik);
      extras.push({ cik, entityName: c.entityName });
    }
    const settled = await Promise.allSettled(extras.map((c) => diffCandidate(cusip, c.cik, c.entityName)));
    return { settled, totalMentions, extraCount: extras.length };
  });

  const [majorsSettled, ftsOutcome] = await Promise.all([majorsPromise, ftsPromise]);
  const checked = majorCiks.length + ftsOutcome.extraCount;

  const results = [...majorsSettled, ...ftsOutcome.settled]
    .filter((s) => s.status === 'fulfilled' && s.value)
    .map((s) => s.value)
    .sort((a, b) => b.shareDelta - a.shareDelta);

  return {
    cusip,
    totalMentions: ftsOutcome.totalMentions,
    checked,
    resolved: results.length,
    buyers: results.filter((r) => r.verdict === 'NET BUY' || r.verdict === 'NEW POSITION').length,
    sellers: results.filter((r) => r.verdict === 'NET SELL' || r.verdict === 'EXIT').length,
    results,
  };
}
