import { getSubmissions, get13FFilings, padCik } from './submissions.js';
import { getInfoTableForFiling } from './filingDocs.js';
import { learnCusips } from './cusipResolver.js';
import { MAJOR_MANAGER_CIKS } from './majorManagers.js';

const majorCikSet = new Set(MAJOR_MANAGER_CIKS.map(padCik));

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
// Split into two tiers rather than one bounded cache:
//
//  - `pinnedCache` for the ~10 major managers, never evicted. This set is
//    small and exactly known in advance (measured ~2-17MB per filing, so
//    ~20 entries worst case for current+prior quarters — tens of MB, not a
//    real memory risk), and it's the highest-value data to keep warm since
//    every single ticker search re-checks these same managers. A single
//    generic bounded cache doesn't protect this: one ticker search alone
//    can touch up to `limit * 2` distinct filings (current + prior for each
//    candidate), so a shared cache sized for "one search's worth" evicts
//    the majors mid-search, defeating the entire point of caching them.
//  - `lruCache` for everything else (candidates discovered via full-text
//    search), bounded with oldest-first eviction so unbounded ticker-search
//    variety over a long process lifetime can't grow without limit.
const pinnedCache = new Map();
const lruCache = new Map();
const MAX_LRU_ENTRIES = 80;

/** Fetch + parse one filing's holdings, and feed every (cusip, name) pair into the learning index. */
export function getFilingHoldings(cikRaw, accessionNumber) {
  const cik = padCik(cikRaw);
  const key = `${cik}:${accessionNumber}`;
  const cache = majorCikSet.has(cik) ? pinnedCache : lruCache;

  if (cache.has(key)) {
    if (cache === lruCache) {
      // Refresh recency: delete + re-set moves this key to the end (newest)
      // in Map's insertion-order iteration, so eviction below stays LRU
      // rather than strictly FIFO.
      const cached = cache.get(key);
      cache.delete(key);
      cache.set(key, cached);
    }
    return cache.get(key);
  }

  const promise = (async () => {
    const result = await getInfoTableForFiling(cik, accessionNumber);
    // Only common-stock rows feed the ticker index. A bond or option can
    // share a CUSIP-adjacent identity with a company's common stock but is a
    // fundamentally different security with its own holder base — learning a
    // ticker from a note or option row lets that CUSIP masquerade as the
    // stock in ticker search (e.g. APLD's 2.75% conv notes CUSIP inheriting
    // the "APLD" ticker and showing up as a bogus candidate alongside the
    // real common-stock CUSIP).
    await learnCusips(result.rows.common.map((r) => ({ cusip: r.cusip, issuerName: r.nameOfIssuer })));
    return result;
  })();

  // Don't let a transient failure permanently poison the cache for this key.
  promise.catch(() => cache.delete(key));
  cache.set(key, promise);

  if (cache === lruCache) {
    while (lruCache.size > MAX_LRU_ENTRIES) {
      lruCache.delete(lruCache.keys().next().value);
    }
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
