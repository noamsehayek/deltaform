export default function Watchlist({ items, onRemove, onOpenManager, onOpenTicker }) {
  if (items.length === 0) {
    return (
      <div>
        <h2 className="sidebar-heading">Watchlist</h2>
        <div className="dim" style={{ fontSize: 11 }}>
          Star a manager or a holding to pin it here.
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ fontSize: 11, color: '#7c8f96', textTransform: 'uppercase', letterSpacing: 1 }}>Watchlist</h2>
      {items.map((item, i) => (
        <div className="watchlist-item" key={i}>
          <span
            style={{ cursor: 'pointer' }}
            onClick={() => (item.type === 'manager' ? onOpenManager(item) : onOpenTicker(item))}
          >
            {item.type === 'manager' ? item.name : `${item.ticker || item.cusip}`}
          </span>
          <button onClick={() => onRemove(i)}>×</button>
        </div>
      ))}
    </div>
  );
}
