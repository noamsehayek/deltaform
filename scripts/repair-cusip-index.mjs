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

// Group by ticker first. A tainted name (e.g. one sloppy filer writing "ELI
// LILLY & CO SR NT" for what is, everywhere else, plain common stock) can
// show up even on a ticker's one true common-stock CUSIP — clearing that
// CUSIP's ticker would leave the ticker completely unresolvable, which is
// worse than the original bug. So a CUSIP is only ever cleared when at
// least one *other* CUSIP for the same ticker is untainted — i.e. we're
// resolving an ambiguity between a real entry and a bogus duplicate, never
// wiping a ticker's sole (or every) candidate.
const byTicker = {};
for (const [cusip, entry] of Object.entries(idx)) {
  if (!entry.ticker) continue; // nothing to clear
  (byTicker[entry.ticker] ||= []).push({ cusip, entry, reason: taintReason(entry.names || []) });
}

const changes = [];
for (const list of Object.values(byTicker)) {
  const hasCleanSibling = list.some((c) => !c.reason);
  if (!hasCleanSibling) continue;
  for (const c of list) {
    if (c.reason) {
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
