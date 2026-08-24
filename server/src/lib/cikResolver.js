import { XMLParser } from 'fast-xml-parser';
import { secFetch, SecFetchError } from './secClient.js';
import { fuzzySearchFilers } from './edgarFullIndex.js';
import { getSubmissions, padCik } from './submissions.js';

const xmlParser = new XMLParser({ ignoreAttributes: false });

/**
 * Best-effort live company-name search against EDGAR's browse-edgar atom
 * feed. This supplements the persisted filer index with fresh results, but
 * we never depend on it exclusively — if SEC changes the feed shape this
 * degrades to an empty array instead of throwing.
 */
async function liveCompanySearch(name) {
  const url = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=${encodeURIComponent(
    name
  )}&type=13F-HR&dateb=&owner=include&count=40&output=atom`;
  try {
    const xml = await secFetch(url, { as: 'text', ttlMs: 60 * 60 * 1000 });
    const parsed = xmlParser.parse(xml);
    const entries = [].concat(parsed?.feed?.entry || []);
    const out = [];
    for (const entry of entries) {
      const info = entry?.['content']?.['company-info'] || entry?.['company-info'];
      const cik = info?.cik ?? entry?.cik;
      const title = info?.['conformed-name'] ?? entry?.title;
      if (cik && title) {
        out.push({ cik: padCik(cik), name: String(title).trim(), score: 85, source: 'live' });
      }
    }
    return out;
  } catch {
    return []; // Live search is a bonus signal, never a hard dependency.
  }
}

/**
 * Resolve a user-typed manager query (name OR raw CIK) to one or more
 * candidate filers. Raw CIK is always accepted as a fallback so nothing is
 * unreachable even before the local index has caught up.
 */
export async function resolveManager(query) {
  const q = query.trim();
  if (!q) return { type: 'none', candidates: [] };

  if (/^\d{1,10}$/.test(q)) {
    const cik10 = padCik(q);
    try {
      const sub = await getSubmissions(cik10);
      return {
        type: 'cik',
        candidates: [{ cik: sub.cik10, name: sub.name, score: 100, source: 'cik-lookup' }],
      };
    } catch (err) {
      if (err instanceof SecFetchError && err.status === 404) {
        return { type: 'cik', candidates: [], error: `No EDGAR filer found for CIK ${cik10}.` };
      }
      throw err;
    }
  }

  // The local filer index (built from SEC's own quarterly full-index files)
  // covers 10,000+ filers and is instant — no network call. The live
  // browse-edgar lookup is a much slower, older HTML-based endpoint
  // (several seconds), so it's only worth paying for when the local index
  // didn't already find a strong match: a filer freshly registered since
  // the last ingest, or a name the local fuzzy scorer handles poorly.
  const local = await fuzzySearchFilers(q, 15);
  if (local.length > 0 && local[0].score >= 90) {
    return { type: 'name', candidates: local };
  }

  const live = await liveCompanySearch(q);
  const byCik = new Map();
  for (const c of [...live, ...local]) {
    const existing = byCik.get(c.cik);
    if (!existing || c.score > existing.score) byCik.set(c.cik, c);
  }

  const candidates = [...byCik.values()].sort((a, b) => b.score - a.score).slice(0, 15);
  return { type: 'name', candidates };
}
