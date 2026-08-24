import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseInfoTableXml, mergeByCusip } from '../src/lib/thirteenFParser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const q1 = fs.readFileSync(path.join(__dirname, '../fixtures/sample13f_q1.xml'), 'utf-8');

describe('mergeByCusip', () => {
  it('sums shares and value across rows sharing a CUSIP (split voting-discretion classes)', () => {
    const rows = parseInfoTableXml(q1);
    const alphaRows = rows.filter((r) => r.cusip === '00123Q104');
    expect(alphaRows).toHaveLength(2); // fixture has two ALPHA CORP rows pre-merge

    const merged = mergeByCusip(rows);
    const alpha = merged.common.find((h) => h.cusip === '00123Q104');
    expect(alpha).toBeDefined();
    expect(alpha.shares).toBe(12000); // 10000 + 2000
    expect(alpha.value).toBe(600000); // 500000 + 100000 (thousands of USD)
    expect(alpha.rowCount).toBe(2);
  });

  it('keeps distinct CUSIPs as separate holdings', () => {
    const rows = parseInfoTableXml(q1);
    const merged = mergeByCusip(rows);
    const allCusips = [...merged.common, ...merged.options, ...merged.bonds].map((h) => h.cusip);
    expect(new Set(allCusips).size).toBe(allCusips.length);
  });
});
