import type { SocialSignal, TokenDetail, TokenSecurity, TokenSummary } from '@/core/types';
import { computeMovaScore } from '@/core/scoring';
import * as dex from '../upstream/dexscreener.js';
import * as rpc from '../upstream/solana-rpc.js';
import * as jupiter from '../upstream/jupiter.js';
import * as history from './history.js';

/**
 * Token assembly.
 *
 * One token's picture is stitched from several upstreams with different
 * reliability, and any of them may be missing. The rule throughout: a field we
 * could not read is `null`, never a guess and never a zero. The scoring model
 * is built to drop nulls out of its weighting and report lower confidence, so
 * an incomplete picture produces an honestly hedged score rather than a
 * confident wrong one.
 */

/** Everything MOVA cannot determine without a paid data vendor. */
const UNKNOWN_SECURITY: TokenSecurity = {
  mintAuthorityRevoked: null,
  freezeAuthorityRevoked: null,
  lpBurnedPct: null,
  lpLocked: null,
  top10HolderPct: null,
  devHoldingPct: null,
  devSoldPct: null,
  insiderPct: null,
  bundledPct: null,
  sniperPct: null,
  sellsSucceeding: null,
  liquidityChange24hPct: null,
};

const EMPTY_SOCIAL: SocialSignal = {
  mentions24h: null,
  mentionsGrowthPct: null,
  uniqueAuthors24h: null,
  botLikelihoodPct: null,
  kolMentions24h: null,
  authenticity: 'unknown',
  links: { website: null, twitter: null, telegram: null },
};

export interface AssembledToken {
  detail: TokenDetail;
  summary: TokenSummary;
  sources: string[];
  missing: string[];
}

/**
 * Build a full token picture.
 *
 * Market data is required — without it there is no token to speak of. On-chain
 * facts are best-effort: if the RPC is throttled or down, the safety checks
 * come back unknown and the rest of the response still stands.
 */
export async function assemble(address: string, signal?: AbortSignal): Promise<AssembledToken | null> {
  const pairs = await dex.getTokens([address], signal);
  const pair = pairs.get(address);
  if (!pair) return null;

  return finish(pair, signal);
}

/** Assemble from an already-fetched pair, avoiding a second market call. */
export async function finish(pair: dex.DexPair, signal?: AbortSignal): Promise<AssembledToken> {
  const address = pair.ref.address;
  const sources = ['DexScreener'];
  const missing: string[] = [];

  const mint = await rpc.getMintInfo(address, signal);
  const holders = await rpc.getHolders(address, mint.supply, signal);
  const sell = await jupiter.checkSell(
    address,
    mint.decimals,
    pair.market.priceUsd,
    pair.market.liquidityUsd,
    signal,
  );

  if (mint.mintAuthorityRevoked != null || holders.top10HolderPct != null) {
    sources.push('Solana RPC');
  }
  if (sell.sellsSucceeding != null) sources.push('Jupiter');

  const security: TokenSecurity = {
    ...UNKNOWN_SECURITY,
    mintAuthorityRevoked: mint.mintAuthorityRevoked,
    freezeAuthorityRevoked: mint.freezeAuthorityRevoked,
    top10HolderPct: holders.top10HolderPct,
    // A pool holding a large share of supply is not a burn, but a provable burn
    // to an incinerator is the closest keyless proxy for locked liquidity.
    lpBurnedPct: holders.burnedPct,
    liquidityChange24hPct: history.liquidityChange24hPct(address),
    // Whether an exit exists at all. False here is decisive in the scoring
    // model, so it is only ever set when a real pool had no routable sell.
    sellsSucceeding: sell.sellsSucceeding,
  };

  for (const [field, value] of Object.entries(security)) {
    if (value == null) missing.push(field);
  }
  // No keyless source for wallet-level flow or social metrics.
  missing.push('holders', 'smartMoney', 'socialMetrics');

  const social: SocialSignal = { ...EMPTY_SOCIAL, links: pair.links };

  const detail: TokenDetail = {
    ref: pair.ref,
    market: pair.market,
    security,
    smartMoney: {
      netFlow24hUsd: null,
      whaleBuys24h: null,
      whaleSells24h: null,
      smartWalletHolders: null,
      events: [],
    },
    social,
  };

  // The same pure function the app runs, so the score the server publishes is
  // by construction the score the client would have computed itself.
  const score = computeMovaScore(detail);

  const summary: TokenSummary = {
    ref: pair.ref,
    market: pair.market,
    score: score.total,
    risk: score.risk,
    spark: history.spark(address),
  };

  return { detail, summary, sources, missing: [...new Set(missing)] };
}

/**
 * Summaries for many tokens at once.
 *
 * Deliberately market-data only: pulling on-chain state for fifty rows would
 * mean a hundred RPC calls to render one screen. Risk therefore reflects
 * market structure alone here, and resolves fully when a token is opened.
 */
export async function summarize(addresses: string[], signal?: AbortSignal): Promise<TokenSummary[]> {
  const pairs = await dex.getTokens(addresses, signal);
  const out: TokenSummary[] = [];

  for (const address of addresses) {
    const pair = pairs.get(address);
    if (!pair) continue;
    out.push(summaryFromPair(pair));
  }
  return out;
}

/** Score a pair on market data alone, with every on-chain field unknown. */
export function summaryFromPair(pair: dex.DexPair): TokenSummary {
  const detail: TokenDetail = {
    ref: pair.ref,
    market: pair.market,
    security: {
      ...UNKNOWN_SECURITY,
      liquidityChange24hPct: history.liquidityChange24hPct(pair.ref.address),
    },
    smartMoney: {
      netFlow24hUsd: null,
      whaleBuys24h: null,
      whaleSells24h: null,
      smartWalletHolders: null,
      events: [],
    },
    social: { ...EMPTY_SOCIAL, links: pair.links },
  };

  const score = computeMovaScore(detail);
  return {
    ref: pair.ref,
    market: pair.market,
    score: score.total,
    risk: score.risk,
    spark: history.spark(pair.ref.address),
  };
}

export async function search(query: string, signal?: AbortSignal): Promise<TokenSummary[]> {
  const pairs = await dex.search(query, signal);
  return pairs.map(summaryFromPair);
}
