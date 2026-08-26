async function request(path, opts) {
  const res = await fetch(`/api${path}`, opts);
  const contentType = res.headers.get('content-type') || '';
  const body = contentType.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) {
    const message = typeof body === 'object' && body?.error ? body.error : `Request failed: ${res.status}`;
    throw new Error(message);
  }
  return body;
}

export const api = {
  health: () => request('/health'),
  searchManagers: (q) => request(`/managers/search?q=${encodeURIComponent(q)}`),
  managerFilings: (cik) => request(`/managers/${cik}/filings`),
  indexStatus: () => request('/managers/index-status'),
  compare: (cik, { accessionA, accessionB, sortBy } = {}) => {
    const params = new URLSearchParams();
    if (accessionA) params.set('accessionA', accessionA);
    if (accessionB) params.set('accessionB', accessionB);
    if (sortBy) params.set('sortBy', sortBy);
    const qs = params.toString();
    return request(`/compare/${cik}${qs ? `?${qs}` : ''}`);
  },
  resolveTicker: (q) => request(`/tickers/resolve?q=${encodeURIComponent(q)}`),
  resolveCusip: (cusip) => request(`/tickers/cusip/${encodeURIComponent(cusip)}`),
  setManualTicker: (cusip, ticker) =>
    request('/tickers/map', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cusip, ticker }),
    }),
  startCrossManager: (cusip, limit) =>
    request(`/cross-manager/${encodeURIComponent(cusip)}/start?limit=${limit || 15}`, { method: 'POST' }),
  crossManagerResult: (cusip) => request(`/cross-manager/${encodeURIComponent(cusip)}/result`),
  crossManagerProgress: (cusip) => request(`/cross-manager/${encodeURIComponent(cusip)}/progress`),
};
