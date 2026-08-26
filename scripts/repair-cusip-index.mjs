#!/usr/bin/env node
// One-off repair for cusip-index.json entries that were auto-tagged with a
// ticker before holdingsService.js stopped feeding bond/option rows into
// learnCusips (see "Stop bond/option CUSIPs from stealing a company's
// ticker"). That bug let a derivative's CUSIP inherit its underlying's
// ticker whenever a filer's issuer-name text for the derivative happened to
// carry a recognizable marker (an embedded "PUT"/"CALL", or a coupon-rate/
// maturity-date pattern for a note or bond) — e.g. APLD's 2.75% convertible
// notes CUSIP showing up as a candidate alongside the real common-stock
// CUSIP whenever someone searched "APLD".
//
// This only clears the AUTO `ticker` field on entries whose recorded names
// show one of those markers — `manualTicker` (an explicit human override)
// is never touched. It does NOT catch every kind of bad duplicate (e.g. a
// stale/dead CUSIP with a generic name and no current holders, which needs
// live verification rather than a text pattern) — those still need
// case-by-case attention same as the two extra APLD CUSIPs that got
// hand-cleared.
//
// A single stray filer entry can taint even a ticker's one true CUSIP (e.g.
// "ELI LILLY & CO SR NT" showing up once among LLY's 40+ otherwise-clean
// common-stock names), so per-CUSIP taint alone isn't a safe signal to
// clear on its own. Instead, for each ticker, whichever CUSIP has
// accumulated the most distinct issuer names is protected outright — real,
// actively-traded common stock is what gets cited by dozens of filers over
// years, so name-count is a strong proxy for "this is the real one" — and
// taint is only acted on for that ticker's OTHER, less-cited CUSIPs. This
// guarantees a ticker can never end up with zero resolvable CUSIPs: the
// richest one always survives, whether or not it happens to carry taint
// itself.
//
// Usage:
//   node scripts/repair-cusip-index.mjs [path-to-cusip-index.json]   # dry run, prints what would change
//   node scripts/repair-cusip-index.mjs [path-to-cusip-index.json] --apply   # writes the fix (also writes a .bak alongside it)

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const file = args.find((a) => !a.startsWith('--')) || path.join('server', 'data', 'cusip-index.json');

const OPTION_PATTERN = /\b(PUT|CALL)\b/i;
const BOND_PATTERN = /\d+(\.\d+)?\s*%|\bNOTES?\b|\bNTS?\b|\bDEBENTURES?\b|\bBONDS?\b|\bCONV(ERTIBLE)?\b|\bPFD\b|\bPREFERRED\b|\bWARRANTS?\b|\d{1,2}\/\d{1,2}\/\d{2,4}/i;

function taintReason(names) {
  for (const name of names) {
    if (OPTION_PATTERN.test(name)) return 'option';
    if (BOND_PATTERN.test(name)) return 'bond/note';
  }
  return null;
}

const idx = JSON.parse(fs.readFileSync(file, 'utf-8'));

const byTicker = {};
for (const [cusip, entry] of Object.entries(idx)) {
  if (!entry.ticker) continue; // nothing to clear
  (byTicker[entry.ticker] ||= []).push({ cusip, entry, reason: taintReason(entry.names || []) });
}

const changes = [];
for (const list of Object.values(byTicker)) {
  if (list.length < 2) continue; // nothing to disambiguate
  const maxNames = Math.max(...list.map((c) => (c.entry.names || []).length));
  // Protect every CUSIP tied for the most names, not just one, so a genuine
  // tie between two equally-well-established CUSIPs is left for manual
  // review rather than arbitrarily picking a "winner".
  for (const c of list) {
    const isRichest = (c.entry.names || []).length === maxNames;
    if (!isRichest && c.reason) {
      changes.push({ cusip: c.cusip, ticker: c.entry.ticker, reason: c.reason, names: c.entry.names, manualTicker: c.entry.manualTicker });
    }
  }
}

console.log(`${apply ? 'Applying' : 'Dry run (pass --apply to write)'} — ${file}`);
console.log(`${changes.length} CUSIP entries would have their auto ticker cleared:\n`);

const changesByTicker = {};
for (const c of changes) (changesByTicker[c.ticker] ||= []).push(c);
for (const [ticker, list] of Object.entries(changesByTicker)) {
  for (const c of list) {
    const kept = c.manualTicker ? ` (manualTicker "${c.manualTicker}" untouched)` : '';
    console.log(`  ${ticker}  ${c.cusip}  [${c.reason}]${kept}`);
  }
}
console.log(`\n${Object.keys(changesByTicker).length} distinct tickers affected.`);

if (apply) {
  fs.writeFileSync(`${file}.bak`, JSON.stringify(idx));
  for (const c of changes) idx[c.cusip].ticker = null;
  fs.writeFileSync(file, JSON.stringify(idx));
  console.log(`\nWrote changes. Backup saved to ${file}.bak`);
}
