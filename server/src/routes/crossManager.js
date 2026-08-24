import { Router } from 'express';
import { crossManagerActivity } from '../lib/crossManagerSearch.js';

export const crossManagerRouter = Router();

crossManagerRouter.get('/:cusip', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    res.json(await crossManagerActivity(req.params.cusip.toUpperCase(), limit));
  } catch (err) {
    next(err);
  }
});
