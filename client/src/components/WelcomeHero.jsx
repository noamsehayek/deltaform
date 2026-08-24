import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { BoltIcon, SearchIcon, LinkIcon } from './Icons.jsx';

export default function WelcomeHero() {
  const [indexStatus, setIndexStatus] = useState(null);

  useEffect(() => {
    api.indexStatus().then(setIndexStatus).catch(() => {});
  }, []);

  return (
    <div className="panel hero-panel">
      <div className="hero-glow" aria-hidden="true" />
      <div className="hero-content">
        <h1 className="hero-title">Track what institutions actually did last quarter.</h1>
        <p className="hero-sub">
          Enter any 13F filer — a name or a raw CIK — and compare two quarters of holdings straight from SEC EDGAR.
          No hardcoded watchlist: every manager who has ever filed a 13F is discoverable.
        </p>
        <div className="hero-steps">
          <div className="hero-step">
            <SearchIcon className="hero-step-icon" />
            <div>
              <strong>Search a manager</strong>
              <div className="dim">Try the sidebar shortcuts, or type any name / CIK above.</div>
            </div>
          </div>
          <div className="hero-step">
            <BoltIcon className="hero-step-icon" />
            <div>
              <strong>Auto-compare two quarters</strong>
              <div className="dim">Defaults to the two most recent — pick any pair.</div>
            </div>
          </div>
          <div className="hero-step">
            <LinkIcon className="hero-step-icon" />
            <div>
              <strong>See the delta</strong>
              <div className="dim">NET BUY / SELL verdicts, top movers, and a full breakdown.</div>
            </div>
          </div>
        </div>
        {indexStatus && (
          <div className="hero-stat-row">
            <span className="status-dot ok" />
            {indexStatus.filerCount?.toLocaleString()} filers indexed from SEC's own quarterly index, growing with
            every search.
          </div>
        )}
      </div>
    </div>
  );
}
