import { Router } from 'express';
import { startCrossManagerSearch, getCrossManagerResult, getCrossManagerProgress } from '../lib/crossManagerSearch.js';

export const crossManagerRouter = Router();

// Polled by the frontend while a search is in flight — total search time is
// bounded by SEC's rate limit, so this just makes the wait legible rather
// than making it shorter.
crossManagerRouter.get('/:cusip/progress', (req, res) => {
  res.json(getCrossManagerProgress(req.params.cusip.toUpperCase()) || { checked: 0, total: 0 });
});

// Kicks off the search and returns immediately — a wide search can take well
// over a minute (bounded by SEC's rate limit), too long for any single
// request to reliably survive a proxy in front of it. The client polls
// /result the same way it already polls /progress.
crossManagerRouter.post('/:cusip/start', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 30, 100);
  startCrossManagerSearch(req.params.cusip.toUpperCase(), limit);
  res.status(202).json({ started: true });
});

crossManagerRouter.get('/:cusip/result', (req, res) => {
  res.json(getCrossManagerResult(req.params.cusip.toUpperCase()));
});
