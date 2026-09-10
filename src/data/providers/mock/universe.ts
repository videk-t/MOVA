import type {
  Candle,
  Holder,
  SocialSignal,
  Timeframe,
  TokenDetail,
  TokenSecurity,
  WalletEvent,
  WalletTag,
} from '@/core/types';

/**
 * Deterministic mock universe.
 *
 * Every value here is derived from a seed plus the current clock, so the demo
 * evolves as you watch it while staying reproducible across devices and test
 * runs. Prices, candles, volume and the quoted 1h/24h changes all come from one
 * underlying price function, which means the chart and the headline numbers can
 * never disagree with each other the way naive random mocks do.
 *
 * This is clearly-labelled demo data. It is never presented as live.
 */

// ---------------------------------------------------------------------------
// Deterministic randomness
// ---------------------------------------------------------------------------

function hashString(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32 — small, fast, good enough for fixtures. */
function rngFrom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashedUnit(seed: number, n: number): number {
  let h = (seed ^ Math.imul(n | 0, 0x27d4eb2d)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), h | 1) >>> 0;
  h ^= h + Math.imul(h ^ (h >>> 7), h | 61);
  return ((h ^ (h >>> 14)) >>> 0) / 4294967296;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Smooth 1-D value noise in [-1, 1]. */
function valueNoise(seed: number, x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const a = hashedUnit(seed, i);
  const b = hashedUnit(seed, i + 1);
  return (a + (b - a) * smoothstep(f)) * 2 - 1;
}

const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function fakeAddress(seed: number, length = 44): string {
  const rand = rngFrom(seed);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += BASE58[Math.floor(rand() * BASE58.length)] ?? '1';
  }
  return out;
}

// ---------------------------------------------------------------------------
// Token catalogue
// ---------------------------------------------------------------------------

interface SeedToken {
  symbol: string;
  name: string;
  /** Rough market-cap tier, used to pick a plausible starting size. */
  tier: 'micro' | 'small' | 'mid' | 'large';
  /** Overall character — drives volatility, safety profile and social shape. */
  archetype: 'clean' | 'hyped' | 'degen' | 'fading' | 'suspicious' | 'honeypot' | 'sparse';
  hasLogo?: boolean;
}

/**
 * Fictional tokens. Deliberately invented so demo data can never be mistaken
 * for a real market, and chosen to cover the edge cases the UI must survive:
 * very long names, missing logos, billion-dollar caps, honeypots, and tokens
 * with almost no data at all.
 */
const CATALOGUE: SeedToken[] = [
  { symbol: 'PONDR', name: 'Pondering Orb', tier: 'mid', archetype: 'clean' },
  { symbol: 'GRUMPY', name: 'Grumpy Capybara', tier: 'small', archetype: 'hyped' },
  { symbol: 'MOONPIE', name: 'Moonpie Protocol', tier: 'large', archetype: 'clean' },
  { symbol: 'SLUG', name: 'Turbo Slug', tier: 'micro', archetype: 'degen' },
  { symbol: 'HAMSTR', name: 'Hamster Republic', tier: 'mid', archetype: 'hyped' },
  { symbol: 'VOID', name: 'Staring Into The Void', tier: 'small', archetype: 'fading' },
  { symbol: 'NAPKIN', name: 'Napkin Math', tier: 'small', archetype: 'clean' },
  { symbol: 'BONKR', name: 'Bonker Deluxe', tier: 'mid', archetype: 'degen' },
  { symbol: 'FROGZ', name: 'Frogs Of Solana', tier: 'large', archetype: 'clean' },
  { symbol: 'SPOON', name: 'There Is No Spoon', tier: 'micro', archetype: 'suspicious' },
  { symbol: 'YAWN', name: 'Yawn Finance', tier: 'micro', archetype: 'fading' },
  { symbol: 'GIGACAT', name: 'Gigachad Cat', tier: 'mid', archetype: 'hyped' },
  { symbol: 'PLNKTN', name: 'Plankton Season', tier: 'micro', archetype: 'degen' },
  { symbol: 'WIZRD', name: 'Wizard Hours', tier: 'small', archetype: 'clean' },
  { symbol: 'TOAST', name: 'Buttered Toast', tier: 'small', archetype: 'hyped' },
  { symbol: 'RUGME', name: 'Definitely Not A Rug', tier: 'micro', archetype: 'honeypot' },
  { symbol: 'QUOKKA', name: 'Quokka Selfie', tier: 'mid', archetype: 'clean' },
  { symbol: 'DUSTY', name: 'Dusty Wallet', tier: 'micro', archetype: 'fading' },
  { symbol: 'NEONX', name: 'Neon Crossing', tier: 'small', archetype: 'degen' },
  { symbol: 'MOCHI', name: 'Mochi Dreams', tier: 'mid', archetype: 'hyped' },
  { symbol: 'PIXEL', name: 'Pixel Pusher', tier: 'small', archetype: 'clean' },
  { symbol: 'SNAIL', name: 'Speedy Snail', tier: 'micro', archetype: 'degen' },
  { symbol: 'ORCA9', name: 'Orca Nine', tier: 'large', archetype: 'clean' },
  { symbol: 'GLOOM', name: 'Gloom And Doom', tier: 'small', archetype: 'fading' },
  { symbol: 'CHONK', name: 'Absolute Chonker', tier: 'mid', archetype: 'hyped' },
  { symbol: 'TINFOL', name: 'Tinfoil Hat Society', tier: 'micro', archetype: 'suspicious' },
  { symbol: 'BLOOP', name: 'Bloop', tier: 'small', archetype: 'clean' },
  { symbol: 'ZOOMR', name: 'Zoomer Energy', tier: 'mid', archetype: 'degen' },
  { symbol: 'CRUMB', name: 'Breadcrumb', tier: 'micro', archetype: 'fading' },
  { symbol: 'HYPRLQ', name: 'Hyper Liquid Cat', tier: 'small', archetype: 'hyped' },
  { symbol: 'MAGMA', name: 'Magma Chamber', tier: 'mid', archetype: 'clean' },
  { symbol: 'NOOB', name: 'Noob Trader', tier: 'micro', archetype: 'degen' },
  { symbol: 'SIGMA', name: 'Sigma Grindset Coin', tier: 'small', archetype: 'suspicious' },
  { symbol: 'PANDA', name: 'Panda Panic', tier: 'mid', archetype: 'hyped' },
  { symbol: 'ECHO', name: 'Echo Chamber', tier: 'small', archetype: 'fading' },
  { symbol: 'KETTLE', name: 'Kettle Logic', tier: 'micro', archetype: 'clean' },
  { symbol: 'DRIFT', name: 'Continental Drift', tier: 'large', archetype: 'clean' },
  { symbol: 'SPARK', name: 'Spark Plug', tier: 'small', archetype: 'degen' },
  { symbol: 'WHALE', name: 'Whale Watching', tier: 'mid', archetype: 'hyped' },
  { symbol: 'RIBBIT', name: 'Ribbit Reloaded', tier: 'micro', archetype: 'suspicious' },
  { symbol: 'CLOUD', name: 'Cloud Nine Cartel', tier: 'small', archetype: 'clean' },
  { symbol: 'GRAVY', name: 'Gravy Train', tier: 'mid', archetype: 'degen' },
  { symbol: 'MITTEN', name: 'Mittens On Main', tier: 'micro', archetype: 'fading' },
  { symbol: 'THUNDR', name: 'Thunder Lizard', tier: 'small', archetype: 'hyped' },
  { symbol: 'ATLAS', name: 'Atlas Shrugged Again', tier: 'large', archetype: 'clean' },
  { symbol: 'PEBBLE', name: 'Pebble In My Shoe', tier: 'micro', archetype: 'degen' },
  { symbol: 'SAUCE', name: 'Secret Sauce', tier: 'small', archetype: 'suspicious' },
  { symbol: 'NIMBUS', name: 'Nimbus Drift', tier: 'mid', archetype: 'clean' },
  {
    symbol: 'LONGCAT',
    name: 'The Extraordinarily Long Cat Of Infinite Length And Patience',
    tier: 'small',
    archetype: 'hyped',
  },
  { symbol: 'NOLOGO', name: 'Unbranded Coin', tier: 'micro', archetype: 'degen', hasLogo: false },
  { symbol: 'GHOST', name: 'Ghost Data', tier: 'micro', archetype: 'sparse', hasLogo: false },
  { symbol: 'EMBER', name: 'Ember Falls', tier: 'small', archetype: 'fading' },
  { symbol: 'JELLY', name: 'Jellyfish Hours', tier: 'mid', archetype: 'clean' },
  { symbol: 'RADAR', name: 'Off The Radar', tier: 'micro', archetype: 'degen' },
  { symbol: 'COMET', name: 'Comet Tail', tier: 'small', archetype: 'hyped' },
  { symbol: 'BASIN', name: 'Basin Street', tier: 'mid', archetype: 'clean' },
];

const TIER_MCAP: Record<SeedToken['tier'], [number, number]> = {
  micro: [18_000, 240_000],
  small: [240_000, 2_400_000],
  mid: [2_400_000, 40_000_000],
  large: [90_000_000, 4_400_000_000],
};

interface ArchetypeProfile {
  /** Daily log-drift. */
  drift: number;
  /** Amplitude of the fast noise component. */
  vol: number;
  /** Liquidity as a share of market cap. */
  depth: number;
  /** Age band in hours. */
  age: [number, number];
  turnover: number;
}

const PROFILES: Record<SeedToken['archetype'], ArchetypeProfile> = {
  clean: { drift: 0.05, vol: 0.09, depth: 0.115, age: [400, 5_000], turnover: 0.5 },
  hyped: { drift: 0.55, vol: 0.28, depth: 0.06, age: [20, 400], turnover: 1.9 },
  degen: { drift: 0.0, vol: 0.42, depth: 0.035, age: [2, 90], turnover: 2.8 },
  fading: { drift: -0.42, vol: 0.16, depth: 0.045, age: [200, 2_000], turnover: 0.25 },
  suspicious: { drift: 0.2, vol: 0.34, depth: 0.022, age: [3, 60], turnover: 3.6 },
  honeypot: { drift: 0.9, vol: 0.5, depth: 0.015, age: [1, 8], turnover: 5.2 },
  sparse: { drift: -0.05, vol: 0.2, depth: 0.05, age: [6, 200], turnover: 0.4 },
};

export interface MockToken {
  seed: SeedToken;
  address: string;
  pairAddress: string;
  rngSeed: number;
  basePrice: number;
  supply: number;
  createdAt: number;
  /** When the universe was generated — the anchor "now" for the price model. */
  builtAt: number;
  profile: ArchetypeProfile;
  liquidityBase: number;
  holdersBase: number;
  dexId: string;
}

const DEXES = ['raydium', 'orca', 'meteora', 'pumpswap'];

let cachedUniverse: MockToken[] | null = null;
let cachedSeedKey = '';

export function getUniverse(seedKey = 'mova-2025'): MockToken[] {
  if (cachedUniverse && cachedSeedKey === seedKey) return cachedUniverse;

  const now = Date.now();
  const universe = CATALOGUE.map((seed, index) => {
    const rngSeed = hashString(`${seedKey}:${seed.symbol}:${index}`);
    const rand = rngFrom(rngSeed);
    const profile = PROFILES[seed.archetype];

    const [mcapLo, mcapHi] = TIER_MCAP[seed.tier];
    // Log-uniform within the tier so caps cluster realistically at the bottom.
    const mcap = Math.exp(Math.log(mcapLo) + rand() * (Math.log(mcapHi) - Math.log(mcapLo)));

    // Supply spans the range real memecoins use: 1M to 1T.
    const supply = 10 ** (6 + Math.floor(rand() * 7)) * (1 + rand() * 4);
    const basePrice = mcap / supply;

    const [ageLo, ageHi] = profile.age;
    const ageHours = ageLo + rand() * (ageHi - ageLo);

    return {
      seed,
      address: fakeAddress(rngSeed),
      pairAddress: fakeAddress(rngSeed ^ 0x9e3779b9),
      rngSeed,
      basePrice,
      supply,
      createdAt: now - ageHours * 3_600_000,
      builtAt: now,
      profile,
      liquidityBase: mcap * profile.depth * (0.7 + rand() * 0.6),
      holdersBase: Math.floor(80 + rand() * rand() * 42_000),
      dexId: DEXES[Math.floor(rand() * DEXES.length)] ?? 'raydium',
    } satisfies MockToken;
  });

  cachedUniverse = universe;
  cachedSeedKey = seedKey;
  return universe;
}

// ---------------------------------------------------------------------------
// Price model
// ---------------------------------------------------------------------------

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** How far back the trend is allowed to accumulate, in days. */
const DRIFT_HORIZON_DAYS = 21;

/** Bound on how far price may stray from base, in natural log units (~0.37x-2.7x). */
const MAX_LOG_DEVIATION = 1;

/**
 * Price at an arbitrary instant. One function drives the chart, the sparkline
 * and every quoted percentage change, so they are always mutually consistent.
 */
export function priceAt(token: MockToken, t: number): number {
  const ageDays = (t - token.createdAt) / DAY;
  if (ageDays < 0) return token.basePrice;

  const { drift, vol } = token.profile;
  const s = token.rngSeed;

  // Three octaves: a multi-day swing, an intraday wave, and minute-scale chop.
  const slow = valueNoise(s, (t - token.createdAt) / (2.5 * DAY)) * vol * 3.2;
  const mid = valueNoise(s ^ 0x5f356495, (t - token.createdAt) / (4 * HOUR)) * vol * 1.5;
  const fast = valueNoise(s ^ 0x1b873593, (t - token.createdAt) / (7 * 60_000)) * vol * 0.55;

  // Drift runs *backwards* from the moment the universe was built, over a
  // bounded horizon. Running it forward from creation compounded without limit:
  // a 200-day-old token at 0.05/day picked up a factor of e^10, which pushed
  // its market cap orders of magnitude past its tier and produced caps in the
  // trillions. Measured backwards, today's price stays anchored to the tier and
  // the drift describes the trend leading into the present.
  const daysBeforeNow = Math.min(Math.max(0, (token.builtAt - t) / DAY), DRIFT_HORIZON_DAYS);
  const driftTerm = -drift * daysBeforeNow;

  // Squash the total log deviation so no combination of noise octaves can send
  // a token far outside its cap tier. tanh keeps it smooth — a hard clamp would
  // draw flat spots into the chart at the extremes.
  const deviation = MAX_LOG_DEVIATION * Math.tanh((driftTerm + slow + mid + fast) / MAX_LOG_DEVIATION);

  const price = Math.exp(Math.log(token.basePrice) + deviation);
  return Number.isFinite(price) && price > 0 ? price : token.basePrice;
}

function changePct(token: MockToken, now: number, windowMs: number): number {
  const then = priceAt(token, now - windowMs);
  const current = priceAt(token, now);
  if (!(then > 0)) return 0;
  return ((current - then) / then) * 100;
}

export function volumeAt(token: MockToken, now: number, windowMs: number): number {
  const liq = liquidityAt(token, now);
  const hours = windowMs / HOUR;
  const churn = token.profile.turnover * (0.55 + 0.9 * ((valueNoise(token.rngSeed ^ 0x2545f491, now / (3 * HOUR)) + 1) / 2));
  // Volume tracks volatility: a token going nowhere is not being traded hard.
  const excitement = 1 + Math.min(3, Math.abs(changePct(token, now, HOUR)) / 22);
  return Math.max(0, liq * churn * hours * excitement * 0.42);
}

export function liquidityAt(token: MockToken, now: number): number {
  const wobble = valueNoise(token.rngSeed ^ 0x85ebca6b, now / (6 * HOUR)) * 0.18;
  // Honeypots and suspicious pools shed liquidity over their short lives.
  const bleed =
    token.seed.archetype === 'honeypot' || token.seed.archetype === 'suspicious'
      ? -0.3 * Math.min(1, (now - token.createdAt) / (2 * DAY))
      : 0;
  return Math.max(500, token.liquidityBase * (1 + wobble + bleed));
}

function txnsIn(token: MockToken, now: number, windowMs: number): { buys: number; sells: number } {
  const volume = volumeAt(token, now, windowMs);
  // Average ticket scales with pool depth: a deep pool sees far larger trades
  // than a fresh micro-cap. A flat average implied millions of transactions a
  // day on the larger tokens, which no Solana pair actually sees.
  const avgTrade =
    30 + Math.sqrt(Math.max(1_000, token.liquidityBase)) * (0.3 + hashedUnit(token.rngSeed, 7) * 0.35);
  const total = Math.max(0, Math.round(volume / avgTrade));
  const momentum = changePct(token, now, HOUR);
  // Buy share leans with the hourly move, bounded so it never reads as certainty.
  const buyShare = Math.min(0.85, Math.max(0.15, 0.5 + momentum / 150));
  const buys = Math.round(total * buyShare);
  return { buys, sells: Math.max(0, total - buys) };
}

export function holdersAt(token: MockToken, now: number): number {
  const growth = Math.max(0, (now - token.createdAt) / DAY) * (token.profile.drift > 0 ? 0.25 : 0.05);
  return Math.floor(token.holdersBase * (1 + growth));
}

// ---------------------------------------------------------------------------
// Security, wallets, social
// ---------------------------------------------------------------------------

export function securityFor(token: MockToken, now: number): TokenSecurity {
  const r = rngFrom(token.rngSeed ^ 0xabcdef);
  const arch = token.seed.archetype;

  if (arch === 'sparse') {
    // A token the providers know almost nothing about — exercises the
    // "Data unavailable" paths end to end.
    return {
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
  }

  const liqChange =
    ((liquidityAt(token, now) - liquidityAt(token, now - DAY)) / Math.max(1, liquidityAt(token, now - DAY))) * 100;

  if (arch === 'honeypot') {
    return {
      mintAuthorityRevoked: false,
      freezeAuthorityRevoked: false,
      lpBurnedPct: 0,
      lpLocked: false,
      top10HolderPct: 71 + r() * 20,
      devHoldingPct: 32 + r() * 25,
      devSoldPct: 0,
      insiderPct: 44 + r() * 30,
      bundledPct: 52 + r() * 30,
      sniperPct: 38 + r() * 20,
      sellsSucceeding: false,
      liquidityChange24hPct: -40 - r() * 40,
    };
  }

  if (arch === 'suspicious') {
    return {
      mintAuthorityRevoked: r() > 0.45,
      freezeAuthorityRevoked: r() > 0.35,
      lpBurnedPct: r() * 45,
      lpLocked: r() > 0.7,
      top10HolderPct: 38 + r() * 30,
      devHoldingPct: 9 + r() * 18,
      devSoldPct: r() > 0.5 ? r() * 14 : 0,
      insiderPct: 16 + r() * 24,
      bundledPct: 20 + r() * 30,
      sniperPct: 14 + r() * 22,
      sellsSucceeding: true,
      liquidityChange24hPct: liqChange,
    };
  }

  const clean = arch === 'clean';
  return {
    mintAuthorityRevoked: clean ? true : r() > 0.12,
    freezeAuthorityRevoked: clean ? true : r() > 0.16,
    lpBurnedPct: clean ? 92 + r() * 8 : 40 + r() * 58,
    lpLocked: clean ? true : r() > 0.4,
    top10HolderPct: clean ? 11 + r() * 14 : 18 + r() * 26,
    devHoldingPct: clean ? r() * 3 : r() * 11,
    devSoldPct: arch === 'fading' && r() > 0.5 ? r() * 8 : 0,
    insiderPct: clean ? r() * 6 : 4 + r() * 16,
    bundledPct: clean ? r() * 8 : 6 + r() * 22,
    sniperPct: clean ? r() * 7 : 5 + r() * 20,
    sellsSucceeding: true,
    liquidityChange24hPct: liqChange,
  };
}

const WALLET_LABELS = [
  'Cobalt Fund',
  'Early Runner',
  'Meridian',
  'Nightshift',
  'Blue Heron',
  'Tidewater',
  'Quarry',
  'Lantern',
  'Northwind',
  'Saltbox',
];

export function walletEventsFor(token: MockToken, now: number, count = 14): WalletEvent[] {
  const r = rngFrom(token.rngSeed ^ 0x1337);
  const liq = liquidityAt(token, now);
  const momentum = changePct(token, now, HOUR);
  const arch = token.seed.archetype;
  const events: WalletEvent[] = [];

  for (let i = 0; i < count; i += 1) {
    const roll = r();
    let tag: WalletTag = 'whale';
    if (roll > 0.82) tag = 'smart';
    else if (roll > 0.74) tag = 'sniper';
    else if (roll > 0.68) tag = 'insider';
    else if (roll > 0.64) tag = 'dev';

    // The deployer only shows up as a seller, and only for the shady profiles.
    if (tag === 'dev' && arch !== 'suspicious' && arch !== 'honeypot' && arch !== 'fading') tag = 'whale';

    const buyBias = Math.min(0.82, Math.max(0.18, 0.5 + momentum / 140));
    const action: 'buy' | 'sell' = tag === 'dev' ? 'sell' : r() < buyBias ? 'buy' : 'sell';

    events.push({
      id: `${token.address}-evt-${i}`,
      address: fakeAddress(token.rngSeed ^ (i * 2654435761)),
      label: r() > 0.55 ? (WALLET_LABELS[Math.floor(r() * WALLET_LABELS.length)] ?? null) : null,
      tag,
      action,
      amountUsd: Math.max(250, liq * (0.008 + r() * 0.11)),
      at: now - Math.floor(r() * 22 * HOUR),
      wallet30dPnlUsd: tag === 'smart' ? Math.round((r() - 0.15) * 480_000) : null,
    });
  }

  return events.sort((a, b) => b.at - a.at);
}

export function socialFor(token: MockToken, now: number): SocialSignal {
  const r = rngFrom(token.rngSeed ^ 0x50c1a1);
  const arch = token.seed.archetype;

  if (arch === 'sparse') {
    return {
      mentions24h: null,
      mentionsGrowthPct: null,
      uniqueAuthors24h: null,
      botLikelihoodPct: null,
      kolMentions24h: null,
      authenticity: 'unknown',
      links: { website: null, twitter: null, telegram: null },
    };
  }

  const hypeFactor = arch === 'hyped' ? 6 : arch === 'degen' ? 2.2 : arch === 'fading' ? 0.3 : 1;
  const wave = (valueNoise(token.rngSeed ^ 0x5a17, now / (5 * HOUR)) + 1) / 2;
  const mentions = Math.floor(30 + hypeFactor * (80 + r() * 2_400) * (0.4 + wave));
  const botPct =
    arch === 'suspicious' || arch === 'honeypot' ? 55 + r() * 35 : arch === 'hyped' ? 22 + r() * 30 : 5 + r() * 22;

  const authenticity =
    botPct >= 55 ? 'coordinated' : botPct >= 30 ? 'mixed' : ('organic' as SocialSignal['authenticity']);

  const slug = token.seed.symbol.toLowerCase();
  return {
    mentions24h: mentions,
    mentionsGrowthPct: (wave - 0.45) * 320 * hypeFactor,
    uniqueAuthors24h: Math.floor(mentions * (0.25 + r() * 0.45)),
    botLikelihoodPct: botPct,
    kolMentions24h: Math.floor(r() * hypeFactor * 5),
    authenticity,
    links: {
      website: arch === 'clean' ? `https://example.com/${slug}` : null,
      twitter: r() > 0.25 ? `https://x.com/${slug}_demo` : null,
      telegram: r() > 0.6 ? `https://t.me/${slug}_demo` : null,
    },
  };
}

export function holdersFor(token: MockToken, now: number): Holder[] {
  const r = rngFrom(token.rngSeed ^ 0x60d1e5);
  const security = securityFor(token, now);
  const top10 = security.top10HolderPct ?? 28;
  const mcap = priceAt(token, now) * token.supply;

  // Distribute the top-10 share with a decaying curve, then continue past it.
  const weights = Array.from({ length: 20 }, (_, i) => 1 / (i + 1) ** 0.85);
  const top10Weight = weights.slice(0, 10).reduce((a, b) => a + b, 0);
  const scale = top10 / top10Weight;

  return weights.map((w, i) => {
    const pct = w * scale;
    const isPool = i === 0;
    return {
      address: isPool ? token.pairAddress : fakeAddress(token.rngSeed ^ (i * 40503)),
      label: isPool ? 'Liquidity pool' : r() > 0.8 ? (WALLET_LABELS[i % WALLET_LABELS.length] ?? null) : null,
      pct: Math.min(100, pct),
      valueUsd: (mcap * pct) / 100,
      tag: isPool ? 'unknown' : i < 3 ? 'whale' : i < 6 ? 'smart' : 'unknown',
      isContract: isPool,
    } satisfies Holder;
  });
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

export function detailFor(token: MockToken, now = Date.now()): TokenDetail {
  const price = priceAt(token, now);
  const liquidity = liquidityAt(token, now);
  const events = walletEventsFor(token, now);
  const dayEvents = events.filter((e) => e.at >= now - DAY);
  const netFlow = dayEvents.reduce((sum, e) => sum + (e.action === 'buy' ? e.amountUsd : -e.amountUsd), 0);
  const isSparse = token.seed.archetype === 'sparse';

  return {
    ref: {
      address: token.address,
      symbol: token.seed.symbol,
      name: token.seed.name,
      logoUri: token.seed.hasLogo === false ? null : `https://mova.invalid/logo/${token.seed.symbol}.png`,
      chain: 'solana',
    },
    market: {
      priceUsd: price,
      marketCapUsd: price * token.supply,
      fdvUsd: price * token.supply * 1.02,
      liquidityUsd: liquidity,
      volume1hUsd: volumeAt(token, now, HOUR),
      volume24hUsd: volumeAt(token, now, DAY),
      change5m: changePct(token, now, 5 * 60_000),
      change1h: changePct(token, now, HOUR),
      change6h: changePct(token, now, 6 * HOUR),
      change24h: changePct(token, now, DAY),
      txns1h: txnsIn(token, now, HOUR),
      txns24h: txnsIn(token, now, DAY),
      holders: isSparse ? null : holdersAt(token, now),
      createdAt: token.createdAt,
      pairAddress: token.pairAddress,
      dexId: token.dexId,
    },
    security: securityFor(token, now),
    smartMoney: isSparse
      ? {
          netFlow24hUsd: null,
          whaleBuys24h: null,
          whaleSells24h: null,
          smartWalletHolders: null,
          events: [],
        }
      : {
          netFlow24hUsd: netFlow,
          whaleBuys24h: dayEvents.filter((e) => e.action === 'buy' && e.tag === 'whale').length,
          whaleSells24h: dayEvents.filter((e) => e.action === 'sell' && e.tag === 'whale').length,
          smartWalletHolders: dayEvents.filter((e) => e.tag === 'smart').length * 3,
          events,
        },
    social: socialFor(token, now),
  };
}

const TIMEFRAME_MS: Record<Timeframe, number> = {
  '5m': 5 * 60_000,
  '15m': 15 * 60_000,
  '1h': HOUR,
  '4h': 4 * HOUR,
  '1d': DAY,
};

export function candlesFor(token: MockToken, timeframe: Timeframe, count = 120, now = Date.now()): Candle[] {
  const step = TIMEFRAME_MS[timeframe];
  const out: Candle[] = [];

  for (let i = count - 1; i >= 0; i -= 1) {
    const start = now - i * step;
    const end = start + step;
    // Sample inside the bucket so wicks come from the same price function.
    const samples = [start, start + step * 0.25, start + step * 0.5, start + step * 0.75, end].map((t) =>
      priceAt(token, Math.min(t, now)),
    );
    const o = samples[0] ?? token.basePrice;
    const c = samples[samples.length - 1] ?? o;
    const h = Math.max(...samples);
    const l = Math.min(...samples);

    out.push({
      t: start,
      o,
      h: Math.max(h, o, c),
      l: Math.min(l, o, c),
      c,
      v: volumeAt(token, start, step),
    });
  }

  return out;
}

/** Compact close series for row sparklines. */
export function sparkFor(token: MockToken, now = Date.now(), points = 32): number[] {
  const step = (6 * HOUR) / points;
  return Array.from({ length: points }, (_, i) => priceAt(token, now - (points - 1 - i) * step));
}

export { HOUR, DAY, hashString };
