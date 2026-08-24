import { XMLParser } from 'fast-xml-parser';

// parseTagValue: false is critical — CUSIPs like "08862E102" look like
// scientific notation (8.862E+102) and fast-xml-parser's numeric coercion
// will silently mangle them otherwise. We convert numeric fields manually.
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  trimValues: true,
  parseTagValue: false,
});

function num(v) {
  if (v === undefined || v === null || v === '') return 0;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Parse a 13F XML information table into raw per-row records (one row per
 * <infoTable>; a single security can legitimately appear as multiple rows
 * when voting discretion is split — callers must merge by CUSIP, see
 * mergeByCusip below).
 *
 * IMPORTANT / KNOWN DATA-QUALITY ISSUE: SEC's current 13F XML technical
 * specification says <value> is whole US dollars, and large, well-formed
 * filers (e.g. Berkshire Hathaway) do report it that way — verified against
 * live EDGAR data. BUT plenty of real filings (often smaller filers, or
 * older ones) still populate <value> using the legacy paper-form convention
 * of thousands of dollars, inconsistently, and EDGAR does not reject this.
 * There is no reliable way to detect which convention a given filing used
 * without an external share-price reference, which is out of scope here —
 * so DeltaForm reports <value> exactly as filed. Treat $ figures as
 * "what the manager reported," not a guaranteed-accurate market value; this
 * is called out in the UI footer and README.
 */
export function parseInfoTableXml(xml) {
  const parsed = xmlParser.parse(xml);
  const root = parsed.informationTable ?? parsed.edgarSubmission?.formData?.informationTable ?? parsed;
  let rows = root?.infoTable ?? [];
  if (!Array.isArray(rows)) rows = rows ? [rows] : [];

  return rows.map((r) => {
    const shares = r.shrsOrPrnAmt || {};
    return {
      nameOfIssuer: String(r.nameOfIssuer ?? '').trim(),
      titleOfClass: String(r.titleOfClass ?? '').trim(),
      cusip: String(r.cusip ?? '').trim().toUpperCase(),
      value: num(r.value), // reported in whole USD
      valueUsd: num(r.value),
      shares: num(shares.sshPrnamt),
      sharesType: String(shares.sshPrnamtType ?? '').trim().toUpperCase(), // 'SH' or 'PRN'
      putCall: r.putCall ? String(r.putCall).trim().toUpperCase() : '', // 'PUT' | 'CALL' | ''
      investmentDiscretion: String(r.investmentDiscretion ?? '').trim(),
      votingSole: num(r.votingAuthority?.Sole),
      votingShared: num(r.votingAuthority?.Shared),
      votingNone: num(r.votingAuthority?.None),
    };
  });
}

/**
 * Best-effort parser for the xsl-rendered HTML fallback (used only when a
 * filing has no parseable raw infoTable XML). SEC's xslForm13F stylesheet
 * renders a single <table> whose header row contains "NAME OF ISSUER" and
 * "CUSIP" columns in a fixed order matching the XML schema.
 */
export function parseInfoTableHtml(html) {
  const tableMatch = html.match(/<table[\s\S]*?<\/table>/gi);
  if (!tableMatch) return [];

  const stripTags = (s) => s.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();

  for (const tableHtml of tableMatch) {
    const rowsHtml = tableHtml.match(/<tr[\s\S]*?<\/tr>/gi) || [];
    const cellsPerRow = rowsHtml.map(
      (rowHtml) => (rowHtml.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) || []).map((c) => stripTags(c))
    );
    const headerIdx = cellsPerRow.findIndex((cells) =>
      cells.some((c) => /name of issuer/i.test(c)) && cells.some((c) => /cusip/i.test(c))
    );
    if (headerIdx === -1) continue;

    const header = cellsPerRow[headerIdx].map((h) => h.toLowerCase());
    const col = (patterns) => header.findIndex((h) => patterns.some((p) => h.includes(p)));
    const idx = {
      name: col(['name of issuer']),
      cusip: col(['cusip']),
      value: col(['value']),
      shares: col(['shares', 'prin amt', 'amt']),
      sharesType: col(['sh/prn', 'sh / prn', 'type']),
      putCall: col(['put', 'call']),
    };
    if (idx.name === -1 || idx.cusip === -1) continue;

    const out = [];
    for (let i = headerIdx + 1; i < cellsPerRow.length; i++) {
      const cells = cellsPerRow[i];
      if (cells.length < 3) continue;
      const name = cells[idx.name];
      const cusip = cells[idx.cusip];
      if (!name || !cusip) continue;
      out.push({
        nameOfIssuer: name.trim(),
        titleOfClass: '',
        cusip: cusip.trim().toUpperCase(),
        value: num(cells[idx.value]), // whole USD — see note on parseInfoTableXml
        valueUsd: num(cells[idx.value]),
        shares: num(cells[idx.shares]),
        sharesType: (idx.sharesType > -1 ? cells[idx.sharesType] : 'SH').trim().toUpperCase() || 'SH',
        putCall: idx.putCall > -1 ? cells[idx.putCall].trim().toUpperCase() : '',
        investmentDiscretion: '',
        votingSole: 0,
        votingShared: 0,
        votingNone: 0,
      });
    }
    if (out.length) return out;
  }
  return [];
}

/**
 * Merge raw infoTable rows into three labeled buckets, summing shares/value
 * for rows sharing a CUSIP (e.g. split voting-discretion classes). Common
 * stock only counts as sshPrnamtType === 'SH' AND no putCall — options and
 * bond principal amounts are kept in separate sections and must never be
 * treated as share counts.
 */
export function mergeByCusip(rows) {
  const buckets = { common: new Map(), options: new Map(), bonds: new Map() };

  for (const r of rows) {
    let bucket;
    if (r.putCall === 'PUT' || r.putCall === 'CALL') bucket = 'options';
    else if (r.sharesType === 'PRN') bucket = 'bonds';
    else if (r.sharesType === 'SH') bucket = 'common';
    else bucket = 'bonds'; // unknown type — never assume it's a share count

    const map = buckets[bucket];
    const key = bucket === 'options' ? `${r.cusip}:${r.putCall}` : r.cusip;
    const existing = map.get(key);
    if (existing) {
      existing.shares += r.shares;
      existing.value += r.value;
      existing.valueUsd += r.valueUsd;
      existing.rowCount += 1;
    } else {
      map.set(key, { ...r, rowCount: 1 });
    }
  }

  return {
    common: [...buckets.common.values()],
    options: [...buckets.options.values()],
    bonds: [...buckets.bonds.values()],
  };
}
