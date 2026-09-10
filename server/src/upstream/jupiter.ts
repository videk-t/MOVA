import { isRecord } from '@/core/normalize';
import { isNum } from '@/core/math';
import { fetchJson } from '../http.js';
import { cache } from '../cache.js';
import { config } from '../config.js';

/**
 * Jupiter — can this token actually be sold?
 *
 * The single most consequential safety fact about a memecoin is whether you
 * can get out of it, and `sellsSucceeding === false` is already a hard override
 * in the scoring model: it forces safety to zero and risk to high, ahead of
 * every other signal. Until now nothing populated it.
 *
 * Jupiter is Solana's routing aggregator and quotes keylessly. If it can route
 * a sell back to SOL, the exit exists. If it cannot route one *while
 * DexScreener reports real liquidity*, something is wrong with the token
 * rather than with the market.
 *
 * The honest limits of this check, which the wording in the UI respects:
 * a routable quote proves a path exists, not that the transaction will land —
 * transfer hooks and blacklists can still block a specific wallet. So a pass
 * here reads as "routable", never as a guarantee.
 */

const BASE = 'https://lite-api.jup.ag/swap/v1/quote';
const WSOL = 'So11111111111111111111111111111111111111112';
const SOURCE = 'Jupiter';

/** Test size. Large enough to be a real quote, small enough to route on a thin pool. */
const PROBE_USD = 50;

/**
 * Below this, an unroutable sell says more about the pool being tiny than about
 * the token being malicious, so the check withholds a verdict instead.
 */
const MIN_LIQUIDITY_FOR_VERDICT = 10_000;

/** Beyond this, the quote is technically routable but not meaningfully sellable. */
const MAX_ACCEPTABLE_IMPACT_PCT = 90;

export interface SellCheck {
  /** true = routable, false = no exit found despite real liquidity, null = unknown. */
  sellsSucceeding: boolean | null;
  /** Price impact of the probe, when a route was found. */
  priceImpactPct: number | null;
}

const UNKNOWN: SellCheck = { sellsSucceeding: null, priceImpactPct: null };

export async function checkSell(
  mint: string,
  decimals: number | null,
  priceUsd: number | null,
  liquidityUsd: number | null,
  signal?: AbortSignal,
): Promise<SellCheck> {
  // Without decimals and a price there is no way to size a probe that means
  // anything, and a wrongly-sized probe would fail for arithmetic reasons.
  if (!isNum(decimals) || !isNum(priceUsd) || priceUsd <= 0) return { ...UNKNOWN };

  const tokens = PROBE_USD / priceUsd;
  const raw = Math.floor(tokens * 10 ** decimals);
  if (!Number.isFinite(raw) || raw <= 0) return { ...UNKNOWN };

  return cache.wrap(`jup:sell:${mint}`, config.structuralCacheTtlMs, async () => {
    const url = `${BASE}?inputMint=${encodeURIComponent(mint)}&outputMint=${WSOL}&amount=${raw}&slippageBps=500`;

    try {
      const quote = await fetchJson(url, { source: SOURCE, retries: 1, timeoutMs: 8_000, signal });

      if (isRecord(quote) && quote.outAmount != null && Number(quote.outAmount) > 0) {
        const impact = Number(quote.priceImpactPct);
        const priceImpactPct = Number.isFinite(impact) ? impact * 100 : null;

        // A route that would cost nearly everything is not an exit in any
        // sense a user would recognise.
        if (priceImpactPct != null && priceImpactPct > MAX_ACCEPTABLE_IMPACT_PCT) {
          return { sellsSucceeding: false, priceImpactPct };
        }
        return { sellsSucceeding: true, priceImpactPct };
      }

      return verdictForNoRoute(liquidityUsd);
    } catch {
      // Jupiter returns a 400 when no route exists at all, which `fetchJson`
      // raises. That is the signal, not an error to swallow silently — but it
      // only means something when there was liquidity to route against.
      return verdictForNoRoute(liquidityUsd);
    }
  });
}

/**
 * No route found. Whether that is damning depends entirely on whether there
 * was anything to route against.
 */
function verdictForNoRoute(liquidityUsd: number | null): SellCheck {
  if (isNum(liquidityUsd) && liquidityUsd >= MIN_LIQUIDITY_FOR_VERDICT) {
    // A real pool exists and no aggregator can find a way out of it. That is
    // the shape of a honeypot, and the scoring model treats it as decisive.
    return { sellsSucceeding: false, priceImpactPct: null };
  }
  // Thin or unindexed. Not evidence of anything.
  return { ...UNKNOWN };
}
