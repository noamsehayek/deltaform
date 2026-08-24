import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseInfoTableXml, mergeByCusip } from '../src/lib/thirteenFParser.js';
import { computeCompare } from '../src/lib/compareEngine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const q1xml = fs.readFileSync(path.join(__dirname, '../fixtures/sample13f_q1.xml'), 'utf-8');
const q2xml = fs.readFileSync(path.join(__dirname, '../fixtures/sample13f_q2.xml'), 'utf-8');

function makeFiling(xml, period, accession) {
  return {
    periodOfReport: period,
    filingDate: period,
    accessionNumber: accession,
    rows: mergeByCusip(parseInfoTableXml(xml)),
  };
}

describe('rebrand / CUSIP-change handling', () => {
  const filingA = makeFiling(q1xml, '2025-09-30', '0000000000-25-000001');
  const filingB = makeFiling(q2xml, '2025-12-31', '0000000000-25-000002');
  const compare = computeCompare(filingA, filingB);

  it('treats a rebrand (OLDCO -> NEWCO, different CUSIP) as an EXIT plus a NEW, never a match', () => {
    const oldco = compare.common.rows.find((r) => r.cusip === '11111A105');
    const newco = compare.common.rows.find((r) => r.cusip === '99999Z999');

    expect(oldco.tag).toBe('EXIT');
    expect(oldco.sharesB).toBe(0);
    expect(newco.tag).toBe('NEW');
    expect(newco.sharesA).toBe(0);

    // Matching by name instead of CUSIP would have netted these into a single
    // "unchanged" or partial-change row — assert that did NOT happen.
    expect(compare.common.rows.some((r) => r.nameOfIssuer === 'OLDCO INC' && r.tag !== 'EXIT')).toBe(false);
  });

  it('correctly tags a normal share-count increase by matching on CUSIP', () => {
    const alpha = compare.common.rows.find((r) => r.cusip === '00123Q104');
    expect(alpha.tag).toBe('INCREASE');
    expect(alpha.sharesA).toBe(12000);
    expect(alpha.sharesB).toBe(15000);
    expect(alpha.shareDelta).toBe(3000);
  });

  it('rolls EXIT/NEW correctly into aggregate stats', () => {
    expect(compare.common.stats.exits).toBe(1); // OLDCO
    expect(compare.common.stats.newPositions).toBe(2); // NEWCO + DELTA HOLD
  });

  it('never lets bond or option rows leak into the common-stock diff', () => {
    expect(compare.common.rows.some((r) => r.cusip === '08862E102')).toBe(false);
    expect(compare.common.rows.some((r) => r.cusip === '36467W109')).toBe(false);
    expect(compare.bonds.rows.find((r) => r.cusip === '08862E102')).toBeDefined();
    expect(compare.options.rows.find((r) => r.cusip === '36467W109')).toBeDefined();
  });
});
