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

/** Filter a filer's full filing list down to 13F-HR (and amendments), most recent quarter first. */
export function get13FFilings(filings) {
  return filings
    .filter((f) => f.form === '13F-HR' || f.form === '13F-HR/A')
    .sort((a, b) => (a.periodOfReport > b.periodOfReport ? -1 : a.periodOfReport < b.periodOfReport ? 1 : 0));
}
