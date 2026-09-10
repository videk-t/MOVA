import type { MarketOverview } from '@/core/types';
import { clamp, isNum, ramp, round } from '@/core/math';
import { momentumFromMarket } from '@/core/scoring';
import * as dex from '../upstream/dexscreener.js';
import { cache } from '../cache.js';
import { config } from '../config.js';

/**
 * Market overview.
 *
 * Every figure here is measured over MOVA's tracked set and says so. The two
 * that cannot be measured keyless — chain-wide launches and graduations —
 * return null rather than a number derived from the sample, because "411 new
 * tokens" implies a census and a sample is not one.
 */

/** Wrapped SOL. The canonical mint every Solana DEX quotes against. */
const WSOL_MINT = 'So11111111111111111111111111111111111111112';

export async function overview(pairs: dex.DexPair[], signal?: AbortSignal): Promise<MarketOverview> {
  const sol = await solPrice(signal);

  const changes = pairs.map((p) => p.market.change24h).filter(isNum);
  const volumes = pairs.map((p) => p.market.volume24hUsd).filter(isNum);
  const momentum = pairs
    .map((p) => momentumFromMarket(p.market))
    .filter((m): m is number => m != null);

  const advancers = changes.filter((c) => c > 0).length;
  const advancersPct = changes.length > 0 ? (advancers / changes.length) * 100 : null;

  const medianChange = median(changes);
  const meanMomentum = mean(momentum);

  return {
    solPriceUsd: sol.price,
    solChange24h: sol.change24h,
    // Breadth and direction, weighted toward breadth: a market where most
    // things are rising is a different state from one where a few are ripping.
    sentiment:
      advancersPct == null && medianChange == null
        ? null
        : round(
            clamp(
              0.65 * (advancersPct ?? 50) + 0.35 * ramp(medianChange ?? 0, -25, 25),
              0,
              100,
            ),
          ),
    memeMomentum: meanMomentum == null ? null : round(clamp(meanMomentum, 0, 100)),
    totalVolume24hUsd: volumes.length > 0 ? volumes.reduce((a, b) => a + b, 0) : null,
    // Not knowable from a sample of tracked pairs. The app renders these as
    // "Data unavailable" rather than showing a count that implies a census.
    newTokens24h: null,
    graduated24h: null,
    advancersPct: advancersPct == null ? null : round(advancersPct, 1),
  };
}

async function solPrice(signal?: AbortSignal): Promise<{ price: number | null; change24h: number | null }> {
  return cache.wrap('market:sol', config.upstreamCacheTtlMs, async () => {
    try {
      const pairs = await dex.getTokens([WSOL_MINT], signal);
      const wsol = pairs.get(WSOL_MINT);
      if (!wsol) return { price: null, change24h: null };
      return { price: wsol.market.priceUsd, change24h: wsol.market.change24h };
    } catch {
      return { price: null, change24h: null };
    }
  });
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Median rather than mean: one token up 4000% should not define the market. */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? null;
  const lower = sorted[mid - 1];
  const upper = sorted[mid];
  return lower != null && upper != null ? (lower + upper) / 2 : null;
}
