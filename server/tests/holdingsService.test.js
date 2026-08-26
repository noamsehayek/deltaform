import { describe, it, expect, vi } from 'vitest';

const learnCusips = vi.fn();
vi.mock('../src/lib/cusipResolver.js', () => ({ learnCusips }));
vi.mock('../src/lib/filingDocs.js', () => ({
  getInfoTableForFiling: vi.fn(async () => ({
    rows: {
      common: [{ cusip: '00123Q104', nameOfIssuer: 'ALPHA CORP' }],
      // A bond can carry the same issuer's plain name (e.g. a filer just
      // wrote "ALPHA CORP" for a note holding, with no "NOTES"/"CONV"
      // qualifier) — this must never reach the ticker-learning index, or
      // the bond's CUSIP inherits ALPHA's ticker and shows up as a bogus
      // candidate alongside the real common-stock CUSIP.
      bonds: [{ cusip: '00123QAB1', nameOfIssuer: 'ALPHA CORP' }],
      options: [{ cusip: '00123Q104', nameOfIssuer: 'ALPHA CORP' }],
    },
    rawRowCount: 3,
    sourceFile: 'test.xml',
    format: 'xml',
  })),
}));

const { getFilingHoldings } = await import('../src/lib/holdingsService.js');

describe('getFilingHoldings', () => {
  it('only feeds common-stock rows into the ticker-learning index, never bonds or options', async () => {
    await getFilingHoldings('0000000001', '0000000001-26-000001');

    expect(learnCusips).toHaveBeenCalledTimes(1);
    const learned = learnCusips.mock.calls[0][0];
    expect(learned).toEqual([{ cusip: '00123Q104', issuerName: 'ALPHA CORP' }]);
  });
});
