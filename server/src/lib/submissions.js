import { secFetch, SecFetchError } from './secClient.js';

export function padCik(cik) {
  return String(cik).replace(/\D/g, '').padStart(10, '0');
}

const SIX_HOURS = 6 * 60 * 60 * 1000;

/**
 * Fetch a filer's EDGAR submissions record. Handles the >1000-filings case
 * where `filings.recent` is supplemented by `filings.files[]` pointers to
 * additional JSON chunks (SEC's "more filings" pagination for prolific filers).
 */
export async function getSubmissions(cikRaw) {
  const cik10 = padCik(cikRaw);
  const url = `https://data.sec.gov/submissions/CIK${cik10}.json`;
  let data;
  try {
    data = await secFetch(url, { as: 'json', ttlMs: SIX_HOURS });
  } catch (err) {
    if (err instanceof SecFetchError && err.status === 404) {
      throw new SecFetchError(`No EDGAR filer found for CIK ${cik10}`, 404);
    }
    throw err;
  }

  const recent = zipFilings(data.filings?.recent);
  let all = recent;

  for (const file of data.filings?.files || []) {
    const chunkUrl = `https://data.sec.gov/submissions/${file.name}`;
    const chunk = await secFetch(chunkUrl, { as: 'json', ttlMs: Infinity });
    all = all.concat(zipFilings(chunk));
  }

  return {
    cik: String(Number(cik10)),
    cik10,
    name: data.name,
    tickers: data.tickers || [],
    filings: all,
  };
}

/** Zip EDGAR's parallel-array filings structure into row objects. Never sort arrays independently. */
function zipFilings(recent) {
  if (!recent) return [];
  const keys = Object.keys(recent);
  const length = recent[keys[0]]?.length || 0;
  const rows = [];
  for (let i = 0; i < length; i++) {
    const row = {};
    for (const k of keys) row[k] = recent[k][i];
    row.periodOfReport = row.reportDate; // alias — submissions API calls it reportDate
    rows.push(row);
  }
  return rows;
}

/**
 * Filter a filer's full filing list down to 13F-HR (and amendments), one
 * filing per reporting period, most recent quarter first.
 *
 * A period can have multiple filings: an original 13F-HR plus one or more
 * 13F-HR/A amendments that supersede it (often filed within days, sometimes
 * correcting real data-entry mistakes in the original). Callers diff
 * "current" against "prior" by simple list position, so if both an
 * amendment and its original stayed in the list, "prior" could silently
 * mean "this same quarter's un-amended original" instead of last quarter —
 * comparing a filer's own revision against itself rather than a real
 * quarter-over-quarter change. Collapsing to the latest filing per period
 * first ensures every entry is a distinct quarter.
 */
export function get13FFilings(filings) {
  const byPeriod = new Map();
  for (const f of filings) {
    if (f.form !== '13F-HR' && f.form !== '13F-HR/A') continue;
    const existing = byPeriod.get(f.periodOfReport);
    if (!existing || f.filingDate > existing.filingDate || (f.filingDate === existing.filingDate && f.accessionNumber > existing.accessionNumber)) {
      byPeriod.set(f.periodOfReport, f);
    }
  }
  return [...byPeriod.values()].sort((a, b) =>
    a.periodOfReport > b.periodOfReport ? -1 : a.periodOfReport < b.periodOfReport ? 1 : 0
  );
}

/**
 * A large manager can restructure which legal entity files its 13F —
 * afterward the old CIK files 13F-NT ("holdings reported elsewhere") every
 * quarter instead of 13F-HR. get13FFilings() only sees HR filings, so it
 * silently keeps returning that CIK's last real 13F-HR as "current" quarter
 * after quarter, with nothing to signal it's actually stale (e.g. Vanguard
 * Group Inc's CIK switched to notices starting Q1 2026 — its holdings are
 * now reported by ~10 sibling Vanguard entities instead).
 *
 * Returns the notice period if this filer's true most recent 13F filing
 * (any form) is a notice newer than the 13F-HR data being used, else null.
 */
export function staleNoticeInfo(filings, latestHrPeriod) {
  if (!latestHrPeriod) return null; // nothing to compare staleness against
  const latest = [...filings]
    .filter((f) => f.form.startsWith('13F'))
    .sort((a, b) => (a.periodOfReport > b.periodOfReport ? -1 : a.periodOfReport < b.periodOfReport ? 1 : 0))[0];
  if (!latest || !latest.form.includes('NT') || latest.periodOfReport <= latestHrPeriod) return null;
  return { noticePeriod: latest.periodOfReport, asOfPeriod: latestHrPeriod };
}
