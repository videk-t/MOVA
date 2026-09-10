import type { Candle, Timeframe } from '@/core/types';

/**
 * Recorded price history.
 *
 * DexScreener publishes no OHLC series on its free API, so without a Birdeye
 * key MOVA has no historical candles to serve. Rather than fabricate a chart,
 * the server records what it observes: every universe refresh appends a real
 * price sample per tracked token, and candles are aggregated from those.
 *
 * The consequence is honest and worth stating plainly — a freshly started
 * server has a short chart, and it lengthens as MOVA watches. That is a true
 * statement about what is known, which a generated curve would not be.
 *
 * In memory, so it resets on restart. Persisting it is the natural next step
 * and touches only this file.
 */

interface Sample {
  t: number;
  price: number;
  /** Cumulative 24h volume at the time of sampling, used to derive per-bucket flow. */
  volume24h: number | null;
  liquidity: number | null;
}

/** Roughly a day of minute-resolution samples per token. */
const MAX_SAMPLES = 1_500;
const MAX_TOKENS = 1_000;

const series = new Map<string, Sample[]>();

export function record(address: string, price: number | null, volume24h: number | null, liquidity: number | null): void {
  if (price == null || !Number.isFinite(price) || price <= 0) return;

  let samples = series.get(address);
  if (!samples) {
    if (series.size >= MAX_TOKENS) {
      // Drop the least recently written token rather than growing without bound.
      const oldest = series.keys().next();
      if (!oldest.done) series.delete(oldest.value);
    }
    samples = [];
    series.set(address, samples);
  }

  const last = samples[samples.length - 1];
  const now = Date.now();
  // Guard against a burst of refreshes producing duplicate samples.
  if (last && now - last.t < 5_000) return;

  samples.push({ t: now, price, volume24h, liquidity });
  if (samples.length > MAX_SAMPLES) samples.splice(0, samples.length - MAX_SAMPLES);
}

export function sampleCount(address: string): number {
  return series.get(address)?.length ?? 0;
}

/** Closing prices, oldest first — the row sparkline. */
export function spark(address: string, points = 32): number[] {
  const samples = series.get(address);
  if (!samples || samples.length === 0) return [];
  if (samples.length <= points) return samples.map((s) => s.price);

  // Even stride across the window so the shape survives downsampling.
  const stride = samples.length / points;
  const out: number[] = [];
  for (let i = 0; i < points; i += 1) {
    const sample = samples[Math.min(samples.length - 1, Math.floor(i * stride))];
    if (sample) out.push(sample.price);
  }
  return out;
}

const STEP_MS: Record<Timeframe, number> = {
  '5m': 5 * 60_000,
  '15m': 15 * 60_000,
  '1h': 3_600_000,
  '4h': 4 * 3_600_000,
  '1d': 24 * 3_600_000,
};

/**
 * Aggregate recorded samples into candles.
 *
 * Buckets with no observation are skipped rather than carried forward at the
 * previous close: a flat segment would claim the price did not move, when in
 * fact MOVA was not watching.
 */
export function candles(address: string, timeframe: Timeframe, count = 120): Candle[] {
  const samples = series.get(address);
  if (!samples || samples.length < 2) return [];

  const step = STEP_MS[timeframe];
  const now = Date.now();
  const start = now - count * step;

  const buckets = new Map<number, Sample[]>();
  for (const sample of samples) {
    if (sample.t < start) continue;
    const key = Math.floor(sample.t / step) * step;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(sample);
    else buckets.set(key, [sample]);
  }

  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([t, group]) => {
      const prices = group.map((s) => s.price);
      const first = group[0];
      const last = group[group.length - 1];
      return {
        t,
        o: first?.price ?? 0,
        h: Math.max(...prices),
        l: Math.min(...prices),
        c: last?.price ?? 0,
        // Volume within the bucket is the change in the rolling 24h figure,
        // floored at zero — the window slides, so it can legitimately fall.
        v: Math.max(0, (last?.volume24h ?? 0) - (first?.volume24h ?? 0)),
      } satisfies Candle;
    });
}

/**
 * Percentage change in pool depth over roughly 24 hours.
 *
 * Null until the server has actually watched the token that long, because a
 * liquidity trend inferred from ten minutes of data is not a liquidity trend.
 */
export function liquidityChange24hPct(address: string): number | null {
  const samples = series.get(address);
  if (!samples || samples.length < 2) return null;

  const now = Date.now();
  const target = now - 24 * 3_600_000;
  const oldest = samples[0];
  if (!oldest || oldest.t > target + 3_600_000) return null;

  const past = [...samples].reverse().find((s) => s.t <= target);
  const latest = samples[samples.length - 1];
  if (!past?.liquidity || !latest?.liquidity || past.liquidity <= 0) return null;

  return ((latest.liquidity - past.liquidity) / past.liquidity) * 100;
}

export function stats() {
  let samples = 0;
  for (const list of series.values()) samples += list.length;
  return { tokens: series.size, samples };
}

/** Test seam. */
export function reset(): void {
  series.clear();
}
