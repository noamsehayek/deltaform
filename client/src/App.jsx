import { useEffect, useState, useCallback } from 'react';
import { api } from './lib/api.js';
import { loadWatchlist, addToWatchlist, removeFromWatchlist } from './lib/watchlist.js';
import ManagerSearch from './components/ManagerSearch.jsx';
import QuarterPicker from './components/QuarterPicker.jsx';
import StatsPanel from './components/StatsPanel.jsx';
import DivergingBarChart from './components/DivergingBarChart.jsx';
import HoldingsTable from './components/HoldingsTable.jsx';
import TickerLookup from './components/TickerLookup.jsx';
import Watchlist from './components/Watchlist.jsx';
import PopularManagers from './components/PopularManagers.jsx';
import CrossManagerPanel from './components/CrossManagerPanel.jsx';
import Footer from './components/Footer.jsx';

export default function App() {
  const [manager, setManager] = useState(null);
  const [filings, setFilings] = useState([]);
  const [accessionA, setAccessionA] = useState('');
  const [accessionB, setAccessionB] = useState('');
  const [sortBy, setSortBy] = useState('shares');
  const [tab, setTab] = useState('common');
  const [compare, setCompare] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [watchlist, setWatchlist] = useState(loadWatchlist());
  const [health, setHealth] = useState(null);

  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth({ ok: false }));
  }, []);

  const selectManager = useCallback(async (m) => {
    setManager(m);
    setCompare(null);
    setError(null);
    setLoading(true);
    // Clear stale accessions synchronously — otherwise the compare effect can
    // briefly fire for the new manager's CIK using the previous manager's
    // accession numbers while the new filing list is still loading.
    setFilings([]);
    setAccessionA('');
    setAccessionB('');
    try {
      const res = await api.managerFilings(m.cik);
      setFilings(res.filings);
      if (res.filings.length >= 2) {
        setAccessionB(res.filings[0].accessionNumber);
        setAccessionA(res.filings[1].accessionNumber);
      } else if (res.filings.length === 1) {
        setAccessionB(res.filings[0].accessionNumber);
        setAccessionA(res.filings[0].accessionNumber);
        setError('Only one 13F-HR filing exists for this filer — need at least two quarters to compare.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const runCompare = useCallback(async () => {
    if (!manager || !accessionA || !accessionB) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.compare(manager.cik, { accessionA, accessionB, sortBy });
      setCompare(res);
    } catch (err) {
      setError(err.message);
      setCompare(null);
    } finally {
      setLoading(false);
    }
  }, [manager, accessionA, accessionB, sortBy]);

  useEffect(() => {
    if (manager && accessionA && accessionB && accessionA !== accessionB) {
      runCompare();
    }
  }, [manager, accessionA, accessionB, sortBy, runCompare]);

  function onWatchManager() {
    if (!manager) return;
    setWatchlist(addToWatchlist({ type: 'manager', cik: manager.cik, name: manager.name }));
  }

  function onWatchTicker(item) {
    setWatchlist(addToWatchlist(item));
  }

  function onRemoveWatch(i) {
    setWatchlist(removeFromWatchlist(i));
  }

  const section = compare ? compare[tab] : null;

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="logo">
          <div className="brand-row">
            <div className="mark">Δ</div>
            <div className="wordmark">DeltaForm</div>
          </div>
          <small>by Noam Sehayek · 13F holdings delta</small>
        </div>
        <div className="status-row">
          <span className={`status-dot ${health ? (health.ok ? 'ok' : 'err') : ''}`} />
          {health ? (health.ok ? 'SEC EDGAR connected' : 'Contact email not set') : 'Checking status…'}
        </div>
        {health && !health.ok && health.contactEmailConfigured === false && (
          <div className="error-banner">
            SEC contact email is not set. Add SEC_CONTACT_EMAIL to server/.env and restart the server.
          </div>
        )}
        <PopularManagers onSelect={selectManager} activeCik={manager?.cik} />

        <Watchlist
          items={watchlist}
          onRemove={onRemoveWatch}
          onOpenManager={(item) => selectManager({ cik: item.cik, name: item.name })}
          onOpenTicker={() => {}}
        />
      </aside>

      <main className="main">
        <ManagerSearch onSelect={selectManager} />

        {manager && filings.length > 0 && (
          <div className="panel">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div>
                <strong>{manager.name}</strong> <span className="dim">CIK {manager.cik}</span>
              </div>
              <button onClick={onWatchManager}>★ Watch manager</button>
            </div>
          </div>
        )}

        {manager && filings.length > 0 && (
          <QuarterPicker
            filings={filings}
            accessionA={accessionA}
            accessionB={accessionB}
            onChange={(a, b) => {
              setAccessionA(a);
              setAccessionB(b);
            }}
          />
        )}

        {error && <div className="error-banner">{error}</div>}
        {loading && <div className="loading">Loading from SEC EDGAR…</div>}

        {compare && (
          <>
            <TickerLookup rows={compare.common.rows} />

            <div className="panel">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div className="filing-meta">
                  Comparing {compare.filingA.period} (filed {compare.filingA.filingDate}, accession{' '}
                  {compare.filingA.accession}) → {compare.filingB.period} (filed {compare.filingB.filingDate},
                  accession {compare.filingB.accession})
                </div>
                <div className="toggle-group">
                  <button className={sortBy === 'shares' ? 'active' : ''} onClick={() => setSortBy('shares')}>
                    Sort: Shares
                  </button>
                  <button className={sortBy === 'value' ? 'active' : ''} onClick={() => setSortBy('value')}>
                    Sort: $ Value
                  </button>
                </div>
              </div>
            </div>

            <StatsPanel stats={compare.common.stats} />
            <DivergingBarChart buys={compare.common.buys} sells={compare.common.sells} sortBy={sortBy} />

            <div className="tabs">
              {['common', 'options', 'bonds'].map((t) => (
                <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
                  {t === 'common' ? 'Common Stock' : t === 'options' ? 'Options' : 'Bonds / Other'} (
                  {compare[t].rows.length})
                </button>
              ))}
            </div>
            {section && (
              <HoldingsTable
                section={section}
                title={tab === 'common' ? 'Common Stock Holdings' : tab === 'options' ? 'Options (Put/Call)' : 'Bonds / Principal Amount'}
                onWatch={onWatchTicker}
                onTickerMapped={runCompare}
              />
            )}

            <CrossManagerPanel />
          </>
        )}

        <Footer />
      </main>
    </div>
  );
}
