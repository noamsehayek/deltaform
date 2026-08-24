import { useState } from 'react';
import { api } from '../lib/api.js';
import { SearchIcon, BuildingIcon } from './Icons.jsx';

export default function ManagerSearch({ onSelect }) {
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function search(e) {
    e?.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.searchManagers(query);
      if (result.error) {
        setError(result.error);
        setCandidates([]);
      } else if (result.candidates.length === 0) {
        setError('No matches in the local filer index or live search. Try a raw CIK number instead.');
        setCandidates([]);
      } else {
        setCandidates(result.candidates);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="panel">
      <h2>Manager</h2>
      <form className="row" onSubmit={search}>
        <div className="input-with-icon" style={{ flex: 1, minWidth: 260 }}>
          <SearchIcon className="input-icon" />
          <input
            type="text"
            placeholder="Manager name or CIK (e.g. Berkshire Hathaway or 0001067983)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button type="submit" className="primary" disabled={loading}>
          {loading ? 'Searching…' : 'Search'}
        </button>
      </form>
      {error && <div className="error-banner" style={{ marginTop: 10 }}>{error}</div>}
      {candidates.length > 0 && (
        <ul className="candidate-list">
          {candidates.map((c) => (
            <li
              key={c.cik}
              onClick={() => {
                onSelect({ cik: c.cik, name: c.name });
                setCandidates([]);
                setQuery(c.name);
              }}
            >
              <span className="row" style={{ gap: 8 }}>
                <BuildingIcon className="dim" />
                {c.name}
              </span>
              <span className="dim">CIK {c.cik} · {c.source}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
