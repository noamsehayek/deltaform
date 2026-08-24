export default function Footer() {
  return (
    <div className="footer">
      13F filings only cover long-only US equity positions of institutional managers with $100M+ AUM, and may be
      filed up to 45 days after quarter-end — a "recent" quarter here can still be over a month stale. Short
      positions and funds below the reporting threshold are entirely invisible to this data. Options rows for
      market-maker / broker-dealer filers frequently represent hedging inventory from client order flow, not a
      directional bet — treat option deltas from those filers with extra caution. Share and value figures are
      exactly what each manager self-reported; DeltaForm does not independently verify them. Known data-quality
      quirk: SEC's current spec says the value field is whole US dollars, and large filers follow that, but some
      smaller or older filings still report it in thousands (the legacy paper-form convention) with no reliable
      way to auto-detect which one was used — a $ figure that looks off by ~1000x for a given filer is almost
      always this, not a DeltaForm bug. Share counts are unaffected.
    </div>
  );
}
