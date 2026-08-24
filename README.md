# DeltaForm

*by Noam Sehayek*

Quarter-over-quarter analysis of institutional 13F holdings, pulled live from SEC EDGAR. Works for any institutional manager and any security — there is no hardcoded watchlist. Enter a manager (name or CIK), pick two quarters, and see NET BUY / NET SELL verdicts, top-10 buys and sells, a diverging bar chart, and aggregate stats.

```
┌───────────────────────────────┐        ┌─────────────────────────────┐
│  React + Vite (client/)       │  HTTP  │  Node/Express (server/)     │
│  dark terminal UI, Recharts   │ ─────► │  proxy + cache + resolvers  │◄──── SEC EDGAR
└───────────────────────────────┘        └─────────────────────────────┘
```

The backend exists because it solves three real problems: SEC EDGAR blocks browser CORS requests, filings need to be cached on disk (SEC rate-limits to ~10 req/sec), and the CUSIP↔ticker and CIK filer indexes need somewhere to live and grow over time.

## Setup

Requires Node.js 18+ (native `fetch` and `--watch`).

1. **Set your SEC contact email.** SEC EDGAR rejects every request without a real contact email in the `User-Agent` header (HTTP 403).

   ```bash
   cp server/.env.example server/.env
   ```

   Edit `server/.env`:

   ```
   SEC_CONTACT_EMAIL=your-name@example.com
   PORT=8787
   ```

2. **Install and run everything with one command** from the repo root:

   ```bash
   npm run install:all
   npm run dev
   ```

   This starts the Express API on `http://localhost:8787` and the Vite dev server on `http://localhost:5173` (which proxies `/api/*` to the backend — no CORS issues in dev). Open `http://localhost:5173`.

On first boot with a valid contact email, the server kicks off a **background ingest** of the last 12 quarters of SEC's `master.idx` filing indexes (`https://www.sec.gov/Archives/edgar/full-index/...`) to build the local 13F-filer universe used for fuzzy name search. This takes a minute or two and does not block the API — search works immediately via raw CIK and live EDGAR lookups while it runs. Check progress:

```
GET http://localhost:8787/api/managers/index-status
```

## Using it

1. Type a manager name (e.g. `Berkshire Hathaway`) or a raw CIK (e.g. `0001067983`) — raw CIK always works even before the local index is built.
2. Pick two quarters (defaults to the two most recent 13F-HR filings).
3. Use **Ticker / Issuer Lookup** to jump straight to a NET BUY / NET SELL verdict for a specific ticker, issuer name, or CUSIP.
4. Browse the diverging bar chart (sells left/red, buys right/green), the aggregate stats tiles, and the sortable Common Stock / Options / Bonds tables. Export any table to CSV.
5. Star a manager or a holding to pin it to the sidebar watchlist (stored in `localStorage`).
6. Use **Who's Buying / Selling This CUSIP?** to search across *all* managers for a given CUSIP (via EDGAR full-text search), each diffed against their own prior quarter.

If a holding shows no ticker, click **map ticker** to manually confirm/correct the CUSIP↔ticker mapping — this is persisted to disk and reused everywhere.

## How ticker/CUSIP resolution works

13F holdings only ever carry CUSIP + issuer name — never a ticker. DeltaForm resolves tickers through layered sources, in priority order:

1. **`company_tickers.json`** — SEC's official ticker→CIK→name map for operating companies.
2. **EDGAR full-text search** — best-effort fallback: searches 13F filing text for a raw CUSIP string to surface candidate issuer names when the other layers come up empty.
3. **A persisted, self-growing CUSIP index** (`server/data/cusip-index.json`) — every filing DeltaForm ever parses feeds its (CUSIP, issuer name) pairs into this index, cross-referencing normalized issuer names against `company_tickers.json`. It gets better the more you use the app.
4. **Manual confirmation** — when auto-matching is ambiguous or wrong (rebrands, foreign issuers, a 13F name that doesn't match the listing name — e.g. Cipher Mining files as "Cipher Digital"), click **map ticker** in the holdings table. This always wins over auto-matches and is persisted.

If a ticker can't be resolved at all, the UI never silently returns nothing — it falls back to fuzzy issuer-name matching so you can pick the right row yourself.

## Manager (CIK) resolution

- A raw CIK is always accepted and always works — it's the guaranteed fallback.
- Name search combines a **persisted local index** (built by ingesting SEC's quarterly `master.idx` full-index files, filtered to `13F-HR` filers — so *every* filer who has ever submitted a 13F is discoverable, not a hardcoded few) with a **live** `browse-edgar` company search for freshness. Results are merged and deduplicated.

## Data-handling rules (the parts that are easy to get wrong)

- **Common stock only by default.** A row counts as common stock only if `sshPrnamtType == "SH"` AND `putCall` is empty. Options (`Put`/`Call`) and bond principal amounts (`PRN`) are routed to separate, clearly labeled sections — never treated as share counts. Toggle between Common / Options / Bonds tabs in the UI.
- **Matching is always by CUSIP, never by name.** Name-matching across quarters would double-count a rebrand as an exit + a new buy. A rebrand or CUSIP change correctly shows as an EXIT paired with a NEW position — see `server/tests/rebrand.test.js`.
- **Multiple rows sharing a CUSIP within one filing are summed.** Different voting-discretion classes for the same position appear as separate `<infoTable>` rows and are merged — see `server/tests/cusipMerge.test.js`.
- **Value ≠ shares**, and they're never conflated. That said: see the known data-quality caveat below.
- **CUSIPs that look like numbers are handled carefully.** Some real CUSIPs (e.g. `08862E102`) look like scientific notation to a naive XML parser and get silently corrupted into `8.862E+102` if you're not careful. DeltaForm parses all XML tag values as strings and converts numeric fields manually to avoid this.

### Known data-quality quirk: `<value>` units are inconsistent across real filings

SEC's current 13F XML technical specification says `<value>` is whole US dollars, and large, well-formed filers (verified against live Berkshire Hathaway data) report it that way. But plenty of real filings — often smaller or older ones — still populate it using the legacy paper-form convention of **thousands of dollars**, and EDGAR does not reject this. There is no reliable way to detect which convention a given filing used without an external share-price reference (out of scope here). DeltaForm reports `value` exactly as filed. **If a dollar figure for some filer looks off by roughly 1000x, this is almost always why — not a bug in DeltaForm.** Share counts are unaffected either way, which is why DeltaForm's default sort and top-10 buy/sell ranking is by share count, not dollar value.

## API reference (backend)

| Endpoint | Purpose |
| --- | --- |
| `GET /api/managers/search?q=` | Resolve a name or CIK to candidate filers |
| `GET /api/managers/:cik/filings` | List a filer's 13F-HR filings |
| `GET /api/holdings/:cik/:accession` | Parsed, CUSIP-merged holdings for one filing |
| `GET /api/compare/:cik?accessionA=&accessionB=&sortBy=` | Full quarter-over-quarter diff |
| `GET /api/tickers/resolve?q=` | Ticker/name → candidate CUSIPs |
| `GET /api/tickers/cusip/:cusip` | CUSIP → known ticker/name |
| `POST /api/tickers/map` | Manually confirm/correct a CUSIP↔ticker mapping |
| `GET /api/cross-manager/:cusip?limit=` | "Who's buying/selling this CUSIP?" across all filers |

## Tests

```bash
npm test
```

Runs `server/tests/*` against fixture 13F XML (`server/fixtures/`), covering:

- **`cusipMerge.test.js`** — rows sharing a CUSIP within one filing are correctly summed.
- **`shFiltering.test.js`** — common stock / bonds (`PRN`) / options (`Put`/`Call`) are correctly separated and never conflated with each other or with dollar value.
- **`rebrand.test.js`** — a CUSIP change across quarters is treated as EXIT + NEW, never netted or double-counted, and rolls up correctly into aggregate stats.

## Caching and rate limits

Every SEC request goes through `server/src/lib/secClient.js`, which:

- Sends `User-Agent: DeltaForm/1.0 (<your email>)` on every request (SEC returns 403 without this).
- Globally throttles all outbound SEC requests to ~9/sec, under SEC's fair-access guidance.
- Caches responses to disk under `server/cache/` — filings addressed by accession number are immutable and cached forever; submissions JSON is cached for 6 hours.

Delete `server/cache/` and `server/data/` to force a clean rebuild.

## Desktop packaging (optional)

DeltaForm is a normal web app in dev, but it packages cleanly as a desktop app since the backend is a local Node process anyway.

### Tauri (recommended — smaller binaries, no bundled Chromium)

1. Install the Tauri CLI and Rust toolchain: follow [tauri.app/start/prerequisites](https://tauri.app/start/prerequisites/).
2. From `client/`:
   ```bash
   npm install --save-dev @tauri-apps/cli
   npx tauri init
   ```
   When prompted:
   - App name: `DeltaForm`
   - Dev server URL: `http://localhost:5173`
   - Frontend dist dir: `dist`
   - Frontend dev command: `npm run dev`
   - Frontend build command: `npm run build`
3. Tauri only wraps the frontend — it has no idea about the Express backend. Use Tauri's [sidecar](https://tauri.app/develop/sidecar/) feature to bundle and spawn `server/` as a child process on app startup: point `tauri.conf.json`'s `bundle.externalBin` at a packaged Node executable (e.g. via [`pkg`](https://github.com/vercel/pkg) or [`nexe`](https://github.com/nexe/nexe) run against `server/src/index.js`), and spawn it from `src-tauri/src/main.rs` before the window loads.
4. `npx tauri build` from `client/` produces a native installer per platform.

### Electron (simpler, larger binaries)

1. From the repo root:
   ```bash
   npm install --save-dev electron electron-builder
   ```
2. Add an `electron/main.js` that spawns `node server/src/index.js` as a child process, waits for `http://localhost:8787/api/health` to respond, then opens a `BrowserWindow` pointed at the built `client/dist/index.html` (or `http://localhost:5173` in dev).
3. Add a root `package.json` script: `"electron": "electron electron/main.js"`, and use `electron-builder` to produce installers.

Either path, the SEC contact email still needs to be configured — ship the app with a `server/.env` written at first launch (e.g. prompt the user for it in a settings screen) rather than baking your own email into a distributed binary.

## Caveats (also shown in the app footer)

13F filings only cover **long-only US equity positions** of institutional managers with **$100M+ AUM**, and may be filed up to **45 days after quarter-end** — a "recent" quarter can still be over a month stale. **Short positions and sub-threshold funds are entirely invisible** to this data. Options rows for market-maker/broker-dealer filers frequently represent **hedging inventory from client order flow, not a directional bet**. Share and value figures are exactly what each manager self-reported and are not independently verified.
