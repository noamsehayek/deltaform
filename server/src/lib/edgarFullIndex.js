import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from '../config.js';
import { secFetch, SecFetchError } from './secClient.js';

const INDEX_FILE = path.join(DATA_DIR, 'filer-index.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

/** @type {{ ingestedQuarters: string[], filers: Record<string, string> } | null} */
let memIndex = null;

function emptyIndex() {
  return { ingestedQuarters: [], filers: {} }; // filers: cik(no padding, string) -> latest known name
}

async function load() {
  if (memIndex) return memIndex;
  try {
    memIndex = JSON.parse(await fsp.readFile(INDEX_FILE, 'utf-8'));
  } catch {
    memIndex = emptyIndex();
  }
  return memIndex;
}

async function persist() {
  await fsp.mkdir(path.dirname(INDEX_FILE), { recursive: true });
  await fsp.writeFile(INDEX_FILE, JSON.stringify(memIndex));
}

/** Parse a quarterly master.idx into { cik, name, formType }[] filtered to 13F forms. */
function parseMasterIdx(text) {
  const out = [];
  for (const line of text.split('\n')) {
    if (!/^\d+\|/.test(line)) continue; // skip header/banner lines
    const parts = line.split('|');
    if (parts.length < 5) continue;
    const [cik, name, formType] = parts;
    if (!formType || !formType.startsWith('13F-HR')) continue;
    out.push({ cik: cik.trim(), name: name.trim(), formType: formType.trim() });
  }
  return out;
}

function quarterLabel(year, qtr) {
  return `${year}-QTR${qtr}`;
}

/** Ingest one quarter's master.idx, merging 13F filers into the persisted index. */
export async function ingestQuarter(year, qtr) {
  const label = quarterLabel(year, qtr);
  const idx = await load();
  if (idx.ingestedQuarters.includes(label)) return { label, added: 0, skipped: true };

  const url = `https://www.sec.gov/Archives/edgar/full-index/${year}/QTR${qtr}/master.idx`;
  let text;
  try {
    text = await secFetch(url, { as: 'text', ttlMs: Infinity });
  } catch (err) {
    if (err instanceof SecFetchError && err.status === 404) {
      // Future/empty quarter — mark done so we don't retry every boot.
      idx.ingestedQuarters.push(label);
      await persist();
      return { label, added: 0, notFound: true };
    }
    throw err;
  }

  const rows = parseMasterIdx(text);
  let added = 0;
  for (const row of rows) {
    if (!idx.filers[row.cik]) added++;
    idx.filers[row.cik] = row.name; // last-seen name wins (handles renames)
  }
  idx.ingestedQuarters.push(label);
  await persist();
  return { label, added, total: rows.length };
}

function lastNQuarters(n) {
  const now = new Date();
  let year = now.getUTCFullYear();
  let qtr = Math.floor(now.getUTCMonth() / 3) + 1;
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push([year, qtr]);
    qtr -= 1;
    if (qtr === 0) {
      qtr = 4;
      year -= 1;
    }
  }
  return out;
}

let backgroundIngestPromise = null;
let backgroundIngestStatus = { running: false, done: 0, total: 0, lastError: null };

/**
 * Kick off (idempotent) background ingestion of the last N quarters.
 * Non-blocking.
 *
 * Each quarter's master.idx fetch shares the same globally-throttled SEC
 * request queue as live, user-facing requests (secClient.js serializes all
 * outbound SEC calls to respect SEC's rate limit). Without a deliberate gap
 * between quarters, this background maintenance work floods that queue back
 * to back on startup, and a real search landing mid-burst can end up queued
 * behind the whole batch — long enough on constrained hosting to trip a
 * platform's reverse-proxy timeout (a 502) even though nothing crashed. The
 * delay below is a cheap way to keep the queue fair without building a real
 * priority scheduler.
 */
export function triggerBackgroundIngest(n = 12) {
  if (backgroundIngestPromise) return backgroundIngestStatus;
  const quarters = lastNQuarters(n);
  backgroundIngestStatus = { running: true, done: 0, total: quarters.length, lastError: null };
  backgroundIngestPromise = (async () => {
    for (const [year, qtr] of quarters) {
      try {
        await ingestQuarter(year, qtr);
      } catch (err) {
        backgroundIngestStatus.lastError = `${year}Q${qtr}: ${err.message}`;
      }
      backgroundIngestStatus.done++;
      await new Promise((r) => setTimeout(r, 3000));
    }
    backgroundIngestStatus.running = false;
  })();
  return backgroundIngestStatus;
}

export function getIngestStatus() {
  return backgroundIngestStatus;
}

export function normalizeName(s) {
  return s
    .toLowerCase()
    // company_tickers.json titles often carry a trailing state-of-incorporation
    // suffix (e.g. "DEVON ENERGY CORP/DE", "ALLEGHANY CORP /DE") that a 13F
    // info table's nameOfIssuer never includes — strip it before it turns
    // into a stray token below (the '/' -> ' ' rule would otherwise leave a
    // bare "de" that breaks the match).
    .replace(/\s*\/\s*[a-z]{2}$/, '')
    .replace(/[.,&/\\]/g, ' ')
    .replace(/\b(llc|lp|l p|inc|incorporated|corp|corporation|co|company|companies|ltd|limited|na|plc|holdings|holding|group|trust)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    // EDGAR issuer names sometimes carry a trailing "NEW" or "DEL" marker for
    // a corporate re-registration (e.g. "CHEVRON CORPORATION NEW", "DEVON
    // ENERGY CORP NEW") that a canonical company_tickers.json title never
    // has. Only strip it as a TRAILING token so real names like "NEW YORK
    // TIMES CO" (where "new" leads, not trails) are unaffected.
    .replace(/\s+(new|del)$/, '');
}

/** Cheap fuzzy score: normalized substring hit + token overlap. Higher is better. */
function score(query, candidate) {
  const q = normalizeName(query);
  const c = normalizeName(candidate);
  if (!q || !c) return 0;
  if (c === q) return 100;
  if (c.startsWith(q)) return 90;
  if (c.includes(q)) return 70;
  const qTokens = new Set(q.split(' ').filter(Boolean));
  const cTokens = new Set(c.split(' ').filter(Boolean));
  let overlap = 0;
  for (const t of qTokens) if (cTokens.has(t)) overlap++;
  if (overlap === 0) return 0;
  return 40 * (overlap / Math.max(qTokens.size, 1));
}

/** Fuzzy search the persisted 13F-filer universe by name. */
export async function fuzzySearchFilers(query, limit = 10) {
  const idx = await load();
  const scored = [];
  for (const [cik, name] of Object.entries(idx.filers)) {
    const s = score(query, name);
    if (s > 0) scored.push({ cik, name, score: s });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

export async function getFilerIndexStats() {
  const idx = await load();
  return { filerCount: Object.keys(idx.filers).length, ingestedQuarters: idx.ingestedQuarters.length };
}
