import { Router } from 'express';
import { resolveManager } from '../lib/cikResolver.js';
import { listFilings } from '../lib/holdingsService.js';
import { getFilerIndexStats, getIngestStatus, triggerBackgroundIngest } from '../lib/edgarFullIndex.js';

export const managersRouter = Router();

managersRouter.get('/search', async (req, res, next) => {
  try {
    const q = String(req.query.q || '');
    if (!q.trim()) return res.json({ type: 'none', candidates: [] });
    const result = await resolveManager(q);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

managersRouter.get('/index-status', async (_req, res, next) => {
  try {
    res.json({ ...(await getFilerIndexStats()), ingest: getIngestStatus() });
  } catch (err) {
    next(err);
  }
});

managersRouter.post('/index-status/rebuild', (req, res) => {
  const quarters = Number(req.body?.quarters) || 12;
  res.json(triggerBackgroundIngest(quarters));
});

managersRouter.get('/:cik/filings', async (req, res, next) => {
  try {
    const { manager, filings } = await listFilings(req.params.cik);
    res.json({
      manager,
      filings: filings.map((f) => ({
        accessionNumber: f.accessionNumber,
        form: f.form,
        periodOfReport: f.periodOfReport,
        filingDate: f.filingDate,
        primaryDocument: f.primaryDocument,
      })),
    });
  } catch (err) {
    next(err);
  }
});
