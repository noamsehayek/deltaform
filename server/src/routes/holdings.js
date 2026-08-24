import { Router } from 'express';
import { getFilingHoldings } from '../lib/holdingsService.js';

export const holdingsRouter = Router();

holdingsRouter.get('/:cik/:accession', async (req, res, next) => {
  try {
    const { cik, accession } = req.params;
    const includeOptionsBonds = req.query.includeOptionsBonds === 'true';
    const result = await getFilingHoldings(cik, accession);
    res.json({
      sourceFile: result.sourceFile,
      format: result.format,
      rawRowCount: result.rawRowCount,
      common: result.rows.common,
      ...(includeOptionsBonds ? { options: result.rows.options, bonds: result.rows.bonds } : {}),
    });
  } catch (err) {
    next(err);
  }
});
