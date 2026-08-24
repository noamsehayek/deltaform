import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { CONTACT_EMAIL, USER_AGENT, CACHE_DIR, SEC_MIN_INTERVAL_MS } from '../config.js';

if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

export class SecFetchError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'SecFetchError';
    this.status = status;
  }
}

// --- Global throttle: serialize all outbound SEC requests at >= SEC_MIN_INTERVAL_MS apart. ---
let lastRequestAt = 0;
let queueTail = Promise.resolve();

function throttledSlot() {
  const runNext = queueTail.then(async () => {
    const wait = Math.max(0, lastRequestAt + SEC_MIN_INTERVAL_MS - Date.now());
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequestAt = Date.now();
  });
  queueTail = runNext.catch(() => {});
  return runNext;
}

function cacheKeyFor(url) {
  return crypto.createHash('sha1').update(url).digest('hex');
}

function cachePathFor(key) {
  // Two-level fan-out so the cache dir doesn't get one giant flat listing.
  return path.join(CACHE_DIR, key.slice(0, 2), `${key}.json`);
}

async function readCache(key) {
  try {
    const raw = await fsp.readFile(cachePathFor(key), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeCache(key, entry) {
  const p = cachePathFor(key);
  await fsp.mkdir(path.dirname(p), { recursive: true });
  await fsp.writeFile(p, JSON.stringify(entry));
}

/**
 * Fetch a URL from SEC EDGAR with the required User-Agent header, global
 * rate-limiting, and an on-disk cache.
 *
 * @param {string} url
 * @param {object} opts
 * @param {'text'|'json'|'buffer'} [opts.as='text']
 * @param {number} [opts.ttlMs] - cache freshness window; omit/Infinity for
 *   immutable resources (e.g. filings addressed by accession number).
 * @param {boolean} [opts.noCache]
 */
export async function secFetch(url, opts = {}) {
  const { as = 'text', ttlMs = Infinity, noCache = false } = opts;

  if (!CONTACT_EMAIL) {
    throw new SecFetchError(
      'SEC contact email is not configured. Set SEC_CONTACT_EMAIL in server/.env — SEC requires a real contact email in the User-Agent header on every request.',
      412
    );
  }

  const key = cacheKeyFor(url);

  if (!noCache) {
    const cached = await readCache(key);
    if (cached && Date.now() - cached.fetchedAt < ttlMs) {
      return decodeCacheEntry(cached, as);
    }
  }

  await throttledSlot();

  let res;
  try {
    res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept-Encoding': 'gzip, deflate',
      },
      // Without an explicit timeout, a request SEC silently drops (rather
      // than actively rejecting) hangs forever — fetch() has no default
      // timeout. Fail loudly instead so this is diagnosable rather than an
      // opaque hang that only surfaces as a platform-level 502 upstream.
      signal: AbortSignal.timeout(20000),
    });
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      throw new SecFetchError(
        `SEC EDGAR did not respond within 20s for ${url} — the connection may be getting silently dropped from this network/host rather than actively rejected.`,
        504
      );
    }
    throw new SecFetchError(`Network error contacting SEC EDGAR: ${err.message}`, 0);
  }

  if (res.status === 403) {
    throw new SecFetchError(
      'SEC returned 403 — set contact email. SEC EDGAR rejects requests without a valid User-Agent contact email; check SEC_CONTACT_EMAIL in server/.env.',
      403
    );
  }
  if (res.status === 404) {
    throw new SecFetchError(`SEC returned 404 for ${url}`, 404);
  }
  if (!res.ok) {
    throw new SecFetchError(`SEC request failed (${res.status}) for ${url}`, res.status);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  const entry = { url, fetchedAt: Date.now(), body: buf.toString('base64') };
  if (!noCache) await writeCache(key, entry);
  return decodeCacheEntry(entry, as);
}

function decodeCacheEntry(entry, as) {
  const buf = Buffer.from(entry.body, 'base64');
  if (as === 'buffer') return buf;
  if (as === 'json') return JSON.parse(buf.toString('utf-8'));
  return buf.toString('utf-8');
}
