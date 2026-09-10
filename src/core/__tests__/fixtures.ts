import type { TokenDetail, TokenMarket, TokenSecurity } from '../types';

const HOUR = 3_600_000;

export const cleanMarket: TokenMarket = {
  priceUsd: 0.0000124,
  marketCapUsd: 1_240_000,
  fdvUsd: 1_260_000,
  liquidityUsd: 150_000,
  volume1hUsd: 90_000,
  volume24hUsd: 1_400_000,
  change5m: 1.2,
  change1h: 14.5,
  change6h: 32.1,
  change24h: 47.2,
  txns1h: { buys: 420, sells: 210 },
  txns24h: { buys: 5_100, sells: 3_800 },
  holders: 4_820,
  createdAt: Date.now() - 30 * 24 * HOUR,
  pairAddress: 'BpQ8Yy2rXwT4kL9mNvZaCdEfGhJkMnPqRsTuVwXyZ12',
  dexId: 'raydium',
};

export const cleanSecurity: TokenSecurity = {
  mintAuthorityRevoked: true,
  freezeAuthorityRevoked: true,
  lpBurnedPct: 98,
  lpLocked: true,
  top10HolderPct: 16,
  devHoldingPct: 0.8,
  devSoldPct: 0,
  insiderPct: 3,
  bundledPct: 5,
  sniperPct: 4,
  sellsSucceeding: true,
  liquidityChange24hPct: 12,
};

export function makeDetail(overrides: {
  market?: Partial<TokenMarket>;
  security?: Partial<TokenSecurity>;
  smartMoney?: Partial<TokenDetail['smartMoney']>;
  social?: Partial<TokenDetail['social']>;
} = {}): TokenDetail {
  return {
    ref: {
      address: '7xKXtg2CW3xM8mQvKzYbNpRdFhJnLsWuVaBcDeFgHi9',
      symbol: 'ABC',
      name: 'Alpha Beta Coin',
      logoUri: null,
      chain: 'solana',
    },
    market: { ...cleanMarket, ...overrides.market },
    security: { ...cleanSecurity, ...overrides.security },
    smartMoney: {
      netFlow24hUsd: 42_000,
      whaleBuys24h: 9,
      whaleSells24h: 3,
      smartWalletHolders: 14,
      events: [],
      ...overrides.smartMoney,
    },
    social: {
      mentions24h: 1_800,
      mentionsGrowthPct: 140,
      uniqueAuthors24h: 620,
      botLikelihoodPct: 18,
      kolMentions24h: 4,
      authenticity: 'organic',
      links: { website: null, twitter: null, telegram: null },
      ...overrides.social,
    },
  };
}

/** Every field null — the "provider knows nothing" case. */
export const emptyMarket: TokenMarket = {
  priceUsd: null,
  marketCapUsd: null,
  fdvUsd: null,
  liquidityUsd: null,
  volume1hUsd: null,
  volume24hUsd: null,
  change5m: null,
  change1h: null,
  change6h: null,
  change24h: null,
  txns1h: { buys: null, sells: null },
  txns24h: { buys: null, sells: null },
  holders: null,
  createdAt: null,
  pairAddress: null,
  dexId: null,
};

export const emptySecurity: TokenSecurity = {
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

export function makeEmptyDetail(): TokenDetail {
  return {
    ref: {
      address: '7xKXtg2CW3xM8mQvKzYbNpRdFhJnLsWuVaBcDeFgHi9',
      symbol: 'GHOST',
      name: 'Ghost Data',
      logoUri: null,
      chain: 'solana',
    },
    market: { ...emptyMarket },
    security: { ...emptySecurity },
    smartMoney: {
      netFlow24hUsd: null,
      whaleBuys24h: null,
      whaleSells24h: null,
      smartWalletHolders: null,
      events: [],
    },
    social: {
      mentions24h: null,
      mentionsGrowthPct: null,
      uniqueAuthors24h: null,
      botLikelihoodPct: null,
      kolMentions24h: null,
      authenticity: 'unknown',
      links: { website: null, twitter: null, telegram: null },
    },
  };
}
