import type { Timeframe } from '@/core/types';
import { candlesFor, detailFor, getUniverse, priceAt } from '@/data/providers/mock/universe';

/**
 * The demo generator is the only data most people will ever see MOVA render, so
 * its output has to stay inside the bounds a real Solana market occupies. These
 * are the invariants that a plausible universe must satisfy — each one is here
 * because breaking it produced something visibly wrong on screen.
 */

const STEP_MS: Record<Timeframe, number> = {
  '5m': 5 * 60_000,
  '15m': 15 * 60_000,
  '1h': 3_600_000,
  '4h': 4 * 3_600_000,
  '1d': 24 * 3_600_000,
};

const TIMEFRAMES = Object.keys(STEP_MS) as Timeframe[];

describe('mock universe', () => {
  const universe = getUniverse('test-seed');

  it('produces a non-trivial set of tokens', () => {
    expect(universe.length).toBeGreaterThan(10);
  });

  it('keeps every market cap inside a plausible range', () => {
    // Drift used to compound across a token's whole age, which pushed
    // months-old tokens orders of magnitude past their tier and produced caps
    // in the trillions.
    for (const token of universe) {
      const cap = priceAt(token, Date.now()) * token.supply;
      expect(Number.isFinite(cap)).toBe(true);
      expect(cap).toBeGreaterThan(0);
      expect(cap).toBeLessThan(50e9);
    }
  });

  it('keeps prices positive and finite across a token lifetime', () => {
    const now = Date.now();
    for (const token of universe.slice(0, 8)) {
      for (const offset of [0, 3_600_000, 24 * 3_600_000, 30 * 24 * 3_600_000]) {
        const price = priceAt(token, now - offset);
        expect(Number.isFinite(price)).toBe(true);
        expect(price).toBeGreaterThan(0);
      }
    }
  });

  it('reports transaction counts a real pair could actually produce', () => {
    // Average trade size used to be flat regardless of token size, implying
    // millions of transactions a day on the larger pairs.
    for (const token of universe) {
      const { market } = detailFor(token);
      const total = (market.txns24h.buys ?? 0) + (market.txns24h.sells ?? 0);
      expect(total).toBeLessThan(1_000_000);
    }
  });
});

describe('candlesFor', () => {
  const universe = getUniverse('test-seed');
  const now = Date.now();

  it('never emits a candle that ended before the token existed', () => {
    // Pre-launch buckets all resolved to base price, drawing a dead-flat line
    // across most of a young token's chart.
    for (const token of universe) {
      for (const tf of TIMEFRAMES) {
        for (const candle of candlesFor(token, tf, 120, now)) {
          expect(candle.t + STEP_MS[tf]).toBeGreaterThan(token.createdAt);
        }
      }
    }
  });

  it('returns a shorter series for a token younger than the window', () => {
    const young = universe
      .map((t) => ({ t, ageHours: (now - t.createdAt) / 3_600_000 }))
      .filter((x) => x.ageHours < 100)
      .sort((a, b) => a.ageHours - b.ageHours)[0];

    // The catalogue always contains fresh launches; if it stops doing so this
    // assertion should be revisited rather than deleted.
    expect(young).toBeDefined();
    if (!young) return;

    // 120 one-hour buckets is five days of history, which a young token cannot have.
    expect(candlesFor(young.t, '1h', 120, now).length).toBeLessThan(120);
  });

  it('produces ordered candles with coherent OHLC', () => {
    for (const token of universe.slice(0, 10)) {
      const candles = candlesFor(token, '1h', 60, now);
      let previous = -Infinity;
      for (const c of candles) {
        expect(c.t).toBeGreaterThan(previous);
        previous = c.t;
        expect(c.h).toBeGreaterThanOrEqual(c.l);
        expect(c.h).toBeGreaterThanOrEqual(c.o);
        expect(c.h).toBeGreaterThanOrEqual(c.c);
        expect(c.l).toBeLessThanOrEqual(c.o);
        expect(c.l).toBeLessThanOrEqual(c.c);
        expect(c.v).toBeGreaterThanOrEqual(0);
        for (const v of [c.o, c.h, c.l, c.c]) expect(Number.isFinite(v)).toBe(true);
      }
    }
  });

  it('still returns something for the longest timeframe on every token', () => {
    for (const token of universe) {
      expect(candlesFor(token, '1d', 120, now).length).toBeGreaterThan(0);
    }
  });
});
