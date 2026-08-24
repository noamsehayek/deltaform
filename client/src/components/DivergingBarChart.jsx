import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
} from 'recharts';

const MAX_LABEL_LEN = 14;

// Recharts wraps a category label onto multiple lines when it doesn't fit
// the YAxis width, and those extra lines spill into neighboring rows since
// row height doesn't account for wrapping — the exact garbled overlap this
// was causing for long unresolved issuer names ("COTERRA ENERGY INC", etc).
// Truncating guarantees a single line; the full name still shows in the tooltip.
function truncate(s) {
  return s.length > MAX_LABEL_LEN ? `${s.slice(0, MAX_LABEL_LEN - 1)}…` : s;
}

function label(row) {
  return truncate(row.ticker || row.nameOfIssuer || row.cusip);
}

function fullLabel(row) {
  return `${row.nameOfIssuer}${row.ticker ? ` (${row.ticker})` : ''}`;
}

function fmt(n) {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(0);
}

export default function DivergingBarChart({ buys, sells, sortBy }) {
  const field = sortBy === 'value' ? 'valueDelta' : 'shareDelta';

  // sells rendered as negative bars (left), buys as positive (right)
  const data = [
    ...[...sells].reverse().map((r) => ({ name: label(r), delta: r[field], row: r })),
    ...buys.map((r) => ({ name: label(r), delta: r[field], row: r })),
  ];

  if (data.length === 0) {
    return (
      <div className="panel">
        <h2>Top Moves</h2>
        <div className="dim">No buy/sell activity between these two quarters.</div>
      </div>
    );
  }

  return (
    <div className="panel">
      <h2>Top 10 Buys &amp; Sells ({sortBy === 'value' ? 'by $ value' : 'by shares'})</h2>
      <ResponsiveContainer width="100%" height={Math.max(300, data.length * 30)}>
        <BarChart data={data} layout="vertical" margin={{ left: 10, right: 30 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#223035" horizontal={false} />
          <XAxis type="number" tickFormatter={fmt} stroke="#7c8f96" fontSize={11} />
          <YAxis type="category" dataKey="name" width={110} stroke="#7c8f96" fontSize={11} interval={0} />
          <ReferenceLine x={0} stroke="#223035" />
          <Tooltip
            // Recharts merges its own default tooltip style object (which uses
            // longhand `backgroundColor`) with contentStyle — passing the
            // `background` shorthand here let both keys coexist in the final
            // inline style and the shorthand lost, leaving Recharts' default
            // white background visible. Use matching longhand keys throughout.
            contentStyle={{
              backgroundColor: '#10161a',
              border: '1px solid #223035',
              borderRadius: 6,
              padding: '8px 12px',
            }}
            labelStyle={{ color: '#dde8ea', fontWeight: 600, marginBottom: 4 }}
            itemStyle={{ color: '#dde8ea', fontSize: 12, padding: 0 }}
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            labelFormatter={(_, payload) => (payload && payload[0] ? fullLabel(payload[0].payload.row) : '')}
            formatter={(value) => [fmt(value), sortBy === 'value' ? 'Δ Value' : 'Δ Shares']}
          />
          <Bar dataKey="delta" radius={[3, 3, 3, 3]}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.delta >= 0 ? '#3fb68b' : '#e0554e'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
