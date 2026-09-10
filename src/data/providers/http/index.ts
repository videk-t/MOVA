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
 RiskLevel } from '@/core/types';
import {
  isRecord,
  normalizeCandles,
  normalizeMarket,
  normalizeTokenDetail,
  normalizeTokenRef,
  normalizeWalletEvent,
  toChangePct,
  toCount,
  toNumber,
  toPct,
  toSafeUrl,
  toSolanaAddress,
  toUsd,
} from '@/core/normalize';
import { computeMovaScore } from '@/core/scoring';
import type {
  AiAnalysis,
  AnalysisProvider,
  DiscoverQuery,
  HolderDataProvider,
  MarketDataProvider,
  Page,
  ProviderBundle,
  SocialDataProvider,
  TokenDataProvider,
  WalletDataProvider,
} from '../types';

/**
 * Live provider bundle.
 *
 * The app never talks to an upstream data vendor directly — it talks only to
 * the MOVA backend, which holds the API keys and does the fan-out. That keeps
 * secrets off the device entirely (anything bundled into a React Native app is
 * readable by anyone who downloads it) and lets one cache serve every client.
 *
 * Everything that crosses this boundary is re-validated by `@/core/normalize`
 * before it reaches a screen, even though it came from our own server: the
 * server's own inputs are third-party APIs and unaudited token metadata.
 */

const DEFAULT_TIMEOUT_MS = 12_000;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function liveMeta(raw: unknown, fallbackSources: string[]): DataMeta {
  const m = isRecord(raw) ? raw : {};
  const sources = Array.isArray(m.sources)
    ? m.sources.filter((s): s is string => typeof s === 'string').slice(0, 8)
    : fallbackSources;
  const missing = Array.isArray(m.missing)
    ? m.missing.filter((s): s is string => typeof s === 'string').slice(0, 24)
    : undefined;
  return {
    origin: 'live',
    fetchedAt: toNumber(m.fetchedAt) ?? Date.now(),
    sources: sources.length > 0 ? sources : fallbackSources,
    missing,
  };
}

export function createHttpClient(baseUrl: string) {
  const root = baseUrl.replace(/\/+$/, '');

  return async function request(path: string, signal?: AbortSignal): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true });

    try {
      const response = await fetch(`${root}${path}`, {
        signal: controller.signal,
        headers: { Accept: 'application/json', 'X-MOVA-Client': 'mobile' },
      });

      if (!response.ok) {
        // 4xx is a client problem and will not fix itself on retry; 5xx and 429 will.
        const retryable = response.status >= 500 || response.status === 429;
        throw new ApiError(`Request failed (${response.status})`, response.status, retryable);
      }

      const text = await response.text();
      // A body that is not JSON means a proxy or captive portal answered, not us.
      try {
        return JSON.parse(text) as unknown;
      } catch {
        throw new ApiError('The server returned a response MOVA could not read.', response.status, true);
      }
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
    }
  };
}

const RISKS: RiskLevel[] = ['low', 'moderate', 'elevated', 'high'];

function normalizeSummary(raw: unknown): TokenSummary | null {
  if (!isRecord(raw)) return null;
  const ref = normalizeTokenRef(raw.ref ?? raw);
  if (ref == null) return null;

  const score = toNumber(raw.score);
  const spark = Array.isArray(raw.spark)
    ? raw.spark.map(toNumber).filter((n): n is number => n != null && n > 0).slice(0, 120)
    : [];

  return {
    ref,
    market: normalizeMarket(raw.market),
    score: score != null && score >= 0 && score <= 100 ? score : null,
    risk: RISKS.includes(raw.risk as RiskLevel) ? (raw.risk as RiskLevel) : 'elevated',
    spark,
  };
}

function normalizeSummaries(raw: unknown): TokenSummary[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, 500)
    .map(normalizeSummary)
    .filter((s): s is TokenSummary => s !== null);
}

function normalizeOverview(raw: unknown): MarketOverview {
  const o = isRecord(raw) ? raw : {};
  return {
    solPriceUsd: toUsd(o.solPriceUsd),
    solChange24h: toChangePct(o.solChange24h),
    sentiment: toPct(o.sentiment),
    memeMomentum: toPct(o.memeMomentum),
    totalVolume24hUsd: toUsd(o.totalVolume24hUsd),
    newTokens24h: toCount(o.newTokens24h),
    graduated24h: toCount(o.graduated24h),
    advancersPct: toPct(o.advancersPct),
  };
}

function normalizeHolders(raw: unknown): Holder[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, 100)
    .map((item): Holder | null => {
      if (!isRecord(item)) return null;
      const address = toSolanaAddress(item.address);
      const pct = toPct(item.pct);
      if (address == null || pct == null) return null;
      return {
        address,
        label: typeof item.label === 'string' ? item.label.slice(0, 32) : null,
        pct,
        valueUsd: toUsd(item.valueUsd),
        tag: 'unknown',
        isContract: item.isContract === true,
      };
    })
    .filter((h): h is Holder => h !== null);
}

function normalizeAnalysis(raw: unknown): AiAnalysis {
  const o = isRecord(raw) ? raw : {};
  const sections = Array.isArray(o.sections)
    ? o.sections
        .slice(0, 8)
        .map((s) => {
          if (!isRecord(s)) return null;
          const tone = s.tone === 'positive' || s.tone === 'warning' ? s.tone : 'neutral';
          const title = typeof s.title === 'string' ? s.title.slice(0, 80) : null;
          const body = typeof s.body === 'string' ? s.body.slice(0, 1200) : null;
          if (title == null || body == null) return null;
          return { tone, title, body } as const;
        })
        .filter((s): s is { tone: 'positive' | 'neutral' | 'warning'; title: string; body: string } => s !== null)
    : [];

  return {
    headline: typeof o.headline === 'string' ? o.headline.slice(0, 240) : 'Analysis unavailable.',
    sections,
    dataGaps: Array.isArray(o.dataGaps)
      ? o.dataGaps.filter((g): g is string => typeof g === 'string').slice(0, 12)
      : [],
    generatedAt: toNumber(o.generatedAt) ?? Date.now(),
  };
}

function encodeQuery(query: DiscoverQuery): string {
  const params = new URLSearchParams();
  params.set('sort', query.sort);
  params.set('direction', query.direction);
  params.set('limit', String(query.limit));
  if (query.cursor) params.set('cursor', query.cursor);

  const f = query.filters;
  const ranges: [string, { min: number | null; max: number | null }][] = [
    ['marketCap', f.marketCapUsd],
    ['liquidity', f.liquidityUsd],
    ['age', f.ageHours],
    ['volume24h', f.volume24hUsd],
    ['vlr', f.volumeToLiquidity],
    ['holders', f.holders],
    ['txns24h', f.txns24h],
    ['buyRatio', f.buyRatio],
    ['momentum', f.momentum],
    ['score', f.movaScore],
  ];
  for (const [key, range] of ranges) {
    if (range.min != null) params.set(`${key}Min`, String(range.min));
    if (range.max != null) params.set(`${key}Max`, String(range.max));
  }
  if (f.riskLevels.length > 0) params.set('risk', f.riskLevels.join(','));
  if (f.requireMintRevoked) params.set('mintRevoked', '1');
  if (f.requireFreezeRevoked) params.set('freezeRevoked', '1');
  if (f.excludeHoneypots) params.set('excludeHoneypots', '1');
  if (f.search.trim()) params.set('q', f.search.trim().slice(0, 64));

  return params.toString();
}

export function createHttpProviders(baseUrl: string): ProviderBundle {
  const request = createHttpClient(baseUrl);

  const unwrap = (raw: unknown): { data: unknown; metaRaw: unknown } => {
    const o = isRecord(raw) ? raw : {};
    return { data: o.data, metaRaw: o.meta };
  };

  const market: MarketDataProvider = {
    async getOverview(signal) {
      const { data, metaRaw } = unwrap(await request('/v1/market/overview', signal));
      return { data: normalizeOverview(data), meta: liveMeta(metaRaw, ['MOVA backend']) };
    },
    async getTrending(signal) {
      const { data, metaRaw } = unwrap(await request('/v1/market/trending', signal));
      return { data: normalizeSummaries(data), meta: liveMeta(metaRaw, ['MOVA backend']) };
    },
    async getTopMovers(signal) {
      const { data, metaRaw } = unwrap(await request('/v1/market/movers', signal));
      return { data: normalizeSummaries(data), meta: liveMeta(metaRaw, ['MOVA backend']) };
    },
    async getUnusualVolume(signal) {
      const { data, metaRaw } = unwrap(await request('/v1/market/unusual', signal));
      return { data: normalizeSummaries(data), meta: liveMeta(metaRaw, ['MOVA backend']) };
    },
  };

  const token: TokenDataProvider = {
    async discover(query, signal) {
      const { data, metaRaw } = unwrap(await request(`/v1/tokens?${encodeQuery(query)}`, signal));
      const o = isRecord(data) ? data : {};
      const page: Page<TokenSummary> = {
        items: normalizeSummaries(o.items),
        nextCursor: typeof o.nextCursor === 'string' ? o.nextCursor.slice(0, 128) : null,
      };
      return { data: page, meta: liveMeta(metaRaw, ['MOVA backend']) };
    },

    async getToken(address, signal) {
      const safe = toSolanaAddress(address);
      if (safe == null) throw new ApiError('That does not look like a Solana token address.', 400, false);
      const { data, metaRaw } = unwrap(await request(`/v1/tokens/${safe}`, signal));
      const detail: TokenDetail | null = normalizeTokenDetail(data);
      if (detail == null) throw new ApiError('The server returned a token MOVA could not read.', 502, true);
      return { data: detail, meta: liveMeta(metaRaw, ['MOVA backend']) };
    },

    async getSummaries(addresses, signal) {
      const safe = addresses.map(toSolanaAddress).filter((a): a is string => a !== null);
      if (safe.length === 0) return { data: [], meta: liveMeta(null, ['MOVA backend']) };
      const { data, metaRaw } = unwrap(await request(`/v1/tokens/batch?addresses=${safe.join(',')}`, signal));
      return { data: normalizeSummaries(data), meta: liveMeta(metaRaw, ['MOVA backend']) };
    },

    async getCandles(address, timeframe: Timeframe, signal) {
      const safe = toSolanaAddress(address);
      if (safe == null) throw new ApiError('That does not look like a Solana token address.', 400, false);
      const { data, metaRaw } = unwrap(await request(`/v1/tokens/${safe}/candles?tf=${timeframe}`, signal));
      const candles: Candle[] = normalizeCandles(data);
      return { data: candles, meta: liveMeta(metaRaw, ['MOVA backend']) };
    },

    async search(query, signal) {
      const q = query.trim().slice(0, 64);
      if (q.length === 0) return { data: [], meta: liveMeta(null, ['MOVA backend']) };
      const { data, metaRaw } = unwrap(await request(`/v1/search?q=${encodeURIComponent(q)}`, signal));
      return { data: normalizeSummaries(data), meta: liveMeta(metaRaw, ['MOVA backend']) };
    },
  };

  const holders: HolderDataProvider = {
    async getTopHolders(address, signal) {
      const safe = toSolanaAddress(address);
      if (safe == null) return { data: [], meta: liveMeta(null, ['MOVA backend']) };
      const { data, metaRaw } = unwrap(await request(`/v1/tokens/${safe}/holders`, signal));
      return { data: normalizeHolders(data), meta: liveMeta(metaRaw, ['MOVA backend']) };
    },
  };

  const wallets: WalletDataProvider = {
    async getWalletEvents(address, signal) {
      const safe = toSolanaAddress(address);
      if (safe == null) return { data: [], meta: liveMeta(null, ['MOVA backend']) };
      const { data, metaRaw } = unwrap(await request(`/v1/tokens/${safe}/wallets`, signal));
      const events: WalletEvent[] = Array.isArray(data)
        ? data
            .slice(0, 100)
            .map((e, i) => normalizeWalletEvent(e, i))
            .filter((e): e is WalletEvent => e !== null)
        : [];
      return { data: events, meta: liveMeta(metaRaw, ['MOVA backend']) };
    },
  };

  const social: SocialDataProvider = {
    async getSocial(address, signal) {
      const safe = toSolanaAddress(address);
      const empty: SocialSignal = {
        mentions24h: null,
        mentionsGrowthPct: null,
        uniqueAuthors24h: null,
        botLikelihoodPct: null,
        kolMentions24h: null,
        authenticity: 'unknown',
        links: { website: null, twitter: null, telegram: null },
      };
      if (safe == null) return { data: empty, meta: liveMeta(null, ['MOVA backend']) };
      const { data, metaRaw } = unwrap(await request(`/v1/tokens/${safe}/social`, signal));
      const o = isRecord(data) ? data : {};
      const links = isRecord(o.links) ? o.links : {};
      return {
        data: {
          mentions24h: toCount(o.mentions24h),
          mentionsGrowthPct: toChangePct(o.mentionsGrowthPct),
          uniqueAuthors24h: toCount(o.uniqueAuthors24h),
          botLikelihoodPct: toPct(o.botLikelihoodPct),
          kolMentions24h: toCount(o.kolMentions24h),
          authenticity:
            o.authenticity === 'organic' || o.authenticity === 'mixed' || o.authenticity === 'coordinated'
              ? o.authenticity
              : 'unknown',
          links: {
            website: toSafeUrl(links.website),
            twitter: toSafeUrl(links.twitter),
            telegram: toSafeUrl(links.telegram),
          },
        },
        meta: liveMeta(metaRaw, ['MOVA backend']),
      };
    },
  };

  const analysis: AnalysisProvider = {
    async analyze(detail, _score, signal) {
      const { data, metaRaw } = unwrap(
        await request(`/v1/tokens/${detail.ref.address}/analysis`, signal),
      );
      return { data: normalizeAnalysis(data), meta: liveMeta(metaRaw, ['MOVA analysis service']) };
    },
  };

  return { name: 'MOVA backend', origin: 'live', market, token, holders, wallets, social, analysis };
}

export { computeMovaScore };
