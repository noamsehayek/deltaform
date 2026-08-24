import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseInfoTableXml, mergeByCusip } from '../src/lib/thirteenFParser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const q1 = fs.readFileSync(path.join(__dirname, '../fixtures/sample13f_q1.xml'), 'utf-8');

describe('common stock vs bond vs option filtering', () => {
  const merged = mergeByCusip(parseInfoTableXml(q1));

  it('includes only sshPrnamtType === SH with no putCall in the common bucket', () => {
    const cusips = merged.common.map((h) => h.cusip);
    expect(cusips).toContain('00123Q104'); // ALPHA CORP, SH, no putCall
    expect(cusips).not.toContain('08862E102'); // bond principal
    expect(cusips).not.toContain('36467W109'); // option
  });

  it('routes PRN (bond principal) rows to the bonds bucket, never treated as shares', () => {
    const bond = merged.bonds.find((h) => h.cusip === '08862E102');
    expect(bond).toBeDefined();
    expect(bond.sharesType).toBe('PRN');
    expect(merged.common.some((h) => h.cusip === '08862E102')).toBe(false);
  });

  it('routes put/call rows to the options bucket, never counted as common shares', () => {
    const option = merged.options.find((h) => h.cusip === '36467W109');
    expect(option).toBeDefined();
    expect(option.putCall).toBe('CALL');
    expect(merged.common.some((h) => h.cusip === '36467W109')).toBe(false);
  });

  it('never conflates value (USD) with share/principal counts', () => {
    const alpha = merged.common.find((h) => h.cusip === '00123Q104');
    expect(alpha.value).not.toBe(alpha.shares);
    expect(alpha.valueUsd).toBe(alpha.value); // value is already whole USD, not thousands
  });
});
