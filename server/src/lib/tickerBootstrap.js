import { secFetch } from './secClient.js';
import { padCik } from './submissions.js';
import { getFilingHoldings } from './holdingsService.js';
import { lookupCompanyTicker } from './cusipResolver.js';

const ONE_HOUR = 60 * 60 * 1000;

/**
 * Best-effort bootstrap for a ticker DeltaForm has never encountered in any
 * filing it has parsed. Looks the ticker up in SEC's full company list to
 * get its canonical name, finds one real 13F-HR filing that mentions that
 * name via EDGAR full-text search, and parses it — which feeds every
 * (CUSIP, issuer name) pair on that filing into the persisted CUSIP index
 * (see learnCusip), auto-resolving the ticker in the process if the name
 * matches cleanly. Returns true if a filing was found and parsed, whether
 * or not the ticker ends up auto-resolved (the caller re-checks after).
 */
export async function bootstrapTicker(ticker) {
  const known = await lookupCompanyTicker(ticker);
  if (!known) return false;

  // company_tickers.json titles often carry a state-of-incorporation suffix
  // (e.g. "DEVON ENERGY CORP/DE") that a 13F info table's nameOfIssuer won't
  // include — strip it before searching filing text.
  const searchTitle = known.title.replace(/\s*\/[A-Z]{2}$/, '').trim();
  const targetCik = padCik(known.cik);

  const url = `https://efts.sec.gov/LATEST/search-index?q=%22${encodeURIComponent(
    searchTitle
  )}%22&forms=13F-HR`;
  let hits;
  try {
    const data = await secFetch(url, { as: 'json', ttlMs: ONE_HOUR });
    hits = data?.hits?.hits || [];
  } catch {
    return false;
  }

  // A plain name match can hit the company's OWN 13F-HR cover page (some
  // operating companies file 13F-HR themselves as an institutional investor)
  // rather than a mention of it as a HELD security in someone else's info
  // table. Restrict to actual information-table documents from other filers.
  const hit = hits.find(
    (h) => h._source?.file_type === 'INFORMATION TABLE' && padCik((h._source?.ciks || [])[0] || '') !== targetCik
  );
  if (!hit) return false;

  const cik = padCik((hit._source?.ciks || [])[0] || '');
  const adsh = hit._source?.adsh;
  if (!cik || !adsh) return false;

  try {
    await getFilingHoldings(cik, adsh); // seeds the CUSIP index as a side effect
    return true;
  } catch {
    return false;
  }
}
