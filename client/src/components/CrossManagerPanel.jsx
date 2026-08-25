import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { SearchIcon } from './Icons.jsx';

function fmtShares(n) {
  return new Intl.NumberFormat('en-US').format(Math.round(n));
}
function fmtPct(n) {
  if (!Number.isFinite(n)) return 'NEW';
  return `${n >= 0 ? '+' : ''}${n.toFixed(0)}%`;
}

const TOP_N = 20;
const CUSIP_PATTERN = /^[A-Z0-9]{8,9}$/;

function MoversTable({ title, rows, tone }) {
  return (
    <div style={{ marginTop: 14 }}>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
        <strong className={tone}>{title}</strong>
        <span className="dim">{rows.length} manager(s)</span>
      </div>
      {rows.length === 0 ? (
        <div className="dim">None found among the managers checked.</div>
      ) : (
        <div className="table-wrap">
          <table className="xmgr-table">
            <thead>
              <tr>
                <th></th>
                <th>Manager</th>
                <th className="num">Shares (prior)</th>
                <th className="num">Shares (now)</th>
                <th className="num">Δ Shares</th>
                <th className="num">Chg %</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.cik} className={tone === 'pos' ? 'row-pos' : 'row-neg'}>
                  <td className="dim">{i + 1}</td>
                  <td>{r.name}</td>
                  <td className="num">{fmtShares(r.sharesPrior)}</td>
                  <td className="num">{fmtShares(r.sharesNow)}</td>
                  <td className={`num ${tone}`}>
                    {r.shareDelta > 0 ? '+' : ''}
                    {fmtShares(r.shareDelta)}
                  </td>
                  <td className={`num ${tone}`}>{fmtPct(r.pctChange)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function CrossManagerPanel() {
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(30);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [candidates, setCandidates] = useState(null); // ambiguous matches to pick from
  const [activeLabel, setActiveLabel] = useState(null);
  const [activeCusip, setActiveCusip] = useState(null);
  const [result, setResult] = useState(null);
  const [progress, setProgress] = useState(null);

  // Total search time is bounded by SEC's rate limit — polling this just
  // makes the wait legible ("checked 14 of 30") rather than making it
  // shorter.
  useEffect(() => {
    if (!loading || !activeCusip) {
      setProgress(null);
      return;
    }
    let cancelled = false;
    const poll = () => {
      api
        .crossManagerProgress(activeCusip)
        .then((p) => {
          if (!cancelled) setProgress(p);
        })
        .catch(() => {});
    };
    poll();
    const id = setInterval(poll, 600);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [loading, activeCusip]);

  const topBuys = useMemo(() => {
    if (!result) return [];
    return [...result.results]
      .filter((r) => r.shareDelta > 0)
      .sort((a, b) => b.shareDelta - a.shareDelta)
      .slice(0, TOP_N);
  }, [result]);

  const topSells = useMemo(() => {
    if (!result) return [];
    return [...result.results]
      .filter((r) => r.shareDelta < 0)
      .sort((a, b) => a.shareDelta - b.shareDelta)
      .slice(0, TOP_N);
  }, [result]);

  // Aggregated across every manager checked, not just the Top 20 shown below
  // — a single manager's outsized buy/sell can otherwise swamp the picture.
  const netSummary = useMemo(() => {
    if (!result) return null;
    let bought = 0;
    let sold = 0;
    for (const r of result.results) {
      if (r.shareDelta > 0) bought += r.shareDelta;
      else if (r.shareDelta < 0) sold += -r.shareDelta;
    }
    const net = bought - sold;
    const verdict = net > 0 ? 'buy' : net < 0 ? 'sell' : 'neutral';
    return { bought, sold, net, verdict };
  }, [result]);

  async function searchCusip(cusip, label) {
    setLoading(true);
    setError(null);
    setResult(null);
    setActiveLabel(label || cusip);
    setActiveCusip(cusip);
    try {
      setResult(await api.crossManager(cusip, limit));
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
        await searchCusip(exact[0].cusip, exact[0].ticker || exact[0].name);
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
      <h2>Search by Ticker — Top 20 Increases &amp; Decreases</h2>
      <div className="dim" style={{ marginBottom: 12 }}>
        Type a ticker, issuer name, or raw CUSIP. DeltaForm checks every institutional manager it can find reporting
        a position in it, then splits the results into the 20 largest share increases and the 20 largest decreases —
        no need to pick a manager first.
      </div>
      <form className="row" onSubmit={run}>
        <div className="input-with-icon" style={{ flex: 1, minWidth: 200 }}>
          <SearchIcon className="input-icon" />
          <input
            type="text"
            placeholder="Ticker, issuer name, or CUSIP (e.g. IREN)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} title="Managers to check">
          <option value={30}>Check 30</option>
          <option value={50}>Check 50</option>
          <option value={75}>Check 75</option>
          <option value={100}>Check 100</option>
        </select>
        <button type="submit" className="primary" disabled={loading}>
          {loading ? 'Searching…' : 'Search'}
        </button>
      </form>
      {error && <div className="error-banner" style={{ marginTop: 10 }}>{error}</div>}
      {candidates && (
        <ul className="candidate-list" style={{ marginTop: 10 }}>
          {candidates.map((c) => (
            <li
              key={c.cusip}
              onClick={() => {
                setCandidates(null);
                searchCusip(c.cusip, c.ticker || c.name);
              }}
            >
              <span>
                {c.ticker ? `${c.ticker} — ` : ''}
                {c.name || c.cusip}
              </span>
              <span className="dim">{c.cusip}</span>
            </li>
          ))}
        </ul>
      )}
      {loading && !candidates && (
        <div className="loading">
          {progress?.total > 0 ? `Checking managers… (${progress.checked} / ${progress.total})` : 'Checking managers, one moment…'}
        </div>
      )}
      {result && (
        <div style={{ marginTop: 16 }}>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4, flexWrap: 'wrap' }}>
            <strong>{activeLabel}</strong>
            <div className="dim">
              {result.totalMentions?.toLocaleString()} filing mention(s) found · checked {result.checked} filer(s) ·{' '}
              <span className="pos">{result.buyers} increasing</span> ·{' '}
              <span className="neg">{result.sellers} decreasing</span>
            </div>
          </div>

          {netSummary && (
            <div
              className={`verdict-card ${netSummary.verdict === 'sell' ? 'sell' : ''}`}
              style={{ marginTop: 12 }}
            >
              <div>
                <div className="dim" style={{ marginBottom: 6 }}>
                  Net across all {result.checked} manager(s) checked
                </div>
                <div
                  className={`verdict-big ${
                    netSummary.verdict === 'buy' ? 'buy' : netSummary.verdict === 'sell' ? 'sell' : ''
                  }`}
                >
                  {netSummary.verdict === 'buy' && '▲ NET BUY'}
                  {netSummary.verdict === 'sell' && '▼ NET SELL'}
                  {netSummary.verdict === 'neutral' && 'FLAT'}
                </div>
              </div>
              <div className="stats-grid" style={{ minWidth: 320 }}>
                <div className="stat-tile">
                  <div className="label">Total Bought</div>
                  <div className="value buy">+{fmtShares(netSummary.bought)}</div>
                </div>
                <div className="stat-tile">
                  <div className="label">Total Sold</div>
                  <div className="value sell">-{fmtShares(netSummary.sold)}</div>
                </div>
                <div className="stat-tile">
                  <div className="label">Net Shares</div>
                  <div className={`value ${netSummary.verdict === 'buy' ? 'buy' : netSummary.verdict === 'sell' ? 'sell' : ''}`}>
                    {netSummary.net >= 0 ? '+' : ''}
                    {fmtShares(netSummary.net)}
                  </div>
                </div>
              </div>
            </div>
          )}

          <MoversTable title={`Top ${TOP_N} Increases (Most Bought)`} rows={topBuys} tone="pos" />
          <MoversTable title={`Top ${TOP_N} Decreases (Most Sold)`} rows={topSells} tone="neg" />

          <div className="dim" style={{ marginTop: 12, fontSize: 11 }}>
            Coverage note: this comes from EDGAR full-text search for filings mentioning this CUSIP, not a
            guaranteed-complete registry of every holder — very widely-held securities may have more holders than
            were checked. Raise the "Check N" setting above for broader (but slower) coverage.
          </div>
        </div>
      )}
    </div>
  );
}
