import { useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { rowsToCsv, downloadCsv } from '../lib/csv.js';
import { DownloadIcon, StarIcon } from './Icons.jsx';

function fmtShares(n) {
  return new Intl.NumberFormat('en-US').format(Math.round(n));
}
function fmtUsd(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}
function fmtPct(n) {
  if (!Number.isFinite(n)) return 'NEW';
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
}

const COLUMNS = [
  { key: 'ticker', label: 'Ticker' },
  { key: 'nameOfIssuer', label: 'Issuer' },
  { key: 'cusip', label: 'CUSIP' },
  { key: 'sharesA', label: 'Shares (A)', num: true },
  { key: 'sharesB', label: 'Shares (B)', num: true },
  { key: 'shareDelta', label: 'Δ Shares', num: true },
  { key: 'pctChange', label: '% Chg', num: true },
  { key: 'valueUsdB', label: 'Value (B)', num: true },
  { key: 'tag', label: 'Tag' },
];

export default function HoldingsTable({ section, title, onWatch, onTickerMapped }) {
  const [sortKey, setSortKey] = useState('shareDelta');
  const [sortDir, setSortDir] = useState(-1);
  const [mappingCusip, setMappingCusip] = useState(null);
  const [mapValue, setMapValue] = useState('');

  const sorted = useMemo(() => {
    const abs = (v) => (typeof v === 'number' ? Math.abs(v) : v);
    return [...section.rows].sort((a, b) => {
      const av = abs(a[sortKey]);
      const bv = abs(b[sortKey]);
      if (av === bv) return 0;
      return av > bv ? -sortDir : sortDir;
    });
  }, [section.rows, sortKey, sortDir]);

  function toggleSort(key) {
    if (key === sortKey) setSortDir((d) => -d);
    else {
      setSortKey(key);
      setSortDir(-1);
    }
  }

  function exportCsv() {
    const csv = rowsToCsv(sorted, [
      { label: 'Ticker', value: (r) => r.ticker || '' },
      { label: 'Issuer', value: (r) => r.nameOfIssuer },
      { label: 'CUSIP', value: (r) => r.cusip },
      { label: 'Shares A', value: (r) => r.sharesA },
      { label: 'Shares B', value: (r) => r.sharesB },
      { label: 'Delta Shares', value: (r) => r.shareDelta },
      { label: 'Pct Change', value: (r) => (Number.isFinite(r.pctChange) ? r.pctChange.toFixed(2) : 'NEW') },
      { label: 'Value USD A', value: (r) => r.valueUsdA },
      { label: 'Value USD B', value: (r) => r.valueUsdB },
      { label: 'Tag', value: (r) => r.tag },
    ]);
    downloadCsv(`deltaform_${title.replace(/\s+/g, '_').toLowerCase()}.csv`, csv);
  }

  async function submitMapping(cusip) {
    await api.setManualTicker(cusip, mapValue);
    setMappingCusip(null);
    setMapValue('');
    onTickerMapped?.();
  }

  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>{title}</h2>
        <button onClick={exportCsv}>
          <DownloadIcon />
          Export CSV
        </button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th key={c.key} onClick={() => toggleSort(c.key)} className={c.num ? 'num' : ''}>
                  {c.label}
                  {sortKey === c.key ? (sortDir === 1 ? ' ▲' : ' ▼') : ''}
                </th>
              ))}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.key}>
                <td>
                  {r.ticker ? (
                    r.ticker
                  ) : mappingCusip === r.cusip ? (
                    <span className="row" style={{ gap: 4 }}>
                      <input
                        type="text"
                        style={{ width: 70, padding: '2px 4px' }}
                        value={mapValue}
                        onChange={(e) => setMapValue(e.target.value)}
                        placeholder="TICKER"
                      />
                      <button onClick={() => submitMapping(r.cusip)}>Save</button>
                    </span>
                  ) : (
                    <button onClick={() => setMappingCusip(r.cusip)} className="dim">
                      map ticker
                    </button>
                  )}
                </td>
                <td>{r.nameOfIssuer}</td>
                <td className="dim">{r.cusip}</td>
                <td className="num">{fmtShares(r.sharesA)}</td>
                <td className="num">{fmtShares(r.sharesB)}</td>
                <td className={`num ${r.shareDelta > 0 ? 'pos' : r.shareDelta < 0 ? 'neg' : ''}`}>
                  {r.shareDelta > 0 ? '+' : ''}
                  {fmtShares(r.shareDelta)}
                </td>
                <td className="num">{fmtPct(r.pctChange)}</td>
                <td className="num">{fmtUsd(r.valueUsdB)}</td>
                <td>
                  <span className={`tag ${r.tag.toLowerCase()}`}>{r.tag}</span>
                </td>
                <td>
                  <button
                    className="dim icon-btn"
                    onClick={() => onWatch?.({ type: 'ticker', ticker: r.ticker, cusip: r.cusip, name: r.nameOfIssuer })}
                    title="Add to watchlist"
                  >
                    <StarIcon />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
