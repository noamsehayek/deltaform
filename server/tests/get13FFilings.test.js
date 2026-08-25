import { describe, it, expect } from 'vitest';
import { get13FFilings } from '../src/lib/submissions.js';

describe('get13FFilings', () => {
  it('collapses an amended period to its latest filing instead of leaving the original alongside it', () => {
    const filings = [
      { form: '13F-HR/A', periodOfReport: '2026-06-30', filingDate: '2026-08-07', accessionNumber: '0001805591-26-000008' },
      { form: '13F-HR', periodOfReport: '2026-06-30', filingDate: '2026-08-06', accessionNumber: '0001805591-26-000007' },
      { form: '13F-HR', periodOfReport: '2026-03-31', filingDate: '2026-05-08', accessionNumber: '0001805591-26-000005' },
    ];

    const result = get13FFilings(filings);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ periodOfReport: '2026-06-30', accessionNumber: '0001805591-26-000008' });
    expect(result[1]).toMatchObject({ periodOfReport: '2026-03-31', accessionNumber: '0001805591-26-000005' });
  });

  it('sorts distinct periods most recent first', () => {
    const filings = [
      { form: '13F-HR', periodOfReport: '2025-12-31', filingDate: '2026-01-29', accessionNumber: '0000102909-26-000031' },
      { form: '13F-HR', periodOfReport: '2026-06-30', filingDate: '2026-08-12', accessionNumber: '0000019617-26-000325' },
      { form: '13F-HR', periodOfReport: '2026-03-31', filingDate: '2026-05-10', accessionNumber: '0000019617-26-000200' },
    ];

    const result = get13FFilings(filings);

    expect(result.map((f) => f.periodOfReport)).toEqual(['2026-06-30', '2026-03-31', '2025-12-31']);
  });

  it('ignores non-13F forms', () => {
    const filings = [
      { form: '13F-NT', periodOfReport: '2026-06-30', filingDate: '2026-08-01', accessionNumber: '0000000000-26-000001' },
      { form: '13F-HR', periodOfReport: '2026-03-31', filingDate: '2026-05-08', accessionNumber: '0000000000-26-000002' },
    ];

    const result = get13FFilings(filings);

    expect(result).toHaveLength(1);
    expect(result[0].periodOfReport).toBe('2026-03-31');
  });
});
