import type { RiskLevel } from '@/theme/colors';

export type { RiskLevel };

/** Where a piece of data came from. Surfaced in the UI — mock is always labelled. */
export type DataOrigin = 'live' | 'mock';

export interface DataMeta {
  origin: DataOrigin;
  fetchedAt: number;
  /** Human-readable upstream names, e.g. ['DexScreener', 'Helius']. */
  sources: string[];
  /** Fields the provider could not supply. Rendered as "Data unavailable". */
  missing?: string[];
}

export interface WithMeta<T> {
  data: T;
  meta: DataMeta;
}

export interface TokenRef {
  address: string;
  symbol: string;
  name: string;
  logoUri: string | null;
  chain: 'solana';
}

export interface TxnCounts {
  buys: number | null;
  sells: number | null;
}

export interface TokenMarket {
  priceUsd: number | null;
  marketCapUsd: number | null;
  fdvUsd: number | null;
  liquidityUsd: number | null;
  volume1hUsd: number | null;
  volume24hUsd: number | null;
  change5m: number | null;
  change1h: number | null;
  change6h: number | null;
  change24h: number | null;
  txns1h: TxnCounts;
  txns24h: TxnCounts;
  holders: number | null;
  /** Unix ms of pair creation. */
  createdAt: number | null;
  pairAddress: string | null;
  dexId: string | null;
}

export interface TokenSecurity {
  mintAuthorityRevoked: boolean | null;
  freezeAuthorityRevoked: boolean | null;
  /** Percent of LP tokens burned, 0-100. */
  lpBurnedPct: number | null;
  lpLocked: boolean | null;
  /** Combined share held by the top 10 holders, 0-100. */
  top10HolderPct: number | null;
  devHoldingPct: number | null;
  devSoldPct: number | null;
  insiderPct: number | null;
  bundledPct: number | null;
  sniperPct: number | null;
  /** Whether sells have been observed to succeed. null = not verified. */
  sellsSucceeding: boolean | null;
  /** Percent change in pool liquidity over 24h. */
  liquidityChange24hPct: number | null;
}

export type WalletTag = 'whale' | 'smart' | 'dev' | 'insider' | 'sniper' | 'unknown';

export interface WalletEvent {
  id: string;
  address: string;
  label: string | null;
  tag: WalletTag;
  action: 'buy' | 'sell';
  amountUsd: number;
  at: number;
  /** Historical realised PnL of this wallet, if the provider tracks it. */
  wallet30dPnlUsd: number | null;
}

export interface SmartMoney {
  netFlow24hUsd: number | null;
  whaleBuys24h: number | null;
  whaleSells24h: number | null;
  smartWalletHolders: number | null;
  events: WalletEvent[];
}

export type SocialAuthenticity = 'organic' | 'mixed' | 'coordinated' | 'unknown';

export interface SocialSignal {
  mentions24h: number | null;
  mentionsGrowthPct: number | null;
  uniqueAuthors24h: number | null;
  /** Share of mentions that look automated, 0-100. Heuristic, not certainty. */
  botLikelihoodPct: number | null;
  kolMentions24h: number | null;
  authenticity: SocialAuthenticity;
  links: { website: string | null; twitter: string | null; telegram: string | null };
}

export interface Candle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export type Timeframe = '5m' | '15m' | '1h' | '4h' | '1d';

/** Everything the Discover / Home lists need for one row. Cheap to fetch. */
export interface TokenSummary {
  ref: TokenRef;
  market: TokenMarket;
  score: number | null;
  risk: RiskLevel;
  /** Recent closes for the row sparkline. */
  spark: number[];
}

/** Full token payload used by the detail screen. */
export interface TokenDetail {
  ref: TokenRef;
  market: TokenMarket;
  security: TokenSecurity;
  smartMoney: SmartMoney;
  social: SocialSignal;
}

export interface MarketOverview {
  solPriceUsd: number | null;
  solChange24h: number | null;
  /** 0-100 aggregate meme-market sentiment. */
  sentiment: number | null;
  /** 0-100 breadth/momentum of the meme sector. */
  memeMomentum: number | null;
  totalVolume24hUsd: number | null;
  newTokens24h: number | null;
  graduated24h: number | null;
  /** Percent of tracked tokens up over 24h. */
  advancersPct: number | null;
}

export type AlertKind =
  | 'momentum_spike'
  | 'whale_accumulation'
  | 'dev_selling'
  | 'liquidity_change'
  | 'breakout'
  | 'score_change'
  | 'volume_spike'
  | 'risk_change';

export type AlertSeverity = 'info' | 'positive' | 'warning' | 'critical';

export interface AlertEvent {
  id: string;
  kind: AlertKind;
  severity: AlertSeverity;
  tokenAddress: string;
  tokenSymbol: string;
  tokenLogo: string | null;
  title: string;
  body: string;
  at: number;
  read: boolean;
  origin: DataOrigin;
}

export interface Holder {
  address: string;
  label: string | null;
  /** Share of total supply, 0-100. */
  pct: number;
  valueUsd: number | null;
  tag: WalletTag;
  isContract: boolean;
}
