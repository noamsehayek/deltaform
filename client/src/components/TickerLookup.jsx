import { useState } from 'react';

function fmtShares(n) {
  return new Intl.NumberFormat('en-US').format(Math.round(n));
}

function verdictOf(row) {
  if (row.tag === 'NEW') return 'NEW POSITION';
  if (row.tag === 'EXIT') return 'EXIT';
  if (row.tag === 'INCREASE') return 'NET BUY';
  if (row.tag === 'DECREASE') return 'NET SELL';
  return 'UNCHANGED';
}

function verdictClass(verdict) {
  if (verdict === 'NET BUY' || verdict === 'NEW POSITION') return 'buy';
  if (verdict === 'NET SELL' || verdict === 'EXIT') return 'sell';
  return '';
}

export default function TickerLookup({ rows }) {
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState([]);

  function search(e) {
    e.preventDefault();
    const q = query.trim().toUpperCase();
    if (!q) return setMatches([]);
    setMatches(
      rows.filter(
        (r) =>
          (r.ticker || '').toUpperCase() === q ||
          r.cusip.toUpperCase() === q ||
          r.nameOfIssuer.toUpperCase().includes(q)
      )
    );
  }

  return (
    <div className="panel">
      <h2>Ticker / Issuer Lookup</h2>
      <form className="row" onSubmit={search}>
        <input
          type="text"
          placeholder="Ticker, issuer name, or CUSIP (e.g. IREN)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ flex: 1, minWidth: 220 }}
        />
        <button type="submit" className="primary">
          Look up
        </button>
      </form>
      {query && matches.length === 0 && (
        <div className="dim" style={{ marginTop: 10 }}>
          No holding matching "{query}" in this filer's common-stock table for these two quarters. Try mapping the
          ticker manually in the table below, or check the Options/Bonds tabs.
        </div>
      )}
      {matches.map((row) => {
        const verdict = verdictOf(row);
        const cls = verdictClass(verdict);
        return (
          <div className="verdict-card" key={row.key} style={{ marginTop: 10 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>
                {row.ticker || row.nameOfIssuer} <span className="dim">({row.cusip})</span>
              </div>
              <div className="dim" style={{ marginTop: 4 }}>
                {fmtShares(row.sharesA)} → {fmtShares(row.sharesB)} shares
                {Number.isFinite(row.pctChange) ? ` (${row.pctChange >= 0 ? '+' : ''}${row.pctChange.toFixed(1)}%)` : ''}
              </div>
            </div>
            <div className={`verdict-big ${cls}`}>{verdict}</div>
          </div>
        );
      })}
    </div>
  );
}
