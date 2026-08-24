export default function Skeleton() {
  return (
    <div>
      <div className="panel">
        <div className="skeleton-line" style={{ width: '55%', height: 12 }} />
        <div className="stats-grid" style={{ marginTop: 16 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div className="stat-tile" key={i}>
              <div className="skeleton-line" style={{ width: '60%', height: 8 }} />
              <div className="skeleton-line" style={{ width: '40%', height: 16, marginTop: 8 }} />
            </div>
          ))}
        </div>
      </div>
      <div className="panel">
        <div className="skeleton-line" style={{ width: '30%', height: 12, marginBottom: 16 }} />
        {Array.from({ length: 6 }).map((_, i) => (
          <div className="skeleton-line" style={{ width: `${90 - i * 8}%`, height: 14, marginBottom: 10 }} key={i} />
        ))}
      </div>
    </div>
  );
}
