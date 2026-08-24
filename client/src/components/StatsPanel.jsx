function fmtShares(n) {
  return new Intl.NumberFormat('en-US').format(Math.round(n));
}

function fmtUsd(n) {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

export default function StatsPanel({ stats }) {
  const tiles = [
    { label: 'Net Share Flow', value: fmtShares(stats.netShareFlow), cls: stats.netShareFlow >= 0 ? 'buy' : 'sell' },
    { label: 'Net Value Flow', value: fmtUsd(stats.netValueFlow), cls: stats.netValueFlow >= 0 ? 'buy' : 'sell' },
    { label: 'Positions Increased', value: stats.buyerCount, cls: 'buy' },
    { label: 'Positions Decreased', value: stats.sellerCount, cls: 'sell' },
    { label: 'New Positions', value: stats.newPositions, cls: 'buy' },
    { label: 'Exits', value: stats.exits, cls: 'sell' },
    { label: 'Total Positions (before)', value: stats.totalPositionsBefore, cls: '' },
    { label: 'Total Positions (after)', value: stats.totalPositionsAfter, cls: '' },
  ];

  return (
    <div className="panel">
      <h2>Aggregate Stats — Common Stock</h2>
      <div className="stats-grid">
        {tiles.map((t) => (
          <div className="stat-tile" key={t.label}>
            <div className="label">{t.label}</div>
            <div className={`value ${t.cls}`}>{t.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
