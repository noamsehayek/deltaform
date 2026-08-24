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

// A published filing never changes, so its parsed-and-merged holdings never
// need to be recomputed once fetched — cache by (cik, accession) for reuse.
// This matters a lot for large filers: cross-manager ticker search
// unconditionally re-checks the same ~10 mega-cap managers on every search,
// and without this, each one's often-multi-thousand-row XML gets
// downloaded-and-reparsed from scratch every single time, even though the
// underlying secClient disk cache already skips the network refetch.
// Caches the in-flight promise (not just the resolved value) so concurrent
// callers requesting the same filing coalesce into one parse instead of
// racing to do the same work twice.
//
// Bounded to MAX_CACHE_ENTRIES with simple oldest-first eviction (a Map
// preserves insertion order, so the first key is always the oldest) — an
// unbounded version of this cache holding every filing ever fetched for the
// life of the process is a real memory-growth risk: a single large filer's
// parsed holdings can be substantial (Goldman Sachs' info table alone is
// ~14,000 rows), and a ticker search checking 50-100 managers accumulates
// many of those. On a memory-constrained host, that growth is exactly the
// kind of thing that gets a process OOM-killed after enough searches.
const holdingsCache = new Map();
const MAX_CACHE_ENTRIES = 40;

/** Fetch + parse one filing's holdings, and feed every (cusip, name) pair into the learning index. */
export function getFilingHoldings(cik, accessionNumber) {
  const key = `${cik}:${accessionNumber}`;
  if (holdingsCache.has(key)) {
    // Refresh recency: delete + re-set moves this key to the end (newest)
    // in Map's insertion-order iteration, so eviction below stays LRU rather
    // than strictly FIFO.
    const cached = holdingsCache.get(key);
    holdingsCache.delete(key);
    holdingsCache.set(key, cached);
    return cached;
  }

  const promise = (async () => {
    const result = await getInfoTableForFiling(cik, accessionNumber);
    const allRows = [...result.rows.common, ...result.rows.options, ...result.rows.bonds];
    await learnCusips(allRows.map((r) => ({ cusip: r.cusip, issuerName: r.nameOfIssuer })));
    return result;
  })();

  // Don't let a transient failure permanently poison the cache for this key.
  promise.catch(() => holdingsCache.delete(key));
  holdingsCache.set(key, promise);

  while (holdingsCache.size > MAX_CACHE_ENTRIES) {
    holdingsCache.delete(holdingsCache.keys().next().value);
  }

  return promise;
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
