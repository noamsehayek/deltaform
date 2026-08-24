// Curated shortcuts only — a convenience on top of the real resolver, not a
// substitute for it. Any manager (name or CIK) still works via search above;
// these are just one-click starting points for the most-followed 13F filers.
// CIKs verified against live EDGAR data, including picking the currently
// active filer where a manager has migrated CIKs over time (e.g. BlackRock's
// old filing entity, CIK 1364742, stopped filing after mid-2024 in favor of
// CIK 2012383).
export const POPULAR_MANAGERS = [
  { label: 'BlackRock', cik: '2012383', name: 'BlackRock, Inc.' },
  { label: 'Vanguard', cik: '102909', name: 'VANGUARD GROUP INC' },
  { label: 'State Street', cik: '93751', name: 'STATE STREET CORP' },
  { label: 'Fidelity (FMR)', cik: '315066', name: 'FMR LLC' },
  { label: 'JPMorgan Chase', cik: '19617', name: 'JPMORGAN CHASE & CO' },
  { label: 'Goldman Sachs', cik: '886982', name: 'GOLDMAN SACHS GROUP INC' },
  { label: 'Morgan Stanley', cik: '895421', name: 'MORGAN STANLEY' },
  { label: 'Invesco', cik: '914208', name: 'Invesco Ltd.' },
  { label: 'Bank of America', cik: '70858', name: 'BANK OF AMERICA CORP /DE/' },
  { label: 'Berkshire Hathaway', cik: '1067983', name: 'BERKSHIRE HATHAWAY INC' },
];

export default function PopularManagers({ onSelect, activeCik }) {
  return (
    <div>
      <h2 className="sidebar-heading">Popular Managers</h2>
      <div className="chip-list">
        {POPULAR_MANAGERS.map((m) => (
          <button
            key={m.cik}
            className={`chip ${activeCik === m.cik ? 'active' : ''}`}
            onClick={() => onSelect({ cik: m.cik, name: m.name })}
            title={`CIK ${m.cik}`}
          >
            {m.label}
          </button>
        ))}
      </div>
    </div>
  );
}
