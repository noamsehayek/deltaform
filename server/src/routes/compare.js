import { Router } from 'express';
import { listFilings, getFilingHoldings, findFiling } from '../lib/holdingsService.js';
import { computeCompare, verdictFor } from '../lib/compareEngine.js';
import { resolveCusipToTicker } from '../lib/cusipResolver.js';

export const compareRouter = Router();

async function enrichWithTickers(rows) {
  await Promise.all(
    rows.map(async (r) => {
      const t = await resolveCusipToTicker(r.cusip);
      r.ticker = t.ticker;
    })
  );
  return rows;
}

compareRouter.get('/:cik', async (req, res, next) => {
  try {
    const { cik } = req.params;
    const sortBy = req.query.sortBy === 'value' ? 'value' : 'shares';
    const { manager, filings } = await listFilings(cik);

    let filingMetaA, filingMetaB;
    if (req.query.accessionA && req.query.accessionB) {
      filingMetaA = findFiling(filings, req.query.accessionA);
      filingMetaB = findFiling(filings, req.query.accessionB);
    } else {
      if (filings.length < 2) {
        return res.status(404).json({
          error: `Only one 13F-HR filing exists for ${manager.name} — need at least two quarters to compare.`,
        });
      }
      // filings sorted most-recent-first by listFilings()
      filingMetaB = filings[0];
      filingMetaA = filings[1];
    }

    const [holdingsA, holdingsB] = await Promise.all([
      getFilingHoldings(cik, filingMetaA.accessionNumber),
      getFilingHoldings(cik, filingMetaB.accessionNumber),
    ]);

    const compare = computeCompare(
      { ...filingMetaA, rows: holdingsA.rows },
      { ...filingMetaB, rows: holdingsB.rows },
      { sortBy }
    );

    await Promise.all([
      enrichWithTickers(compare.common.rows),
      enrichWithTickers(compare.options.rows),
      enrichWithTickers(compare.bonds.rows),
    ]);

    res.json({ manager, ...compare });
  } catch (err) {
    next(err);
  }
});

compareRouter.get('/:cik/verdict/:cusip', async (req, res, next) => {
  try {
    const { cik, cusip } = req.params;
    const { filings } = await listFilings(cik);
    const filingMetaA = req.query.accessionA ? findFiling(filings, req.query.accessionA) : filings[1];
    const filingMetaB = req.query.accessionB ? findFiling(filings, req.query.accessionB) : filings[0];

    const [holdingsA, holdingsB] = await Promise.all([
      getFilingHoldings(cik, filingMetaA.accessionNumber),
      getFilingHoldings(cik, filingMetaB.accessionNumber),
    ]);
    const compare = computeCompare(
      { ...filingMetaA, rows: holdingsA.rows },
      { ...filingMetaB, rows: holdingsB.rows }
    );
    res.json(verdictFor(compare.common.rows, cusip.toUpperCase()));
  } catch (err) {
    next(err);
  }
});
