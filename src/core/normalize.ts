import type {
  Candle,
  SocialAuthenticity,
  TokenDetail,
  TokenMarket,
  TokenRef,
  TokenSecurity,
  TxnCounts,
  WalletEvent,
  WalletTag,
} from './types';

/**
 * Everything in this module treats its input as hostile.
 *
 * Token metadata on Solana is written by whoever deployed the token: names and
 * symbols can contain control characters, bidi overrides that visually reverse
 * surrounding text, zero-width padding, or be megabytes long. Numeric fields
 * arrive as strings, as `"NaN"`, as `null`, or absent. Nothing here throws, and
 * nothing here trusts a type annotation it did not produce itself.
 */

const MAX_SYMBOL = 16;
const MAX_NAME = 48;

/** Control chars, bidi overrides, zero-width joiners and BOM. */
const UNSAFE_CHARS = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

/** Absurd magnitudes indicate a broken upstream, not a real market. */
const MAX_USD = 1e15;

export function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const trimmed = v.trim();
    if (trimmed === '') return null;
    // Reject strings Number() coerces surprisingly: '', '  ', '0x10', 'Infinity'.
    if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(trimmed)) return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** A USD-denominated figure: finite, non-negative, and not absurd. */
export function toUsd(v: unknown): number | null {
  const n = toNumber(v);
  if (n == null || n < 0 || n > MAX_USD) return null;
  return n;
}

/** A percentage that must sit in [0, 100], e.g. a share of supply. */
export function toPct(v: unknown): number | null {
  const n = toNumber(v);
  if (n == null) return null;
  if (n < 0 || n > 100) return null;
  return n;
}

/** A signed percentage change. Clamped to a sane band; -100% is a total loss. */
export function toChangePct(v: unknown): number | null {
  const n = toNumber(v);
  if (n == null) return null;
  if (n < -100) return -100;
  if (n > 1_000_000) return null;
  return n;
}

export function toCount(v: unknown): number | null {
  const n = toNumber(v);
  if (n == null || n < 0 || n > 1e12) return null;
  return Math.floor(n);
}

export function toBool(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v;
  if (v === 'true' || v === 1 || v === '1') return true;
  if (v === 'false' || v === 0 || v === '0') return false;
  return null;
}

/** Unix ms timestamp. Accepts seconds and upgrades them. */
export function toTimestamp(v: unknown): number | null {
  const n = toNumber(v);
  if (n == null || n <= 0) return null;
  // Anything below this is far more likely to be seconds than milliseconds.
  const ms = n < 1e11 ? n * 1000 : n;
  // Reject dates before 2015 or more than a day in the future.
  if (ms < 1_420_070_400_000 || ms > Date.now() + 86_400_000) return null;
  return ms;
}

/**
 * Sanitise attacker-controlled display text: strip anything that could corrupt
 * layout or spoof surrounding content, collapse whitespace, and cap length.
 */
export function toDisplayText(v: unknown, maxLength: number): string | null {
  if (typeof v !== 'string') return null;
  const cleaned = v.replace(UNSAFE_CHARS, '').replace(/\s+/g, ' ').trim();
  if (cleaned.length === 0) return null;
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 1)}…` : cleaned;
}

/**
 * Only http(s) URLs survive. `javascript:`, `data:`, `file:` and anything
 * unparseable are dropped, so a URL from token metadata can never be handed to
 * a browser or an <Image> as-is.
 */
export function toSafeUrl(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  if (trimmed.length === 0 || trimmed.length > 2048) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

const BASE58_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * Whether a value is a plausible Solana mint address.
 *
 * Addresses reach MOVA from third-party APIs, deep links and pasted text, so
 * this gate runs before any of them is used to build a URL or a price request.
 * It checks shape only — a well-formed address need not exist.
 */
export function isSolanaAddress(v: unknown): v is string {
  return typeof v === 'string' && BASE58_ADDRESS.test(v);
}

/** Base58 mint address. Rejects anything that is not plausibly an address. */
export function toSolanaAddress(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  return isSolanaAddress(trimmed) ? trimmed : null;
}

function toTxnCounts(v: unknown): TxnCounts {
  const o = isRecord(v) ? v : {};
  return { buys: toCount(o.buys), sells: toCount(o.sells) };
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// ---------------------------------------------------------------------------
// Entity normalisers
// ---------------------------------------------------------------------------

/** Returns null when the payload has no usable identity (no valid address). */
export function normalizeTokenRef(raw: unknown): TokenRef | null {
  if (!isRecord(raw)) return null;
  const address = toSolanaAddress(raw.address ?? raw.mint ?? raw.tokenAddress);
  if (address == null) return null;

  const symbol = toDisplayText(raw.symbol ?? raw.ticker, MAX_SYMBOL);
  const name = toDisplayText(raw.name, MAX_NAME);

  return {
    address,
    // A token without a readable symbol still needs a stable handle in lists.
    symbol: symbol ?? `${address.slice(0, 4)}…`,
    name: name ?? symbol ?? 'Unknown token',
    logoUri: toSafeUrl(raw.logoUri ?? raw.logoURI ?? raw.image ?? raw.icon),
    chain: 'solana',
  };
}

export function normalizeMarket(raw: unknown): TokenMarket {
  const o = isRecord(raw) ? raw : {};
  return {
    priceUsd: toUsd(o.priceUsd ?? o.price),
    marketCapUsd: toUsd(o.marketCapUsd ?? o.marketCap ?? o.mcap),
    fdvUsd: toUsd(o.fdvUsd ?? o.fdv),
    liquidityUsd: toUsd(o.liquidityUsd ?? o.liquidity),
    volume1hUsd: toUsd(o.volume1hUsd ?? o.volume1h),
    volume24hUsd: toUsd(o.volume24hUsd ?? o.volume24h),
    change5m: toChangePct(o.change5m),
    change1h: toChangePct(o.change1h),
    change6h: toChangePct(o.change6h),
    change24h: toChangePct(o.change24h),
    txns1h: toTxnCounts(o.txns1h),
    txns24h: toTxnCounts(o.txns24h),
    holders: toCount(o.holders),
    createdAt: toTimestamp(o.createdAt ?? o.pairCreatedAt),
    pairAddress: typeof o.pairAddress === 'string' ? toDisplayText(o.pairAddress, 64) : null,
    dexId: toDisplayText(o.dexId, 24),
  };
}

export function normalizeSecurity(raw: unknown): TokenSecurity {
  const o = isRecord(raw) ? raw : {};
  return {
    mintAuthorityRevoked: toBool(o.mintAuthorityRevoked),
    freezeAuthorityRevoked: toBool(o.freezeAuthorityRevoked),
    lpBurnedPct: toPct(o.lpBurnedPct),
    lpLocked: toBool(o.lpLocked),
    top10HolderPct: toPct(o.top10HolderPct),
    devHoldingPct: toPct(o.devHoldingPct),
    devSoldPct: toPct(o.devSoldPct),
    insiderPct: toPct(o.insiderPct),
    bundledPct: toPct(o.bundledPct),
    sniperPct: toPct(o.sniperPct),
    sellsSucceeding: toBool(o.sellsSucceeding),
    liquidityChange24hPct: toChangePct(o.liquidityChange24hPct),
  };
}

const WALLET_TAGS: WalletTag[] = ['whale', 'smart', 'dev', 'insider', 'sniper', 'unknown'];

export function normalizeWalletEvent(raw: unknown, index: number): WalletEvent | null {
  if (!isRecord(raw)) return null;
  const address = toSolanaAddress(raw.address);
  const amountUsd = toUsd(raw.amountUsd);
  const at = toTimestamp(raw.at);
  if (address == null || amountUsd == null || at == null) return null;

  const action = raw.action === 'sell' ? 'sell' : raw.action === 'buy' ? 'buy' : null;
  if (action == null) return null;

  const tag = WALLET_TAGS.includes(raw.tag as WalletTag) ? (raw.tag as WalletTag) : 'unknown';

  return {
    id: toDisplayText(raw.id, 64) ?? `${address}-${at}-${index}`,
    address,
    label: toDisplayText(raw.label, 32),
    tag,
    action,
    amountUsd,
    at,
    wallet30dPnlUsd: toNumber(raw.wallet30dPnlUsd),
  };
}

const AUTHENTICITY: SocialAuthenticity[] = ['organic', 'mixed', 'coordinated', 'unknown'];

/**
 * Assemble a full token payload. Returns null only when the token has no valid
 * identity — every other missing field degrades to null and is rendered as
 * "Data unavailable" rather than fabricated.
 */
export function normalizeTokenDetail(raw: unknown): TokenDetail | null {
  if (!isRecord(raw)) return null;
  const ref = normalizeTokenRef(raw.ref ?? raw);
  if (ref == null) return null;

  const smRaw = isRecord(raw.smartMoney) ? raw.smartMoney : {};
  const events = Array.isArray(smRaw.events)
    ? smRaw.events
        .slice(0, 100)
        .map((e, i) => normalizeWalletEvent(e, i))
        .filter((e): e is WalletEvent => e !== null)
    : [];

  const socialRaw = isRecord(raw.social) ? raw.social : {};
  const linksRaw = isRecord(socialRaw.links) ? socialRaw.links : {};

  return {
    ref,
    market: normalizeMarket(raw.market),
    security: normalizeSecurity(raw.security),
    smartMoney: {
      netFlow24hUsd: toNumber(smRaw.netFlow24hUsd),
      whaleBuys24h: toCount(smRaw.whaleBuys24h),
      whaleSells24h: toCount(smRaw.whaleSells24h),
      smartWalletHolders: toCount(smRaw.smartWalletHolders),
      events,
    },
    social: {
      mentions24h: toCount(socialRaw.mentions24h),
      mentionsGrowthPct: toChangePct(socialRaw.mentionsGrowthPct),
      uniqueAuthors24h: toCount(socialRaw.uniqueAuthors24h),
      botLikelihoodPct: toPct(socialRaw.botLikelihoodPct),
      kolMentions24h: toCount(socialRaw.kolMentions24h),
      authenticity: AUTHENTICITY.includes(socialRaw.authenticity as SocialAuthenticity)
        ? (socialRaw.authenticity as SocialAuthenticity)
        : 'unknown',
      links: {
        website: toSafeUrl(linksRaw.website),
        twitter: toSafeUrl(linksRaw.twitter),
        telegram: toSafeUrl(linksRaw.telegram),
      },
    },
  };
}

/**
 * Candles must be chronologically ordered and internally consistent before a
 * chart can render them. Malformed entries are dropped, not repaired.
 */
export function normalizeCandles(raw: unknown): Candle[] {
  if (!Array.isArray(raw)) return [];
  const out: Candle[] = [];
  for (const item of raw.slice(0, 5000)) {
    if (!isRecord(item)) continue;
    const t = toTimestamp(item.t ?? item.time ?? item.timestamp);
    const o = toNumber(item.o ?? item.open);
    const h = toNumber(item.h ?? item.high);
    const l = toNumber(item.l ?? item.low);
    const c = toNumber(item.c ?? item.close);
    const v = toNumber(item.v ?? item.volume) ?? 0;
    if (t == null || o == null || h == null || l == null || c == null) continue;
    if (o <= 0 || h <= 0 || l <= 0 || c <= 0) continue;
    // A high below the low, or a close outside the range, means bad data.
    if (h < l || c > h || c < l || o > h || o < l) continue;
    out.push({ t, o, h, l, c, v: Math.max(0, v) });
  }
  out.sort((a, b) => a.t - b.t);
  // Drop duplicate timestamps, keeping the last value seen.
  return out.filter((candle, i) => i === out.length - 1 || candle.t !== out[i + 1]?.t);
}
