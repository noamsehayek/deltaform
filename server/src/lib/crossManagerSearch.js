import { secFetch } from './secClient.js';
import { padCik } from './submissions.js';
import { listFilings, getFilingHoldings } from './holdingsService.js';

function reAccession(id) {
  if (/^\d{10}-\d{2}-\d{6}$/.test(id)) return id;
  const digits = id.replace(/\D/g, '');
  if (digits.length !== 18) return null;
  return `${digits.slice(0, 10)}-${digits.slice(10, 12)}-${digits.slice(12)}`;
}

/** Best-effort EDGAR full-text search for filings whose text mentions a raw CUSIP string. */
async function ftsSearchCusip(cusip, limit) {
  const url = `https://efts.sec.gov/LATEST/search-index?q=%22${encodeURIComponent(
    cusip
  )}%22&forms=13F-HR`;
  const data = await secFetch(url, { as: 'json', ttlMs: 60 * 60 * 1000 });
  const hits = data?.hits?.hits || [];

  const seen = new Set();
  const candidates = [];
  for (const hit of hits) {
    const cik = padCik((hit._source?.ciks || [])[0] || '');
    const adsh = hit._source?.adsh || reAccession((hit._id || '').split(':')[0]);
    if (!cik || !adsh || seen.has(cik)) continue;
    seen.add(cik);
    candidates.push({ cik, accession: adsh, entityName: (hit._source?.display_names || [])[0] || null });
    if (candidates.length >= limit) break;
  }
  return candidates;
}

/**
 * "Who's buying/selling <CUSIP>?" — searches EDGAR full text for filings
 * that mention the CUSIP, then for each filer, diffs the mentioning filing
 * against that filer's prior 13F-HR to get a NET BUY/SELL verdict.
 * Best-effort: any single filer's fetch failing doesn't fail the whole call.
 */
export async function crossManagerActivity(cusip, limit = 15) {
  const candidates = await ftsSearchCusip(cusip, limit);

  const settled = await Promise.allSettled(
    candidates.map(async (c) => {
      const holdingsNow = await getFilingHoldings(c.cik, c.accession);
      const rowNow =
        holdingsNow.rows.common.find((r) => r.cusip === cusip) ||
        holdingsNow.rows.bonds.find((r) => r.cusip === cusip);
      if (!rowNow) return null;

      const { manager, filings } = await listFilings(c.cik);
      const idx = filings.findIndex((f) => f.accessionNumber === c.accession);
      const currentMeta = idx === -1 ? filings[0] : filings[idx];
      const priorMeta = idx === -1 ? filings[1] : filings[idx + 1];

      let sharesPrior = 0;
      if (priorMeta) {
        const holdingsPrior = await getFilingHoldings(c.cik, priorMeta.accessionNumber);
        const rowPrior = holdingsPrior.rows.common.find((r) => r.cusip === cusip);
        sharesPrior = rowPrior?.shares || 0;
      }

      const shareDelta = rowNow.shares - sharesPrior;
      let verdict;
      if (sharesPrior === 0 && rowNow.shares > 0) verdict = 'NEW POSITION';
      else if (shareDelta > 0) verdict = 'NET BUY';
      else if (shareDelta < 0) verdict = 'NET SELL';
      else verdict = 'UNCHANGED';

      return {
        cik: c.cik,
        name: manager.name || c.entityName,
        period: currentMeta.periodOfReport,
        filingDate: currentMeta.filingDate,
        accession: c.accession,
        sharesNow: rowNow.shares,
        sharesPrior,
        shareDelta,
        valueUsdNow: rowNow.valueUsd,
        verdict,
      };
    })
  );

  const results = settled
    .filter((s) => s.status === 'fulfilled' && s.value)
    .map((s) => s.value)
    .sort((a, b) => b.shareDelta - a.shareDelta);

  return {
    cusip,
    checked: candidates.length,
    resolved: results.length,
    buyers: results.filter((r) => r.verdict === 'NET BUY' || r.verdict === 'NEW POSITION').length,
    sellers: results.filter((r) => r.verdict === 'NET SELL').length,
    results,
  };
}
