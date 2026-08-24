// Minimal inline icon set — no icon library dependency, all inherit color via currentColor.
const base = { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };

export function SearchIcon(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

export function StarIcon({ filled, ...props }) {
  return (
    <svg {...base} fill={filled ? 'currentColor' : 'none'} {...props}>
      <polygon points="12 2.5 15.1 8.8 22 9.8 17 14.6 18.2 21.5 12 18.2 5.8 21.5 7 14.6 2 9.8 8.9 8.8 12 2.5" />
    </svg>
  );
}

export function DownloadIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3v12" />
      <path d="M7 10l5 5 5-5" />
      <path d="M4 20h16" />
    </svg>
  );
}

export function BuildingIcon(props) {
  return (
    <svg {...base} {...props}>
      <rect x="4" y="3" width="16" height="18" rx="1" />
      <line x1="9" y1="8" x2="9" y2="8" />
      <line x1="9" y1="12" x2="9" y2="12" />
      <line x1="9" y1="16" x2="9" y2="16" />
      <line x1="15" y1="8" x2="15" y2="8" />
      <line x1="15" y1="12" x2="15" y2="12" />
      <line x1="15" y1="16" x2="15" y2="16" />
    </svg>
  );
}

export function ArrowUpIcon(props) {
  return (
    <svg {...base} {...props}>
      <line x1="12" y1="19" x2="12" y2="5" />
      <path d="M5 12l7-7 7 7" />
    </svg>
  );
}

export function ArrowDownIcon(props) {
  return (
    <svg {...base} {...props}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <path d="M19 12l-7 7-7-7" />
    </svg>
  );
}

export function BoltIcon(props) {
  return (
    <svg {...base} fill="currentColor" stroke="none" {...props}>
      <polygon points="13 2 3 14 11 14 9 22 21 10 13 10 13 2" />
    </svg>
  );
}

export function LinkIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M9 17H7a5 5 0 0 1 0-10h2" />
      <path d="M15 7h2a5 5 0 1 1 0 10h-2" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  );
}
