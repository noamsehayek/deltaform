import { secFetch } from './secClient.js';
import { parseInfoTableXml, parseInfoTableHtml, mergeByCusip } from './thirteenFParser.js';

function accessionNoDashes(accessionNumber) {
  return accessionNumber.replace(/-/g, '');
}

function archiveBase(cik, accessionNumber) {
  const cikNoLeading = String(Number(cik));
  return `https://www.sec.gov/Archives/edgar/data/${cikNoLeading}/${accessionNoDashes(accessionNumber)}`;
}

async function getFilingIndex(cik, accessionNumber) {
  const url = `${archiveBase(cik, accessionNumber)}/index.json`;
  return secFetch(url, { as: 'json', ttlMs: Infinity });
}

/** Rank candidate documents by how likely they are to be the infoTable (not the 13F cover page). */
function rankXmlCandidates(items) {
  return items
    .filter((i) => i.name.toLowerCase().endsWith('.xml'))
    .map((i) => {
      const n = i.name.toLowerCase();
      let s = 10;
      if (n.includes('infotable') || n.includes('info_table')) s = 100;
      else if (n.startsWith('form13f') && n.includes('table')) s = 90;
      else if (n === 'primary_doc.xml') s = 5; // usually the cover page, last resort
      return { ...i, score: s };
    })
    .sort((a, b) => b.score - a.score);
}

function rankHtmlCandidates(items) {
  return items
    .filter((i) => i.name.toLowerCase().endsWith('.htm') || i.name.toLowerCase().endsWith('.html'))
    .map((i) => {
      const n = i.name.toLowerCase();
      let s = 5;
      if (n.includes('infotable') || n.includes('info_table')) s = 100;
      return { ...i, score: s };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * Locate and parse the information table for one 13F-HR filing.
 * Reads the filing's own index.json to find real filenames (never guesses),
 * prefers raw XML, falls back to xsl-rendered HTML.
 */
export async function getInfoTableForFiling(cik, accessionNumber) {
  const index = await getFilingIndex(cik, accessionNumber);
  const items = index?.directory?.item || [];
  const base = archiveBase(cik, accessionNumber);

  const xmlCandidates = rankXmlCandidates(items);
  for (const candidate of xmlCandidates) {
    try {
      const xml = await secFetch(`${base}/${candidate.name}`, { as: 'text', ttlMs: Infinity });
      const rows = parseInfoTableXml(xml);
      if (rows.length > 0) {
        return { rows: mergeByCusip(rows), rawRowCount: rows.length, sourceFile: candidate.name, format: 'xml' };
      }
    } catch {
      // try next candidate
    }
  }

  const htmlCandidates = rankHtmlCandidates(items);
  for (const candidate of htmlCandidates) {
    try {
      const html = await secFetch(`${base}/${candidate.name}`, { as: 'text', ttlMs: Infinity });
      const rows = parseInfoTableHtml(html);
      if (rows.length > 0) {
        return { rows: mergeByCusip(rows), rawRowCount: rows.length, sourceFile: candidate.name, format: 'html' };
      }
    } catch {
      // try next candidate
    }
  }

  throw Object.assign(
    new Error(
      `unexpected info-table format for filing ${accessionNumber} (CIK ${cik}) — checked ${
        xmlCandidates.length + htmlCandidates.length
      } candidate document(s) in index.json. This is common for pre-2013 filings, which predate SEC's XML mandate for 13F info tables.`
    ),
    { status: 422 }
  );
}
