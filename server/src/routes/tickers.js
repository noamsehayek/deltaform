import { Router } from 'express';
import {
  resolveTickerOrNameToCusips,
  resolveCusipToTicker,
  setManualTicker,
  searchFullTextForCusip,
  getCusipIndexStats,
} from '../lib/cusipResolver.js';
import { bootstrapTicker } from '../lib/tickerBootstrap.js';

export const tickersRouter = Router();

tickersRouter.get('/resolve', async (req, res, next) => {
  try {
    const q = String(req.query.q || '');
    if (!q.trim()) return res.json({ exact: [], fuzzy: [] });

    let result = await resolveTickerOrNameToCusips(q);

    // Nothing in the persisted index yet — this ticker has never shown up in
    // a filing DeltaForm has parsed. Try to bootstrap it from a real 13F
    // filing found via EDGAR full-text search, then re-check once.
    if (result.exact.length === 0 && result.fuzzy.length === 0) {
      const bootstrapped = await bootstrapTicker(q);
      if (bootstrapped) result = await resolveTickerOrNameToCusips(q);
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
});

tickersRouter.get('/cusip/:cusip', async (req, res, next) => {
  try {
    const info = await resolveCusipToTicker(req.params.cusip.toUpperCase());
    if (!info.ticker) {
      info.fullTextCandidates = await searchFullTextForCusip(req.params.cusip.toUpperCase());
    }
    res.json(info);
  } catch (err) {
    next(err);
  }
});

tickersRouter.post('/map', async (req, res, next) => {
  try {
    const { cusip, ticker } = req.body || {};
    if (!cusip) return res.status(400).json({ error: 'cusip is required' });
    const entry = await setManualTicker(cusip.toUpperCase(), ticker);
    res.json({ cusip: cusip.toUpperCase(), entry });
  } catch (err) {
    next(err);
  }
});

tickersRouter.get('/index-status', async (_req, res, next) => {
  try {
    res.json(await getCusipIndexStats());
  } catch (err) {
    next(err);
  }
});
