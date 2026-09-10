import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCandles } from '../upstream/dexpaprika.js';
import { cache } from '../cache.js';

/**
 * OHLCV from DexPaprika.
 *
 * The first version of this silently returned zero candles for every token,
 * because the upstream sends ISO-8601 bucket times and core's `toTimestamp`
 * only accepts a numeric epoch — so every candle failed validation and was
 * dropped without an error anywhere. Nothing about that was visible except an
 * empty chart, which looked exactly like a token with no history.
 */

const PAIR = '7x1xReLV6ssLcouvY8uidYwHBBYkBFxqecdzPSmaswcJ';

function candle(iso: string, o: number, h: number, l: number, c: number, v = 1_000) {
  return { time_open: iso, time_close: iso, open: o, high: h, low: l, close: c, volume: v };
}

function stub(payload: unknown, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify(payload), {
          status,
          headers: { 'content-type': 'application/json' },
        }),
    ),
  );
}

beforeEach(() => {
  cache.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  cache.clear();
});

describe('getCandles', () => {
  it('parses ISO bucket times into epoch milliseconds', async () => {
    stub([candle('2026-09-10T20:30:00Z', 1, 2, 0.5, 1.5)]);

    const candles = await getCandles(PAIR, '1h');
    expect(candles).toHaveLength(1);
    expect(candles[0]?.t).toBe(Date.parse('2026-09-10T20:30:00Z'));
  });

  it('maps OHLCV fields through', async () => {
    stub([candle('2026-09-10T20:30:00Z', 1, 2, 0.5, 1.5, 4_200)]);

    const [first] = await getCandles(PAIR, '1h');
    expect(first).toMatchObject({ o: 1, h: 2, l: 0.5, c: 1.5, v: 4_200 });
  });

  it('returns candles oldest first regardless of upstream order', async () => {
    stub([
      candle('2026-09-10T22:00:00Z', 3, 3, 3, 3),
      candle('2026-09-10T20:00:00Z', 1, 1, 1, 1),
      candle('2026-09-10T21:00:00Z', 2, 2, 2, 2),
    ]);

    const times = (await getCandles(PAIR, '1h')).map((c) => c.t);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  /**
   * The upstream rejects a 4h interval, so MOVA builds one from four hourly
   * candles. Getting this wrong would misreport the shape of the market at the
   * timeframe rather than merely lose data.
   */
  it('aggregates four hourly candles into one 4h candle', async () => {
    stub([
      candle('2026-09-10T00:00:00Z', 10, 12, 9, 11, 100),
      candle('2026-09-10T01:00:00Z', 11, 15, 10, 14, 200),
      candle('2026-09-10T02:00:00Z', 14, 14, 6, 8, 300),
      candle('2026-09-10T03:00:00Z', 8, 9, 7, 9, 400),
    ]);

    const candles = await getCandles(PAIR, '4h');
    expect(candles).toHaveLength(1);

    const [bucket] = candles;
    expect(bucket?.o).toBe(10); // open of the first
    expect(bucket?.c).toBe(9); // close of the last
    expect(bucket?.h).toBe(15); // highest high across the window
    expect(bucket?.l).toBe(6); // lowest low across the window
    expect(bucket?.v).toBe(1_000); // summed volume
    expect(bucket?.t).toBe(Date.parse('2026-09-10T00:00:00Z'));
  });

  it('does not aggregate timeframes the upstream serves directly', async () => {
    stub([
      candle('2026-09-10T00:00:00Z', 1, 1, 1, 1),
      candle('2026-09-10T01:00:00Z', 2, 2, 2, 2),
    ]);
    expect(await getCandles(PAIR, '1h')).toHaveLength(2);
  });

  it('drops a candle missing any leg rather than substituting a neighbour', async () => {
    stub([
      candle('2026-09-10T00:00:00Z', 1, 2, 0.5, 1.5),
      { time_open: '2026-09-10T01:00:00Z', open: 2, high: null, low: 1, close: 2 },
      { time_open: '2026-09-10T02:00:00Z', open: 3, high: 4, low: 2, close: 3, volume: 5 },
    ]);

    const candles = await getCandles(PAIR, '1h');
    expect(candles).toHaveLength(2);
  });

  it('rejects a bucket time outside a sane range', async () => {
    stub([candle('1970-01-02T00:00:00Z', 1, 1, 1, 1)]);
    expect(await getCandles(PAIR, '1h')).toHaveLength(0);
  });

  it('treats missing volume as zero rather than dropping the candle', async () => {
    stub([{ time_open: '2026-09-10T00:00:00Z', open: 1, high: 2, low: 1, close: 2 }]);
    const [first] = await getCandles(PAIR, '1h');
    expect(first?.v).toBe(0);
  });

  it('degrades to empty rather than throwing when the upstream fails', async () => {
    // The caller falls back to recorded history; a chart is worth degrading
    // for, not worth failing a screen for.
    stub({ error: 'nope' }, 500);
    await expect(getCandles(PAIR, '1h')).resolves.toEqual([]);
  });

  it('degrades to empty on a non-array body', async () => {
    stub({ unexpected: 'shape' });
    await expect(getCandles(PAIR, '1h')).resolves.toEqual([]);
  });

  it('requests only one upstream fetch for repeated calls', async () => {
    stub([candle('2026-09-10T00:00:00Z', 1, 1, 1, 1)]);

    await getCandles(PAIR, '1h');
    await getCandles(PAIR, '1h');

    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });
});
