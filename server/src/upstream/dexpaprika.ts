import type { Candle, Timeframe } from '@/core/types';
import { isRecord, toTimestamp, toUsd } from '@/core/normalize';

import { fetchJson } from '../http.js';
import { cache } from '../cache.js';
import { config } from '../config.js';

/**
 * DexPaprika — historical OHLCV, no credential required.
 *
 * This replaces the chart's weakest point. Without a history vendor MOVA could
 * only draw prices it had personally observed since the server started, so a
 * fresh deployment showed "not enough history" on the screen that matters most.
 * DexPaprika publishes real candlesticks for a pool keylessly, keyed on the
 * pair address DexScreener already returns.
 *
 * Recorded history stays as the fallback: if this upstream is down, MOVA still
 * draws what it saw itself rather than nothing.
 */

const BASE = 'https://api.dexpaprika.com';
const SOURCE = 'DexPaprika';

/**
 * Supported intervals, verified against the live API.
 *
 * `4h` and `1d` are rejected, so MOVA's 4h timeframe is aggregated from hourly
 * candles and its 1d maps onto the equivalent `24h`.
 */
type Interval = '1m' | '5m' | '15m' | '30m' | '1h' | '6h' | '12h' | '24h';

const HOUR_MS = 3_600_000;

interface Plan {
  interval: Interval;
  /** How many upstream candles collapse into one MOVA candle. */
  group: number;
  stepMs: number;
}

const PLANS: Record<Timeframe, Plan> = {
  '5m': { interval: '5m', group: 1, stepMs: 5 * 60_000 },
  '15m': { interval: '15m', group: 1, stepMs: 15 * 60_000 },
  '1h': { interval: '1h', group: 1, stepMs: HOUR_MS },
  // No 4h interval upstream; four hourly candles make one.
  '4h': { interval: '1h', group: 4, stepMs: HOUR_MS },
  '1d': { interval: '24h', group: 1, stepMs: 24 * HOUR_MS },
};

/**
 * Bucket start time.
 *
 * DexPaprika sends an ISO-8601 string, where core's `toTimestamp` expects a
 * numeric epoch — so it is parsed here and only then handed to the shared
 * validator, which enforces the same sane-range bounds as every other date in
 * the app. Skipping that would let an upstream typo put a candle in 1970.
 */
function bucketTime(value: unknown): number | null {
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? toTimestamp(parsed) : null;
  }
  return toTimestamp(value);
}

function toCandle(raw: unknown): Candle | null {
  if (!isRecord(raw)) return null;

  const t = bucketTime(raw.time_open);
  const o = toUsd(raw.open);
  const h = toUsd(raw.high);
  const l = toUsd(raw.low);
  const c = toUsd(raw.close);
  // A candle missing any leg is not a candle. Substituting a neighbouring
  // price would draw a shape the market never made.
  if (t == null || o == null || h == null || l == null || c == null) return null;

  return { t, o, h, l, c, v: toUsd(raw.volume) ?? 0 };
}

/**
 * Collapse consecutive candles into larger buckets.
 *
 * Open comes from the first, close from the last, high and low from the
 * extremes, volume from the sum — the only aggregation that preserves what
 * actually happened inside the window.
 */
function group(candles: Candle[], size: number): Candle[] {
  if (size <= 1) return candles;

  const out: Candle[] = [];
  for (let i = 0; i < candles.length; i += size) {
    const chunk = candles.slice(i, i + size);
    const first = chunk[0];
    const last = chunk[chunk.length - 1];
    if (!first || !last) continue;

    out.push({
      t: first.t,
      o: first.o,
      h: Math.max(...chunk.map((x) => x.h)),
      l: Math.min(...chunk.map((x) => x.l)),
      c: last.c,
      v: chunk.reduce((sum, x) => sum + x.v, 0),
    });
  }
  return out;
}

/**
 * Candles for a pool.
 *
 * Returns an empty array rather than throwing: a chart is worth degrading for,
 * not worth failing a screen for. The caller falls back to recorded history.
 */
export async function getCandles(
  pairAddress: string,
  timeframe: Timeframe,
  count = 120,
  signal?: AbortSignal,
): Promise<Candle[]> {
  const plan = PLANS[timeframe];
  const upstreamCount = count * plan.group;

  return cache.wrap(`paprika:ohlcv:${pairAddress}:${timeframe}`, config.upstreamCacheTtlMs * 4, async () => {
    // `start` is the beginning of the window and `limit` counts forward from
    // it, so the window is anchored to now rather than to an arbitrary past.
    const start = new Date(Date.now() - upstreamCount * plan.stepMs).toISOString();
    const url =
      `${BASE}/networks/solana/pools/${encodeURIComponent(pairAddress)}/ohlcv` +
      `?start=${encodeURIComponent(start)}&interval=${plan.interval}&limit=${Math.min(1_000, upstreamCount)}`;

    try {
      const raw = await fetchJson(url, { source: SOURCE, retries: 1, timeoutMs: 9_000, signal });
      if (!Array.isArray(raw)) return [];

      const candles = raw
        .map(toCandle)
        .filter((c): c is Candle => c !== null)
        .sort((a, b) => a.t - b.t);

      return group(candles, plan.group);
    } catch {
      return [];
    }
  });
}
