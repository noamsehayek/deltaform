import { getSubmissions, get13FFilings } from './submissions.js';
import { getInfoTableForFiling } from './filingDocs.js';
import { learnCusips } from './cusipResolver.js';

/** List a manager's 13F-HR filings, most recent first. */
export async function listFilings(cik) {
  const sub = await getSubmissions(cik);
  const filings = get13FFilings(sub.filings);
  if (filings.length === 0) {
    throw Object.assign(new Error(`No 13F-HR filings for filer ${sub.name} (CIK ${sub.cik10}).`), {
      status: 404,
    });
  }
  return { manager: { cik: sub.cik10, name: sub.name }, filings };
}

/** Fetch + parse one filing's holdings, and feed every (cusip, name) pair into the learning index. */
export async function getFilingHoldings(cik, accessionNumber) {
  const result = await getInfoTableForFiling(cik, accessionNumber);
  const allRows = [...result.rows.common, ...result.rows.options, ...result.rows.bonds];
  await learnCusips(allRows.map((r) => ({ cusip: r.cusip, issuerName: r.nameOfIssuer })));
  return result;
}

/** Resolve a filing record (from listFilings) by accession number. */
export function findFiling(filings, accessionNumber) {
  const f = filings.find((f) => f.accessionNumber === accessionNumber);
  if (!f) {
    throw Object.assign(new Error(`Accession ${accessionNumber} is not a 13F-HR filing for this filer.`), {
      status: 404,
    });
  }
  return f;
}
