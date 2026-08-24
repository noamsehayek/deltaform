import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PORT, CONTACT_EMAIL } from './config.js';
import { SecFetchError } from './lib/secClient.js';
import { triggerBackgroundIngest } from './lib/edgarFullIndex.js';
import { managersRouter } from './routes/managers.js';
import { holdingsRouter } from './routes/holdings.js';
import { compareRouter } from './routes/compare.js';
import { tickersRouter } from './routes/tickers.js';
import { crossManagerRouter } from './routes/crossManager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, '../../client/dist');
const hasClientBuild = fs.existsSync(path.join(clientDist, 'index.html'));

const app = express();
app.use(cors());
app.use(express.json());

if (hasClientBuild) {
  // Serves the production frontend build so the whole app (UI + API) runs
  // behind a single port — handy for exposing it via a tunnel, since a
  // tunnel only forwards one port. Only activates if `npm run build` has
  // been run in client/; otherwise this is a no-op and dev mode (Vite on
  // :5173 proxying to this API) works exactly as before.
  app.use(express.static(clientDist));
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, contactEmailConfigured: Boolean(CONTACT_EMAIL) });
});

app.use('/api/managers', managersRouter);
app.use('/api/holdings', holdingsRouter);
app.use('/api/compare', compareRouter);
app.use('/api/tickers', tickersRouter);
app.use('/api/cross-manager', crossManagerRouter);

if (hasClientBuild) {
  // SPA fallback: any non-API GET (client-side route) serves index.html.
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Centralized error handling so every SEC/parsing failure reaches the UI as
// an explicit, actionable message rather than a generic 500.
app.use((err, _req, res, _next) => {
  if (err instanceof SecFetchError) {
    return res.status(err.status || 502).json({ error: err.message });
  }
  const status = err.status || 500;
  console.error(err);
  res.status(status).json({ error: err.message || 'Unexpected server error' });
});

app.listen(PORT, () => {
  console.log(`DeltaForm API listening on http://localhost:${PORT}`);
  if (!CONTACT_EMAIL) {
    console.warn(
      'WARNING: SEC_CONTACT_EMAIL is not set (server/.env). All SEC EDGAR requests will fail with 403 until it is configured.'
    );
  } else {
    triggerBackgroundIngest(12);
    console.log('Started background ingest of the last 12 quarters of 13F filer history.');
  }
});
