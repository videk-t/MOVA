import type {
  Candle,
  DataOrigin,
  Holder,
  MarketOverview,
  RiskLevel,
  SocialSignal,
  Timeframe,
  TokenDetail,
  TokenSummary,
  WalletEvent,
  WithMeta,
} from '@/core/types';
import type { MovaScore } from '@/core/scoring';

/**
 * Provider contracts.
 *
 * Nothing above this layer knows which upstream served a request. Swapping
 * DexScreener for Birdeye, or the mock generator for the live backend, is a
 * change to a factory in `./index.ts` and nothing else.
 *
 * Every method resolves to {@link WithMeta} so the origin of the data travels
 * with it and the UI can label demo data honestly.
 */

export type SortKey =
  | 'score'
  | 'marketCap'
  | 'volume24h'
  | 'liquidity'
  | 'change1h'
  | 'change24h'
  | 'age'
  | 'holders';

export interface Range {
  min: number | null;
  max: number | null;
}

export interface DiscoverFilters {
  marketCapUsd: Range;
  liquidityUsd: Range;
  /** Token age in hours. */
  ageHours: Range;
  volume24hUsd: Range;
  /** 24h volume divided by pool liquidity. */
  volumeToLiquidity: Range;
  holders: Range;
  txns24h: Range;
  /** Buys as a share of all 1h transactions, 0-1. */
  buyRatio: Range;
  momentum: Range;
  movaScore: Range;
  riskLevels: RiskLevel[];
  /** Only tokens whose mint authority is revoked. */
  requireMintRevoked: boolean;
  requireFreezeRevoked: boolean;
  /** Hide tokens where sells have been observed to fail. */
  excludeHoneypots: boolean;
  search: string;
}

export interface DiscoverQuery {
  filters: DiscoverFilters;
  sort: SortKey;
  direction: 'asc' | 'desc';
  limit: number;
  /** Opaque cursor from a previous page. */
  cursor?: string | null;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export type AiTone = 'positive' | 'neutral' | 'warning';

export interface AiSection {
  tone: AiTone;
  title: string;
  body: string;
}

export interface AiAnalysis {
  /** One-line framing. Never a recommendation to buy or sell. */
  headline: string;
  sections: AiSection[];
  /** Facts the analysis could not consider because the data was missing. */
  dataGaps: string[];
  generatedAt: number;
}

export interface MarketDataProvider {
  getOverview(signal?: AbortSignal): Promise<WithMeta<MarketOverview>>;
  /** Curated home-screen rails. */
  getTrending(signal?: AbortSignal): Promise<WithMeta<TokenSummary[]>>;
  getTopMovers(signal?: AbortSignal): Promise<WithMeta<TokenSummary[]>>;
  getUnusualVolume(signal?: AbortSignal): Promise<WithMeta<TokenSummary[]>>;
}

export interface TokenDataProvider {
  discover(query: DiscoverQuery, signal?: AbortSignal): Promise<WithMeta<Page<TokenSummary>>>;
  getToken(address: string, signal?: AbortSignal): Promise<WithMeta<TokenDetail>>;
  getSummaries(addresses: string[], signal?: AbortSignal): Promise<WithMeta<TokenSummary[]>>;
  getCandles(address: string, timeframe: Timeframe, signal?: AbortSignal): Promise<WithMeta<Candle[]>>;
  search(query: string, signal?: AbortSignal): Promise<WithMeta<TokenSummary[]>>;
}

export interface HolderDataProvider {
  getTopHolders(address: string, signal?: AbortSignal): Promise<WithMeta<Holder[]>>;
}

export interface WalletDataProvider {
  getWalletEvents(address: string, signal?: AbortSignal): Promise<WithMeta<WalletEvent[]>>;
}

export interface SocialDataProvider {
  getSocial(address: string, signal?: AbortSignal): Promise<WithMeta<SocialSignal>>;
}

export interface AnalysisProvider {
  /**
   * Explain the data. Implementations must not introduce metrics that are not
   * present in the inputs, and must say so when a signal is missing.
   */
  analyze(detail: TokenDetail, score: MovaScore, signal?: AbortSignal): Promise<WithMeta<AiAnalysis>>;
}

export interface ProviderBundle {
  /** Human-readable name shown in Profile → Data sources. */
  name: string;
  origin: DataOrigin;
  market: MarketDataProvider;
  token: TokenDataProvider;
  holders: HolderDataProvider;
  wallets: WalletDataProvider;
  social: SocialDataProvider;
  analysis: AnalysisProvider;
}

export const DEFAULT_FILTERS: DiscoverFilters = {
  marketCapUsd: { min: null, max: null },
  liquidityUsd: { min: null, max: null },
  ageHours: { min: null, max: null },
  volume24hUsd: { min: null, max: null },
  volumeToLiquidity: { min: null, max: null },
  holders: { min: null, max: null },
  txns24h: { min: null, max: null },
  buyRatio: { min: null, max: null },
  momentum: { min: null, max: null },
  movaScore: { min: null, max: null },
  riskLevels: [],
  requireMintRevoked: false,
  requireFreezeRevoked: false,
  excludeHoneypots: true,
  search: '',
};

export interface DiscoverPreset {
  id: string;
  emoji: string;
  label: string;
  description: string;
  sort: SortKey;
  direction: 'asc' | 'desc';
  filters: Partial<DiscoverFilters>;
}

/**
 * Presets are the primary way users reach a useful list. Each one encodes a
 * question a trader actually asks, not an arbitrary filter combination.
 */
export const DISCOVER_PRESETS: DiscoverPreset[] = [
  {
    id: 'trending',
    emoji: '🔥',
    label: 'Trending',
    description: 'Tokens drawing the most volume against their pool size right now.',
    sort: 'volume24h',
    direction: 'desc',
    filters: { liquidityUsd: { min: 15_000, max: null }, excludeHoneypots: true },
  },
  {
    id: 'momentum',
    emoji: '🚀',
    label: 'Momentum',
    description: 'Rising on the hour with real turnover behind the move.',
    sort: 'change1h',
    direction: 'desc',
    filters: {
      momentum: { min: 60, max: null },
      liquidityUsd: { min: 20_000, max: null },
      excludeHoneypots: true,
    },
  },
  {
    id: 'fundamentals',
    emoji: '💎',
    label: 'Strong structure',
    description: 'Revoked authorities, burned liquidity and spread-out holders.',
    sort: 'score',
    direction: 'desc',
    filters: {
      movaScore: { min: 70, max: null },
      riskLevels: ['low', 'moderate'],
      requireMintRevoked: true,
      requireFreezeRevoked: true,
      excludeHoneypots: true,
    },
  },
  {
    id: 'new',
    emoji: '🆕',
    label: 'New',
    description: 'Launched in the last 24 hours and already holding a pool.',
    sort: 'age',
    direction: 'asc',
    filters: { ageHours: { min: null, max: 24 }, liquidityUsd: { min: 8_000, max: null } },
  },
  {
    id: 'smart-money',
    emoji: '🐋',
    label: 'Smart money',
    description: 'Where wallets with a profitable history are net buyers.',
    sort: 'score',
    direction: 'desc',
    filters: { movaScore: { min: 55, max: null }, liquidityUsd: { min: 25_000, max: null } },
  },
  {
    id: 'unusual',
    emoji: '⚡',
    label: 'Unusual activity',
    description: 'Volume far out of line with the pool — worth a closer look.',
    sort: 'volume24h',
    direction: 'desc',
    filters: { volumeToLiquidity: { min: 3, max: null } },
  },
];
