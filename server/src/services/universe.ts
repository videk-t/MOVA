import type { TokenSummary } from '@/core/types';
import { isNum, ratio } from '@/core/math';
import * as dex from '../upstream/dexscreener.js';
import { config } from '../config.js';
import * as history from './history.js';
import { summaryFromPair } from './tokens.js';

/**
 * The tracked universe.
 *
 * MOVA needs a working set of Solana tokens to rank, and no free endpoint
 * publishes a trustworthy "trending" list — DexScreener's boost feeds are paid
 * placement, not activity. So the candidate set is assembled from whatever
 * keyless discovery can find, and then every ranking MOVA shows is computed
 * here from measured market data. What gets promoted is decided by turnover and
 * price action, not by who paid.
 *
 * The refresh loop doubles as the price recorder: each pass writes one real
 * observation per token into `history`, which is what the charts are built from
 * when no OHLCV vendor is configured.
 */

/**
 * Search terms used to top up the candidate set.
 *
 * Deliberately queries rather than hardcoded mint addresses: a wrong constant
 * would put a wrong token on the home screen and never correct itself, whereas
 * a search returns whatever is actually liquid under that ticker today.
 */
const SEED_QUERIES = ['bonk', 'wif', 'pump', 'cat', 'dog', 'pepe', 'sol'];

/** Below this the token is not tradable in any meaningful sense. */
const MIN_LIQUIDITY_USD = 5_000;
const MIN_VOLUME_24H_USD = 1_000;
const TARGET_SIZE = 120;

let tracked: dex.DexPair[] = [];
let lastRefreshAt = 0;
let lastError: string | null = null;
let refreshing: Promise<void> | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

function tradable(pair: dex.DexPair): boolean {
  const liquidity = pair.market.liquidityUsd;
  const volume = pair.market.volume24hUsd;
  return isNum(liquidity) && liquidity >= MIN_LIQUIDITY_USD && isNum(volume) && volume >= MIN_VOLUME_24H_USD;
}

async function collectCandidates(signal?: AbortSignal): Promise<string[]> {
  const addresses = new Set<string>();

  try {
    for (const address of await dex.discoverCandidates(signal)) addresses.add(address);
  } catch {
    // Discovery feeds are optional; the seed searches below can carry the set.
  }

  if (addresses.size >= TARGET_SIZE) return [...addresses];

  const searches = await Promise.allSettled(SEED_QUERIES.map((q) => dex.search(q, signal)));
  for (const result of searches) {
    if (result.status !== 'fulfilled') continue;
    for (const pair of result.value) addresses.add(pair.ref.address);
  }

  return [...addresses];
}

/**
 * Rebuild the tracked set.
 *
 * Never throws: a failed refresh leaves the previous set in place and records
 * the reason, because serving slightly stale prices is better than serving an
 * error to every screen at once.
 */
export async function refresh(signal?: AbortSignal): Promise<void> {
  if (refreshing) return refreshing;

  refreshing = (async () => {
    try {
      const candidates = await collectCandidates(signal);
      if (candidates.length === 0) {
        lastError = 'No candidate tokens were discoverable upstream.';
        return;
      }

      const pairs = await dex.getTokens(candidates, signal);
      const next = [...pairs.values()].filter(tradable);

      if (next.length === 0) {
        lastError = 'Upstream returned no tradable Solana pairs.';
        return;
      }

      for (const pair of next) {
        history.record(
          pair.ref.address,
          pair.market.priceUsd,
          pair.market.volume24hUsd,
          pair.market.liquidityUsd,
        );
      }

      tracked = next;
      lastRefreshAt = Date.now();
      lastError = null;
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Universe refresh failed.';
    } finally {
      refreshing = null;
    }
  })();

  return refreshing;
}

/** Refresh if the set is empty or stale, then return it. */
export async function ensure(signal?: AbortSignal): Promise<dex.DexPair[]> {
  const stale = Date.now() - lastRefreshAt > config.universeRefreshMs * 2;
  if (tracked.length === 0 || stale) await refresh(signal);
  return tracked;
}

export function start(): void {
  if (timer) return;
  void refresh();
  timer = setInterval(() => void refresh(), config.universeRefreshMs);
  // Do not hold the process open for the sake of a polling timer.
  timer.unref?.();
}

export function stop(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

export function status() {
  return {
    tracked: tracked.length,
    lastRefreshAt: lastRefreshAt === 0 ? null : lastRefreshAt,
    ageMs: lastRefreshAt === 0 ? null : Date.now() - lastRefreshAt,
    lastError,
    history: history.stats(),
  };
}

// ---------------------------------------------------------------------------
// Rankings — all computed from measured data, none of it bought
// ---------------------------------------------------------------------------

function bySummary(pairs: dex.DexPair[], limit: number): TokenSummary[] {
  return pairs.slice(0, limit).map(summaryFromPair);
}

/** Turnover against pool depth: how hard a token is actually being traded. */
export function trending(pairs: dex.DexPair[], limit = 12): TokenSummary[] {
  const ranked = [...pairs]
    .map((pair) => ({ pair, turnover: ratio(pair.market.volume24hUsd, pair.market.liquidityUsd) ?? 0 }))
    // A pool being churned a thousand times over is usually wash trading rather
    // than interest, so absurd ratios are pushed down instead of topping the list.
    .filter((x) => x.turnover > 0 && x.turnover < 200)
    .sort((a, b) => b.turnover - a.turnover)
    .map((x) => x.pair);

  return bySummary(ranked, limit);
}

export function movers(pairs: dex.DexPair[], limit = 12): TokenSummary[] {
  const ranked = [...pairs]
    .filter((p) => isNum(p.market.change24h))
    .sort((a, b) => Math.abs(b.market.change24h ?? 0) - Math.abs(a.market.change24h ?? 0));
  return bySummary(ranked, limit);
}

/** Volume far out of line with the depth backing it. */
export function unusual(pairs: dex.DexPair[], limit = 12): TokenSummary[] {
  const ranked = [...pairs]
    .map((pair) => ({ pair, vlr: ratio(pair.market.volume24hUsd, pair.market.liquidityUsd) ?? 0 }))
    .filter((x) => x.vlr >= 3)
    .sort((a, b) => b.vlr - a.vlr)
    .map((x) => x.pair);
  return bySummary(ranked, limit);
}

export function all(): dex.DexPair[] {
  return tracked;
}
