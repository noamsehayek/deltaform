import { useState } from 'react';
import { api } from '../lib/api.js';

function fmtShares(n) {
  return new Intl.NumberFormat('en-US').format(Math.round(n));
}

const CUSIP_PATTERN = /^[A-Z0-9]{8,9}$/;

export default function CrossManagerPanel() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [candidates, setCandidates] = useState(null); // ambiguous matches to pick from
  const [activeCusip, setActiveCusip] = useState(null);
  const [result, setResult] = useState(null);

  async function searchCusip(cusip) {
    setLoading(true);
    setError(null);
    setResult(null);
    setActiveCusip(cusip);
    try {
      setResult(await api.crossManager(cusip, 15));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function run(e) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setError(null);
    setResult(null);
    setCandidates(null);

    // Raw CUSIPs are always accepted directly — no resolution needed.
    if (CUSIP_PATTERN.test(q.toUpperCase())) {
      return searchCusip(q.toUpperCase());
    }

    setLoading(true);
    try {
      const { exact, fuzzy } = await api.resolveTicker(q);
      if (exact.length === 1) {
        await searchCusip(exact[0].cusip);
      } else if (exact.length > 1) {
        setCandidates(exact);
        setLoading(false);
      } else if (fuzzy.length > 0) {
        setCandidates(fuzzy);
        setLoading(false);
      } else {
        setError(
          `Couldn't resolve "${q}" to a CUSIP from filings DeltaForm has seen so far. Try the exact ticker, the issuer name, or a raw CUSIP.`
        );
        setLoading(false);
      }
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <div className="panel">
      <h2>Who's Buying / Selling This Ticker?</h2>
      <div className="dim" style={{ marginBottom: 10 }}>
        Resolves a ticker or issuer name to a CUSIP (via holdings DeltaForm has already parsed), then searches EDGAR
        full-text for 13F filings mentioning it and diffs each filer's holding against their prior quarter. A raw
        CUSIP also works directly.
      </div>
      <form className="row" onSubmit={run}>
        <input
          type="text"
          placeholder="Ticker, issuer name, or CUSIP (e.g. IREN)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ flex: 1, minWidth: 200 }}
        />
        <button type="submit" className="primary" disabled={loading}>
          {loading ? 'Searching…' : 'Search'}
        </button>
      </form>
      {error && <div className="error-banner" style={{ marginTop: 10 }}>{error}</div>}
      {candidates && (
        <ul className="candidate-list" style={{ marginTop: 10 }}>
          {candidates.map((c) => (
            <li key={c.cusip} onClick={() => { setCandidates(null); searchCusip(c.cusip); }}>
              <span>
                {c.ticker ? `${c.ticker} — ` : ''}
                {c.name || c.cusip}
              </span>
              <span className="dim">{c.cusip}</span>
            </li>
          ))}
        </ul>
      )}
      {result && (
        <div style={{ marginTop: 14 }}>
          <div className="dim" style={{ marginBottom: 8 }}>
            CUSIP {activeCusip} · Checked {result.checked} filer(s) mentioning this CUSIP · {result.buyers} net
            buyers · {result.sellers} net sellers
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Manager</th>
                  <th>Period</th>
                  <th className="num">Shares (prior)</th>
                  <th className="num">Shares (now)</th>
                  <th className="num">Δ Shares</th>
                  <th>Verdict</th>
                </tr>
              </thead>
              <tbody>
                {result.results.map((r) => (
                  <tr key={r.cik}>
                    <td>{r.name}</td>
                    <td className="dim">{r.period}</td>
                    <td className="num">{fmtShares(r.sharesPrior)}</td>
                    <td className="num">{fmtShares(r.sharesNow)}</td>
                    <td className={`num ${r.shareDelta > 0 ? 'pos' : r.shareDelta < 0 ? 'neg' : ''}`}>
                      {r.shareDelta > 0 ? '+' : ''}
                      {fmtShares(r.shareDelta)}
                    </td>
                    <td>
                      <span className={`tag ${r.verdict.includes('BUY') || r.verdict === 'NEW POSITION' ? 'buy' : r.verdict.includes('SELL') ? 'sell' : 'unchanged'}`}>
                        {r.verdict}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
