import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as history from '../services/history.js';

/**
 * Recorded history is what MOVA draws charts from when no OHLCV vendor is
 * configured. Its whole justification is that it only ever shows observations
 * that actually happened, so the tests here are mostly about what it refuses
 * to invent.
 */

const START = 1_760_000_000_000;

beforeEach(() => {
  history.reset();
  vi.useFakeTimers();
  vi.setSystemTime(START);
});

afterEach(() => {
  vi.useRealTimers();
  history.reset();
});

const MINT = 'TokenAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

function tick(ms: number) {
  vi.setSystemTime(Date.now() + ms);
}

describe('record', () => {
  it('stores a valid observation', () => {
    history.record(MINT, 1.5, 1000, 5000);
    expect(history.sampleCount(MINT)).toBe(1);
  });

  it('ignores a price that is missing or nonsensical', () => {
    history.record(MINT, null, 1000, 5000);
    history.record(MINT, 0, 1000, 5000);
    history.record(MINT, -1, 1000, 5000);
    history.record(MINT, Number.NaN, 1000, 5000);
    expect(history.sampleCount(MINT)).toBe(0);
  });

  it('debounces a burst of refreshes', () => {
    history.record(MINT, 1, 0, 0);
    history.record(MINT, 2, 0, 0);
    expect(history.sampleCount(MINT)).toBe(1);

    tick(10_000);
    history.record(MINT, 3, 0, 0);
    expect(history.sampleCount(MINT)).toBe(2);
  });
});

describe('spark', () => {
  it('is empty until something has been observed', () => {
    expect(history.spark(MINT)).toEqual([]);
  });

  it('returns observations oldest first', () => {
    for (const price of [1, 2, 3]) {
      history.record(MINT, price, 0, 0);
      tick(10_000);
    }
    expect(history.spark(MINT)).toEqual([1, 2, 3]);
  });

  it('downsamples without losing the shape', () => {
    for (let i = 0; i < 200; i += 1) {
      history.record(MINT, i + 1, 0, 0);
      tick(10_000);
    }
    const points = history.spark(MINT, 32);
    expect(points).toHaveLength(32);
    expect(points[0]).toBeLessThan(points[points.length - 1] ?? 0);
  });
});

describe('candles', () => {
  it('returns nothing from a single observation', () => {
    history.record(MINT, 1, 0, 0);
    // One point is not a candle, and pretending otherwise would draw a flat line.
    expect(history.candles(MINT, '1h')).toEqual([]);
  });

  it('aggregates observations into buckets with coherent OHLC', () => {
    const prices = [10, 14, 8, 12];
    for (const price of prices) {
      history.record(MINT, price, 0, 0);
      tick(60_000);
    }

    const candles = history.candles(MINT, '1h');
    expect(candles.length).toBeGreaterThan(0);

    const first = candles[0];
    expect(first).toBeDefined();
    if (!first) return;
    expect(first.h).toBeGreaterThanOrEqual(first.l);
    expect(first.h).toBeGreaterThanOrEqual(first.o);
    expect(first.h).toBeGreaterThanOrEqual(first.c);
    expect(first.l).toBeLessThanOrEqual(first.o);
  });

  it('skips buckets it did not observe rather than carrying the price forward', () => {
    history.record(MINT, 10, 0, 0);
    // A four-hour gap in observation.
    tick(4 * 3_600_000);
    history.record(MINT, 20, 0, 0);

    const candles = history.candles(MINT, '1h');
    // Two observations, four hours apart, must produce two candles — not five.
    // A carried-forward close would assert the price held steady while MOVA
    // was not watching.
    expect(candles).toHaveLength(2);
  });

  it('derives bucket volume from the change in the rolling 24h figure', () => {
    history.record(MINT, 10, 1_000, 0);
    tick(60_000);
    history.record(MINT, 11, 1_800, 0);

    const candles = history.candles(MINT, '1h');
    expect(candles[0]?.v).toBe(800);
  });

  it('never reports negative volume when the rolling window slides down', () => {
    history.record(MINT, 10, 5_000, 0);
    tick(60_000);
    history.record(MINT, 11, 2_000, 0);
    expect(candles0Volume()).toBe(0);

    function candles0Volume() {
      return history.candles(MINT, '1h')[0]?.v;
    }
  });

  it('returns candles in chronological order', () => {
    for (let i = 0; i < 10; i += 1) {
      history.record(MINT, 10 + i, 0, 0);
      tick(2 * 3_600_000);
    }
    const candles = history.candles(MINT, '1h');
    const times = candles.map((c) => c.t);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });
});

describe('liquidityChange24hPct', () => {
  it('is unavailable until the token has been watched for a day', () => {
    history.record(MINT, 1, 0, 100_000);
    tick(3_600_000);
    history.record(MINT, 1, 0, 90_000);

    // An hour of observation is not a 24-hour trend, and reporting it as one
    // would put a fabricated number straight into the safety score.
    expect(history.liquidityChange24hPct(MINT)).toBeNull();
  });

  it('measures the change once enough history exists', () => {
    history.record(MINT, 1, 0, 100_000);
    for (let i = 0; i < 26; i += 1) {
      tick(3_600_000);
      history.record(MINT, 1, 0, i === 25 ? 75_000 : 100_000);
    }

    const change = history.liquidityChange24hPct(MINT);
    expect(change).not.toBeNull();
    expect(change ?? 0).toBeLessThan(0);
  });
});
