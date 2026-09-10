import type { TokenMarket, TokenRef } from '@/core/types';
import {
  isRecord,
  toChangePct,
  toCount,
  toDisplayText,
  toSafeUrl,
  toSolanaAddress,
  toTimestamp,
  toUsd,
} from '@/core/normalize';
import { fetchJson } from '../http.js';
import { cache } from '../cache.js';
import { config } from '../config.js';

/**
 * DexScreener.
 *
 * The one upstream MOVA needs no credential for, which is why it carries the
 * baseline: prices, liquidity, volume, transaction counts and pair age for any
 * Solana token, plus the logo and project links. A bare `npm start` with an
 * empty .env serves real market data because of this file.
 *
 * Responses are coerced through `@/core/normalize` — the same code the app runs
 * on our own responses. Token symbols and names here are written by whoever
 * deployed the token and are treated accordingly.
 */

const BASE = 'https://api.dexscreener.com';
const SOURCE = 'DexScreener';

/** The tokens endpoint accepts a comma-separated list, capped at 30. */
const MAX_ADDRESSES_PER_CALL = 30;

export interface DexPair {
  ref: TokenRef;
  market: TokenMarket;
  links: { website: string | null; twitter: string | null; telegram: string | null };
  /** Pool liquidity, used to pick the canonical pair among several. */
  liquidityUsd: number;
}

function pickLinks(info: unknown): DexPair['links'] {
  const o = isRecord(info) ? info : {};
  const websites = Array.isArray(o.websites) ? o.websites : [];
  const socials = Array.isArray(o.socials) ? o.socials : [];

  const firstWebsite = websites.find(isRecord);
  const findSocial = (type: string) =>
    socials.find((s) => isRecord(s) && String(s.type ?? '').toLowerCase() === type);

  const twitter = findSocial('twitter');
  const telegram = findSocial('telegram');

  return {
    website: toSafeUrl(firstWebsite?.url),
    twitter: toSafeUrl(isRecord(twitter) ? twitter.url : null),
    telegram: toSafeUrl(isRecord(telegram) ? telegram.url : null),
  };
}

function txnsOf(raw: unknown): { buys: number | null; sells: number | null } {
  const o = isRecord(raw) ? raw : {};
  return { buys: toCount(o.buys), sells: toCount(o.sells) };
}

/** Map one DexScreener pair onto MOVA's shapes. Returns null if unusable. */
export function mapPair(raw: unknown): DexPair | null {
  if (!isRecord(raw)) return null;
  if (String(raw.chainId ?? '') !== 'solana') return null;

  const base = isRecord(raw.baseToken) ? raw.baseToken : {};
  const address = toSolanaAddress(base.address);
  if (address == null) return null;

  const symbol = toDisplayText(base.symbol, 16);
  const name = toDisplayText(base.name, 48);
  const info = raw.info;
  const liquidity = isRecord(raw.liquidity) ? raw.liquidity : {};
  const volume = isRecord(raw.volume) ? raw.volume : {};
  const change = isRecord(raw.priceChange) ? raw.priceChange : {};
  const txns = isRecord(raw.txns) ? raw.txns : {};

  const liquidityUsd = toUsd(liquidity.usd);

  const ref: TokenRef = {
    address,
    symbol: symbol ?? `${address.slice(0, 4)}…`,
    name: name ?? symbol ?? 'Unknown token',
    logoUri: toSafeUrl(isRecord(info) ? info.imageUrl : null),
    chain: 'solana',
  };

  const market: TokenMarket = {
    priceUsd: toUsd(raw.priceUsd),
    marketCapUsd: toUsd(raw.marketCap),
    fdvUsd: toUsd(raw.fdv),
    liquidityUsd,
    volume1hUsd: toUsd(volume.h1),
    volume24hUsd: toUsd(volume.h24),
    change5m: toChangePct(change.m5),
    change1h: toChangePct(change.h1),
    change6h: toChangePct(change.h6),
    change24h: toChangePct(change.h24),
    txns1h: txnsOf(txns.h1),
    txns24h: txnsOf(txns.h24),
    // DexScreener does not publish a holder count. The app renders this as
    // "Data unavailable" rather than inventing one.
    holders: null,
    createdAt: toTimestamp(raw.pairCreatedAt),
    pairAddress: toSolanaAddress(raw.pairAddress),
    dexId: toDisplayText(raw.dexId, 24),
  };

  return { ref, market, links: pickLinks(info), liquidityUsd: liquidityUsd ?? 0 };
}

/**
 * Collapse the pairs of one token to its canonical market.
 *
 * A token trades in several pools; the deepest one is the price everyone
 * actually gets. Volume and transaction counts are summed across pools, because
 * activity split over three pairs is still activity in that token.
 */
function collapse(pairs: DexPair[]): DexPair | null {
  if (pairs.length === 0) return null;
  const sorted = [...pairs].sort((a, b) => b.liquidityUsd - a.liquidityUsd);
  const primary = sorted[0];
  if (!primary) return null;
  if (sorted.length === 1) return primary;

  const sum = (pick: (p: DexPair) => number | null): number | null => {
    let total: number | null = null;
    for (const p of sorted) {
      const value = pick(p);
      if (value == null) continue;
      total = (total ?? 0) + value;
    }
    return total;
  };

  const sumTxns = (pick: (p: DexPair) => { buys: number | null; sells: number | null }) => ({
    buys: sum((p) => pick(p).buys),
    sells: sum((p) => pick(p).sells),
  });

  // The earliest pool is the token's real age, not the newest pool's age.
  const created = sorted
    .map((p) => p.market.createdAt)
    .filter((t): t is number => t != null)
    .sort((a, b) => a - b)[0];

  return {
    ...primary,
    market: {
      ...primary.market,
      liquidityUsd: sum((p) => p.market.liquidityUsd),
      volume1hUsd: sum((p) => p.market.volume1hUsd),
      volume24hUsd: sum((p) => p.market.volume24hUsd),
      txns1h: sumTxns((p) => p.market.txns1h),
      txns24h: sumTxns((p) => p.market.txns24h),
      createdAt: created ?? primary.market.createdAt,
    },
  };
}

function groupByToken(rawPairs: unknown): Map<string, DexPair> {
  const grouped = new Map<string, DexPair[]>();
  const list = Array.isArray(rawPairs) ? rawPairs : [];

  for (const raw of list) {
    const pair = mapPair(raw);
    if (pair == null) continue;
    const bucket = grouped.get(pair.ref.address);
    if (bucket) bucket.push(pair);
    else grouped.set(pair.ref.address, [pair]);
  }

  const out = new Map<string, DexPair>();
  for (const [address, pairs] of grouped) {
    const collapsed = collapse(pairs);
    if (collapsed) out.set(address, collapsed);
  }
  return out;
}

/** Market data for up to a few hundred mints, chunked to the endpoint's limit. */
export async function getTokens(addresses: string[], signal?: AbortSignal): Promise<Map<string, DexPair>> {
  const unique = [...new Set(addresses.filter((a) => toSolanaAddress(a) != null))];
  if (unique.length === 0) return new Map();

  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += MAX_ADDRESSES_PER_CALL) {
    chunks.push(unique.slice(i, i + MAX_ADDRESSES_PER_CALL));
  }

  const results = await Promise.allSettled(
    chunks.map((chunk) =>
      cache.wrap(`dex:tokens:${chunk.join(',')}`, config.upstreamCacheTtlMs, async () => {
        const raw = await fetchJson(`${BASE}/latest/dex/tokens/${chunk.join(',')}`, {
          source: SOURCE,
          retries: 1,
          signal,
        });
        return groupByToken(isRecord(raw) ? raw.pairs : null);
      }),
    ),
  );

  const merged = new Map<string, DexPair>();
  for (const result of results) {
    // A failed chunk costs those tokens, not the whole request.
    if (result.status !== 'fulfilled') continue;
    for (const [address, pair] of result.value) merged.set(address, pair);
  }
  return merged;
}

export async function search(query: string, signal?: AbortSignal): Promise<DexPair[]> {
  const q = query.trim().slice(0, 64);
  if (q.length === 0) return [];

  return cache.wrap(`dex:search:${q.toLowerCase()}`, config.upstreamCacheTtlMs, async () => {
    const raw = await fetchJson(`${BASE}/latest/dex/search?q=${encodeURIComponent(q)}`, {
      source: SOURCE,
      retries: 1,
      signal,
    });
    const grouped = groupByToken(isRecord(raw) ? raw.pairs : null);
    return [...grouped.values()].sort((a, b) => b.liquidityUsd - a.liquidityUsd).slice(0, 30);
  });
}

/**
 * Solana mints that DexScreener currently lists as having activity.
 *
 * Two discovery feeds, both keyless: recently-updated token profiles and the
 * boosted list. Neither is a ranking MOVA would trust on its own — boosts are
 * bought — so they are used only to assemble a candidate set, which is then
 * ranked on measured market data.
 */
export async function discoverCandidates(signal?: AbortSignal): Promise<string[]> {
  return cache.wrap('dex:candidates', config.universeRefreshMs, async () => {
    const endpoints = ['/token-profiles/latest/v1', '/token-boosts/latest/v1', '/token-boosts/top/v1'];

    const results = await Promise.allSettled(
      endpoints.map((path) => fetchJson(`${BASE}${path}`, { source: SOURCE, retries: 1, signal })),
    );

    const addresses = new Set<string>();
    for (const result of results) {
      if (result.status !== 'fulfilled') continue;
      const list = Array.isArray(result.value) ? result.value : [];
      for (const item of list) {
        if (!isRecord(item)) continue;
        if (String(item.chainId ?? '') !== 'solana') continue;
        const address = toSolanaAddress(item.tokenAddress);
        if (address) addresses.add(address);
      }
    }
    return [...addresses];
  });
}
