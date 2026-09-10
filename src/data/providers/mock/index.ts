import type {
  Candle,
  DataMeta,
  Holder,
  MarketOverview,
  SocialSignal,
  Timeframe,
  TokenDetail,
  TokenSummary,
  WalletEvent,
  WithMeta,
} from '@/core/types';
import { computeMovaScore, type MovaScore } from '@/core/scoring';
import { isNum, ratio } from '@/core/math';
import type {
  AnalysisProvider,
  DiscoverQuery,
  HolderDataProvider,
  MarketDataProvider,
  Page,
  ProviderBundle,
  Range,
  SocialDataProvider,
  SortKey,
  TokenDataProvider,
  WalletDataProvider,
} from '../types';
import { buildAnalysis } from '../analysis';
import {
  candlesFor,
  detailFor,
  DAY,
  getUniverse,
  holdersFor,
  HOUR,
  type MockToken,
  priceAt,
  sparkFor,
  volumeAt,
} from './universe';

/**
 * Fully offline provider bundle.
 *
 * Everything it returns is stamped `origin: 'mock'`, which the UI renders as a
 * visible DEMO DATA marker. No network calls, no keys, no rate limits — the app
 * is completely usable in this mode.
 */

const SEED_KEY = process.env.EXPO_PUBLIC_MOCK_SEED ?? 'mova-2025';

function meta(sources: string[] = ['MOVA demo generator'], missing?: string[]): DataMeta {
  return { origin: 'mock', fetchedAt: Date.now(), sources, missing };
}

/** Simulated network latency so loading and skeleton states are real. */
function delay<T>(value: T, ms = 180 + Math.random() * 220, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => resolve(value), ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

// Detail objects are rebuilt on a short interval rather than per call, so a
// screen that reads the same token three times sees three identical values.
const BUCKET_MS = 10_000;
const detailCache = new Map<string, { bucket: number; detail: TokenDetail; score: MovaScore }>();

function resolve(token: MockToken): { detail: TokenDetail; score: MovaScore } {
  const bucket = Math.floor(Date.now() / BUCKET_MS);
  const cached = detailCache.get(token.address);
  if (cached && cached.bucket === bucket) return cached;

  const detail = detailFor(token, bucket * BUCKET_MS);
  const score = computeMovaScore(detail);
  const entry = { bucket, detail, score };
  detailCache.set(token.address, entry);
  return entry;
}

function toSummary(token: MockToken): TokenSummary {
  const { detail, score } = resolve(token);
  return {
    ref: detail.ref,
    market: detail.market,
    score: score.total,
    risk: score.risk,
    spark: sparkFor(token, Math.floor(Date.now() / BUCKET_MS) * BUCKET_MS),
  };
}

function findToken(address: string): MockToken | undefined {
  return getUniverse(SEED_KEY).find((t) => t.address === address);
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

function inRange(value: number | null | undefined, range: Range): boolean {
  if (range.min == null && range.max == null) return true;
  // A token with no value for a filtered field cannot be confirmed to pass it.
  if (!isNum(value)) return false;
  if (range.min != null && value < range.min) return false;
  if (range.max != null && value > range.max) return false;
  return true;
}

function matches(summary: TokenSummary, detail: TokenDetail, score: MovaScore, query: DiscoverQuery): boolean {
  const f = query.filters;
  const m = summary.market;

  if (f.excludeHoneypots && detail.security.sellsSucceeding === false) return false;
  if (f.requireMintRevoked && detail.security.mintAuthorityRevoked !== true) return false;
  if (f.requireFreezeRevoked && detail.security.freezeAuthorityRevoked !== true) return false;
  if (f.riskLevels.length > 0 && !f.riskLevels.includes(summary.risk)) return false;

  if (!inRange(m.marketCapUsd, f.marketCapUsd)) return false;
  if (!inRange(m.liquidityUsd, f.liquidityUsd)) return false;
  if (!inRange(m.volume24hUsd, f.volume24hUsd)) return false;
  if (!inRange(m.holders, f.holders)) return false;
  if (!inRange(summary.score, f.movaScore)) return false;

  const ageHours = m.createdAt == null ? null : (Date.now() - m.createdAt) / HOUR;
  if (!inRange(ageHours, f.ageHours)) return false;

  const vlr = ratio(m.volume24hUsd, m.liquidityUsd);
  if (!inRange(vlr, f.volumeToLiquidity)) return false;

  const txns = (m.txns24h.buys ?? 0) + (m.txns24h.sells ?? 0);
  if (!inRange(m.txns24h.buys == null && m.txns24h.sells == null ? null : txns, f.txns24h)) return false;

  const hourTotal = (m.txns1h.buys ?? 0) + (m.txns1h.sells ?? 0);
  const buyRatio = hourTotal > 0 ? (m.txns1h.buys ?? 0) / hourTotal : null;
  if (!inRange(buyRatio, f.buyRatio)) return false;

  const momentum = score.components.find((c) => c.key === 'momentum')?.score ?? null;
  if (!inRange(momentum, f.momentum)) return false;

  const search = f.search.trim().toLowerCase();
  if (search.length > 0) {
    const haystack = `${summary.ref.symbol} ${summary.ref.name} ${summary.ref.address}`.toLowerCase();
    if (!haystack.includes(search)) return false;
  }

  return true;
}

function sortValue(summary: TokenSummary, key: SortKey): number | null {
  const m = summary.market;
  switch (key) {
    case 'score':
      return summary.score;
    case 'marketCap':
      return m.marketCapUsd;
    case 'volume24h':
      return m.volume24hUsd;
    case 'liquidity':
      return m.liquidityUsd;
    case 'change1h':
      return m.change1h;
    case 'change24h':
      return m.change24h;
    case 'holders':
      return m.holders;
    case 'age':
      return m.createdAt == null ? null : Date.now() - m.createdAt;
    default:
      return null;
  }
}

function sortSummaries(items: TokenSummary[], key: SortKey, direction: 'asc' | 'desc'): TokenSummary[] {
  const sign = direction === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => {
    const av = sortValue(a, key);
    const bv = sortValue(b, key);
    // Missing values always sink, regardless of sort direction.
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return (av - bv) * sign;
  });
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

const marketProvider: MarketDataProvider = {
  async getOverview(signal) {
    const universe = getUniverse(SEED_KEY);
    const now = Math.floor(Date.now() / BUCKET_MS) * BUCKET_MS;
    const summaries = universe.map(toSummary);

    const advancers = summaries.filter((s) => (s.market.change24h ?? 0) > 0).length;
    const totalVolume = summaries.reduce((sum, s) => sum + (s.market.volume24hUsd ?? 0), 0);
    const avgMomentum =
      summaries.reduce((sum, s) => sum + (s.market.change24h ?? 0), 0) / Math.max(1, summaries.length);

    // SOL is modelled off the same generator so it moves with everything else.
    const solSeedToken = universe[0];
    const solPrice = solSeedToken ? 120 + ((priceAt(solSeedToken, now) / solSeedToken.basePrice) % 1) * 90 : null;
    const solPrev = solSeedToken
      ? 120 + ((priceAt(solSeedToken, now - DAY) / solSeedToken.basePrice) % 1) * 90
      : null;

    const overview: MarketOverview = {
      solPriceUsd: solPrice,
      solChange24h: solPrice != null && solPrev != null && solPrev > 0 ? ((solPrice - solPrev) / solPrev) * 100 : null,
      sentiment: Math.round(Math.min(100, Math.max(0, 50 + avgMomentum * 1.2))),
      memeMomentum: Math.round((advancers / Math.max(1, summaries.length)) * 100),
      totalVolume24hUsd: totalVolume,
      newTokens24h: universe.filter((t) => Date.now() - t.createdAt < DAY).length * 137,
      graduated24h: Math.round(universe.length * 0.8),
      advancersPct: (advancers / Math.max(1, summaries.length)) * 100,
    };

    return delay({ data: overview, meta: meta(['MOVA demo generator']) }, 160, signal);
  },

  async getTrending(signal) {
    const items = getUniverse(SEED_KEY)
      .map(toSummary)
      .filter((s) => (s.market.liquidityUsd ?? 0) > 12_000)
      .sort((a, b) => (ratio(b.market.volume24hUsd, b.market.liquidityUsd) ?? 0) - (ratio(a.market.volume24hUsd, a.market.liquidityUsd) ?? 0))
      .slice(0, 10);
    return delay({ data: items, meta: meta() }, 200, signal);
  },

  async getTopMovers(signal) {
    const items = sortSummaries(getUniverse(SEED_KEY).map(toSummary), 'change24h', 'desc').slice(0, 10);
    return delay({ data: items, meta: meta() }, 200, signal);
  },

  async getUnusualVolume(signal) {
    const items = getUniverse(SEED_KEY)
      .map(toSummary)
      .map((s) => ({ s, vlr: ratio(s.market.volume24hUsd, s.market.liquidityUsd) ?? 0 }))
      .filter((x) => x.vlr > 2)
      .sort((a, b) => b.vlr - a.vlr)
      .slice(0, 8)
      .map((x) => x.s);
    return delay({ data: items, meta: meta() }, 200, signal);
  },
};

const tokenProvider: TokenDataProvider = {
  async discover(query, signal) {
    const universe = getUniverse(SEED_KEY);
    const matching: TokenSummary[] = [];

    for (const token of universe) {
      const summary = toSummary(token);
      const { detail, score } = resolve(token);
      if (matches(summary, detail, score, query)) matching.push(summary);
    }

    const sorted = sortSummaries(matching, query.sort, query.direction);
    const offset = Number.parseInt(query.cursor ?? '0', 10) || 0;
    const slice = sorted.slice(offset, offset + query.limit);
    const nextOffset = offset + slice.length;

    const page: Page<TokenSummary> = {
      items: slice,
      nextCursor: nextOffset < sorted.length ? String(nextOffset) : null,
    };
    return delay({ data: page, meta: meta() }, 240, signal);
  },

  async getToken(address, signal) {
    const token = findToken(address);
    if (!token) throw new Error(`Token ${address} is not in the demo universe.`);
    const { detail } = resolve(token);
    return delay({ data: detail, meta: meta(['MOVA demo generator']) }, 260, signal);
  },

  async getSummaries(addresses, signal) {
    const items = addresses
      .map((a) => findToken(a))
      .filter((t): t is MockToken => t !== undefined)
      .map(toSummary);
    return delay({ data: items, meta: meta() }, 160, signal);
  },

  async getCandles(address, timeframe: Timeframe, signal) {
    const token = findToken(address);
    if (!token) throw new Error(`Token ${address} is not in the demo universe.`);
    const candles: Candle[] = candlesFor(token, timeframe, 120, Math.floor(Date.now() / BUCKET_MS) * BUCKET_MS);
    return delay({ data: candles, meta: meta() }, 220, signal);
  },

  async search(query, signal) {
    const q = query.trim().toLowerCase();
    if (q.length === 0) return delay({ data: [], meta: meta() }, 60, signal);
    const items = getUniverse(SEED_KEY)
      .filter(
        (t) =>
          t.seed.symbol.toLowerCase().includes(q) ||
          t.seed.name.toLowerCase().includes(q) ||
          t.address.toLowerCase().startsWith(q),
      )
      .slice(0, 20)
      .map(toSummary);
    return delay({ data: items, meta: meta() }, 140, signal);
  },
};

const holderProvider: HolderDataProvider = {
  async getTopHolders(address, signal) {
    const token = findToken(address);
    if (!token) return delay({ data: [] as Holder[], meta: meta([], ['holders']) }, 120, signal);
    if (token.seed.archetype === 'sparse') {
      return delay({ data: [] as Holder[], meta: meta(['MOVA demo generator'], ['holders']) }, 120, signal);
    }
    return delay({ data: holdersFor(token, Date.now()), meta: meta() }, 200, signal);
  },
};

const walletProvider: WalletDataProvider = {
  async getWalletEvents(address, signal) {
    const token = findToken(address);
    const events: WalletEvent[] = token ? resolve(token).detail.smartMoney.events : [];
    return delay({ data: events, meta: meta() }, 180, signal);
  },
};

const socialProvider: SocialDataProvider = {
  async getSocial(address, signal) {
    const token = findToken(address);
    const social: SocialSignal = token
      ? resolve(token).detail.social
      : {
          mentions24h: null,
          mentionsGrowthPct: null,
          uniqueAuthors24h: null,
          botLikelihoodPct: null,
          kolMentions24h: null,
          authenticity: 'unknown',
          links: { website: null, twitter: null, telegram: null },
        };
    return delay({ data: social, meta: meta(['MOVA demo generator']) }, 200, signal);
  },
};

const analysisProvider: AnalysisProvider = {
  async analyze(detail, score, signal) {
    return delay({ data: buildAnalysis(detail, score), meta: meta(['MOVA rule-based analysis']) }, 420, signal);
  },
};

export const mockProviders: ProviderBundle = {
  name: 'Demo generator',
  origin: 'mock',
  market: marketProvider,
  token: tokenProvider,
  holders: holderProvider,
  wallets: walletProvider,
  social: socialProvider,
  analysis: analysisProvider,
};

export { volumeAt, priceAt };
export type { WithMeta };
