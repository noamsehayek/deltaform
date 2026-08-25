import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from '../config.js';
import { secFetch } from './secClient.js';
import { normalizeName } from './edgarFullIndex.js';

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const CUSIP_INDEX_FILE = path.join(DATA_DIR, 'cusip-index.json');
const TWELVE_HOURS = 12 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Layer 1: SEC company_tickers.json — ticker <-> CIK <-> name for operating
// companies. This is the highest-confidence layer whenever it has a match.
// ---------------------------------------------------------------------------

/** @type {{ byTicker: Map<string,{cik:string,title:string}>, byNormName: Map<string,{ticker:string,cik:string,title:string}[]> } | null} */
let companyTickersCache = null;
// In-flight load, cached separately from the resolved value so concurrent
// callers before the first load finishes await the SAME fetch+parse instead
// of each independently kicking off their own (see loadCusipIndex below for
// why check-then-await-then-assign is unsafe here).
let companyTickersLoading = null;

async function loadCompanyTickers() {
  if (companyTickersCache) return companyTickersCache;
  if (!companyTickersLoading) {
    companyTickersLoading = (async () => {
      const data = await secFetch('https://www.sec.gov/files/company_tickers.json', {
        as: 'json',
        ttlMs: TWELVE_HOURS,
      });
      const byTicker = new Map();
      const byNormName = new Map();
      for (const row of Object.values(data)) {
        const ticker = String(row.ticker).toUpperCase();
        const entry = { ticker, cik: String(row.cik_str), title: row.title };
        byTicker.set(ticker, entry);
        const key = normalizeName(row.title);
        if (!byNormName.has(key)) byNormName.set(key, []);
        byNormName.get(key).push(entry);
      }
      companyTickersCache = { byTicker, byNormName };
      return companyTickersCache;
    })();
  }
  return companyTickersLoading;
}

/** Look up SEC's canonical (CIK, title) for a ticker, independent of anything DeltaForm has parsed yet. */
export async function lookupCompanyTicker(ticker) {
  const { byTicker } = await loadCompanyTickers();
  return byTicker.get(ticker.toUpperCase()) || null;
}

// ---------------------------------------------------------------------------
// Layer 3/4: persisted CUSIP <-> issuer-name <-> ticker index. Grows every
// time DeltaForm parses a filing (learnCusip), and can be manually corrected
// (setManualTicker) — manual corrections always win.
// ---------------------------------------------------------------------------

/** @type {Record<string, { names: string[], ticker: string|null, manualTicker: string|null, lastSeen: string }> | null} */
let cusipIndex = null;
// In-flight load promise, tracked separately from `cusipIndex` itself.
//
// Without this, two concurrent callers hitting a cold cache (e.g. the ~20
// getFilingHoldings() calls crossManagerActivity fires concurrently for the
// major managers on the very first search after a server (re)start) would
// each see `cusipIndex` as null, each independently read+parse (or fall back
// to `{}` on ENOENT) the index file, and each assign their own fresh object
// to the shared `cusipIndex` variable. Since persistCusipIndex() always
// serializes whatever `cusipIndex` currently points to (not the caller's
// locally-captured reference), whichever load happened LAST wins the module
// variable — every CUSIP an earlier concurrent caller had already learned
// into its own now-orphaned object is silently dropped and never persisted.
// Caching the in-flight promise (mirrors getFilingHoldings' pattern) ensures
// every concurrent caller before the first load resolves shares the exact
// same object, so their mutations land on the one true `cusipIndex`.
let cusipIndexLoading = null;

async function loadCusipIndex() {
  if (cusipIndex) return cusipIndex;
  if (!cusipIndexLoading) {
    cusipIndexLoading = (async () => {
      try {
        cusipIndex = JSON.parse(await fsp.readFile(CUSIP_INDEX_FILE, 'utf-8'));
      } catch {
        cusipIndex = {};
      }
      return cusipIndex;
    })();
  }
  return cusipIndexLoading;
}

// Serialize writes and write atomically (temp file + rename) so concurrent
// callers can never race each other into a torn/corrupted file, and a
// process restart mid-write can't leave a 0-byte index behind.
let writeQueue = Promise.resolve();
function persistCusipIndex() {
  writeQueue = writeQueue
    .catch(() => {})
    .then(async () => {
      await fsp.mkdir(path.dirname(CUSIP_INDEX_FILE), { recursive: true });
      const tmpFile = `${CUSIP_INDEX_FILE}.${process.pid}.tmp`;
      await fsp.writeFile(tmpFile, JSON.stringify(cusipIndex));
      await fsp.rename(tmpFile, CUSIP_INDEX_FILE);
    });
  return writeQueue;
}

function updateEntryInMemory(idx, cusip, issuerName, matcher) {
  const entry = idx[cusip] || { names: [], ticker: null, manualTicker: null, lastSeen: null };
  if (issuerName && !entry.names.includes(issuerName)) entry.names.push(issuerName);
  entry.lastSeen = new Date().toISOString();
  if (!entry.manualTicker && !entry.ticker && issuerName) {
    const match = matcher(issuerName);
    if (match && match.length === 1) entry.ticker = match[0].ticker;
  }
  idx[cusip] = entry;
  return entry;
}

/**
 * Record an (issuer name, CUSIP) pair observed in a parsed filing, and try
 * to cross-reference it to a ticker via company_tickers.json by normalized
 * name. Grows the persisted index with use, as the spec requires.
 *
 * Prefer learnCusips() below when recording many rows at once (e.g. every
 * holding in one filing) — it does a single disk write instead of one per
 * row, which matters once the index has thousands of entries.
 */
export async function learnCusip(cusip, issuerName) {
  if (!cusip) return;
  const idx = await loadCusipIndex();
  const { byNormName } = await loadCompanyTickers();
  const entry = updateEntryInMemory(idx, cusip, issuerName, (name) => byNormName.get(normalizeName(name)));
  await persistCusipIndex();
  return entry;
}

/** Batched version of learnCusip: updates every (cusip, name) pair in memory, then writes once. */
export async function learnCusips(pairs) {
  const meaningful = pairs.filter((p) => p.cusip);
  if (meaningful.length === 0) return;
  const idx = await loadCusipIndex();
  const { byNormName } = await loadCompanyTickers();
  for (const { cusip, issuerName } of meaningful) {
    updateEntryInMemory(idx, cusip, issuerName, (name) => byNormName.get(normalizeName(name)));
  }
  await persistCusipIndex();
}

/** Manual confirm/correct of a CUSIP -> ticker mapping. Always wins over auto-matches. */
export async function setManualTicker(cusip, ticker) {
  const idx = await loadCusipIndex();
  const entry = idx[cusip] || { names: [], ticker: null, manualTicker: null, lastSeen: null };
  entry.manualTicker = ticker ? ticker.toUpperCase() : null;
  idx[cusip] = entry;
  await persistCusipIndex();
  return entry;
}

export async function getCusipEntry(cusip) {
  const idx = await loadCusipIndex();
  return idx[cusip] || null;
}

/** Resolve a CUSIP to the best-known ticker/name info, degrading gracefully. */
export async function resolveCusipToTicker(cusip) {
  const entry = await getCusipEntry(cusip);
  if (!entry) return { cusip, ticker: null, name: null, confidence: 'none' };
  const ticker = entry.manualTicker || entry.ticker || null;
  return {
    cusip,
    ticker,
    name: entry.names[entry.names.length - 1] || null,
    allKnownNames: entry.names,
    confidence: entry.manualTicker ? 'manual' : entry.ticker ? 'auto' : 'unresolved',
  };
}

// ---------------------------------------------------------------------------
// Layer 2: EDGAR full-text search, best-effort fallback for CUSIPs that
// haven't been cross-referenced yet — looks for recent 13F filings whose
// text mentions the CUSIP so the user at least sees candidate issuer names.
// ---------------------------------------------------------------------------

export async function searchFullTextForCusip(cusip) {
  try {
    const url = `https://efts.sec.gov/LATEST/search-index?q=%22${encodeURIComponent(
      cusip
    )}%22&forms=13F-HR`;
    const data = await secFetch(url, { as: 'json', ttlMs: TWELVE_HOURS });
    const hits = data?.hits?.hits || [];
    return hits.slice(0, 5).map((h) => ({
      issuerNameGuess: h?._source?.display_names?.[0] || null,
      accession: h?._id,
    }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Ticker/name -> CUSIP (the reverse, user-facing direction).
// ---------------------------------------------------------------------------

/**
 * Resolve a user-typed ticker OR issuer name to candidate CUSIPs, using the
 * persisted index built from real filings. Never returns silently empty —
 * always returns fuzzy candidates for the user to pick from when there's no
 * exact match.
 */
export async function resolveTickerOrNameToCusips(query) {
  const q = query.trim();
  if (!q) return { exact: [], fuzzy: [] };

  const idx = await loadCusipIndex();
  const upper = q.toUpperCase();

  const exact = [];
  for (const [cusip, entry] of Object.entries(idx)) {
    const ticker = entry.manualTicker || entry.ticker;
    if (ticker === upper) {
      exact.push({ cusip, ticker, name: entry.names[entry.names.length - 1] || null });
    }
  }

  if (exact.length === 0) {
    // Ticker not yet cross-referenced locally — check company_tickers.json
    // for the canonical issuer name, then fuzzy-match that name against
    // everything we've actually seen in parsed filings.
    const { byTicker } = await loadCompanyTickers();
    const known = byTicker.get(upper);
    if (known) {
      const target = normalizeName(known.title);
      for (const [cusip, entry] of Object.entries(idx)) {
        if (entry.names.some((n) => normalizeName(n) === target)) {
          exact.push({ cusip, ticker: upper, name: entry.names[entry.names.length - 1] });
        }
      }
    }
  }

  const fuzzy = [];
  const qNorm = normalizeName(q);
  if (qNorm) {
    for (const [cusip, entry] of Object.entries(idx)) {
      for (const name of entry.names) {
        const n = normalizeName(name);
        if (n.includes(qNorm) || qNorm.includes(n)) {
          fuzzy.push({ cusip, ticker: entry.manualTicker || entry.ticker || null, name });
          break;
        }
      }
    }
  }

  return { exact, fuzzy: fuzzy.slice(0, 20) };
}

export async function getCusipIndexStats() {
  const idx = await loadCusipIndex();
  const total = Object.keys(idx).length;
  const withTicker = Object.values(idx).filter((e) => e.manualTicker || e.ticker).length;
  return { total, withTicker };
}
