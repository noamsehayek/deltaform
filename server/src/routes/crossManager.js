import { Router } from 'express';
import { crossManagerActivity, getCrossManagerProgress } from '../lib/crossManagerSearch.js';

export const crossManagerRouter = Router();

// Polled by the frontend while a search is in flight — total search time is
// bounded by SEC's rate limit, so this just makes the wait legible rather
// than making it shorter.
crossManagerRouter.get('/:cusip/progress', (req, res) => {
  res.json(getCrossManagerProgress(req.params.cusip.toUpperCase()) || { checked: 0, total: 0 });
});

crossManagerRouter.get('/:cusip', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    res.json(await crossManagerActivity(req.params.cusip.toUpperCase(), limit));
  } catch (err) {
    next(err);
  }
});
