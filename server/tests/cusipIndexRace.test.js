import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// This test points DELTAFORM_DATA_DIR at a fresh temp directory and only
// imports cusipResolver.js (dynamically, after the env var is set — a static
// top-of-file import would be hoisted ahead of the env assignment) so it
// never touches the real server/data/cusip-index.json.
//
// setManualTicker() is used (rather than learnCusip/learnCusips) specifically
// because it exercises loadCusipIndex()'s cold-cache path without also
// calling loadCompanyTickers(), which does a live SEC network fetch — this
// keeps the test fast and network-free.
describe('cusipResolver loadCusipIndex concurrency', () => {
  let setManualTicker, getCusipIndexStats, getCusipEntry;

  beforeAll(async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deltaform-cusip-race-'));
    process.env.DELTAFORM_DATA_DIR = tmpDir;
    process.env.SEC_CONTACT_EMAIL = process.env.SEC_CONTACT_EMAIL || 'test@example.com';
    const mod = await import('../src/lib/cusipResolver.js');
    setManualTicker = mod.setManualTicker;
    getCusipIndexStats = mod.getCusipIndexStats;
    getCusipEntry = mod.getCusipEntry;
  });

  it('keeps every entry written concurrently against a cold (never-yet-loaded) index, not just the last to resolve', async () => {
    // These all start synchronously in the same tick, before the index file
    // has ever been read once — the exact window where a check-then-await
    // "if (cusipIndex) ... else read+assign" pattern loses updates: each
    // call sees a null cache, independently reads/parses (or falls back to
    // {} on ENOENT), and overwrites the shared index reference, silently
    // discarding whichever entries an earlier concurrent call had already
    // written into its own now-orphaned copy.
    const cusips = ['AAAAAAAAA', 'BBBBBBBBB', 'CCCCCCCCC', 'DDDDDDDDD', 'EEEEEEEEE', 'FFFFFFFFF'];
    await Promise.all(cusips.map((cusip, i) => setManualTicker(cusip, `TIK${i}`)));

    const stats = await getCusipIndexStats();
    expect(stats.total).toBe(cusips.length);

    for (const [i, cusip] of cusips.entries()) {
      const entry = await getCusipEntry(cusip);
      expect(entry).not.toBeNull();
      expect(entry.manualTicker).toBe(`TIK${i}`);
    }
  });
});
