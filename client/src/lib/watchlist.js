const KEY = 'deltaform.watchlist.v1';

export function loadWatchlist() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || [];
  } catch {
    return [];
  }
}

export function saveWatchlist(list) {
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function addToWatchlist(item) {
  const list = loadWatchlist();
  const key = item.type === 'manager' ? `manager:${item.cik}` : `ticker:${item.cusip}`;
  if (list.some((i) => (i.type === 'manager' ? `manager:${i.cik}` : `ticker:${i.cusip}`) === key)) return list;
  const next = [...list, item];
  saveWatchlist(next);
  return next;
}

export function removeFromWatchlist(index) {
  const list = loadWatchlist();
  const next = list.filter((_, i) => i !== index);
  saveWatchlist(next);
  return next;
}
