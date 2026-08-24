// Mirrors client/src/components/PopularManagers.jsx — kept as a small,
// server-side copy rather than a shared import since client and server are
// separate packages/bundlers. CIKs verified against live EDGAR data,
// including picking the currently active filer where a manager has migrated
// CIKs over time (e.g. BlackRock's old filing entity, CIK 1364742, stopped
// filing after mid-2024 in favor of CIK 2012383).
//
// Used by crossManagerSearch.js: EDGAR full-text search ranks by text
// relevance, not position size, so for a widely-held security it tends to
// surface an essentially arbitrary sample of small/mid-tier filers rather
// than the actual largest holders. These mega-cap managers are checked
// unconditionally on every ticker search so genuinely large moves aren't
// missed just because search relevance scoring doesn't correlate with
// position size.
export const MAJOR_MANAGER_CIKS = [
  '2012383', // BlackRock, Inc.
  '102909', // Vanguard Group Inc
  '93751', // State Street Corp
  '315066', // FMR LLC (Fidelity)
  '19617', // JPMorgan Chase & Co
  '886982', // Goldman Sachs Group Inc
  '895421', // Morgan Stanley
  '914208', // Invesco Ltd.
  '70858', // Bank of America Corp /DE/
  '1067983', // Berkshire Hathaway Inc
];
