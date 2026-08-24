export default function QuarterPicker({ filings, accessionA, accessionB, onChange }) {
  return (
    <div className="panel">
      <h2>Quarters to compare</h2>
      <div className="row">
        <label className="dim">
          Earlier
          <br />
          <select value={accessionA} onChange={(e) => onChange(e.target.value, accessionB)}>
            {filings.map((f) => (
              <option key={f.accessionNumber} value={f.accessionNumber}>
                {f.periodOfReport} (filed {f.filingDate})
              </option>
            ))}
          </select>
        </label>
        <span style={{ marginTop: 18 }}>→</span>
        <label className="dim">
          Later
          <br />
          <select value={accessionB} onChange={(e) => onChange(accessionA, e.target.value)}>
            {filings.map((f) => (
              <option key={f.accessionNumber} value={f.accessionNumber}>
                {f.periodOfReport} (filed {f.filingDate})
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
