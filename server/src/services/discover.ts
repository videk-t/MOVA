import type { RiskLevel, TokenSummary } from '@/core/types';
import { isNum, ratio } from '@/core/math';
import { momentumFromMarket, tokenAgeHours } from '@/core/scoring';

/**
 * Discover filtering.
 *
 * Runs over the tracked universe rather than the whole chain — MOVA ranks what
 * it watches, and says so. Kept pure and separate from the route so the filter
 * semantics can be tested without a server, because a filter that silently
 * excludes everything looks identical to an empty market.
 */

export interface Range {
  min: number | null;
  max: number | null;
}

export interface DiscoverFilters {
  marketCap: Range;
  liquidity: Range;
  age: Range;
  volume24h: Range;
  vlr: Range;
  holders: Range;
  txns24h: Range;
  buyRatio: Range;
  momentum: Range;
  score: Range;
  risk: RiskLevel[];
  requireMintRevoked: boolean;
  requireFreezeRevoked: boolean;
  excludeHoneypots: boolean;
  query: string;
}

export type SortKey =
  | 'score'
  | 'marketCap'
  | 'volume24h'
  | 'liquidity'
  | 'change1h'
  | 'change24h'
  | 'age'
  | 'holders';

const RISKS: RiskLevel[] = ['low', 'moderate', 'elevated', 'high'];

function num(raw: string | undefined): number | null {
  if (raw == null) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function range(params: URLSearchParams, key: string): Range {
  return { min: num(params.get(key + 'Min') ?? undefined), max: num(params.get(key + 'Max') ?? undefined) };
}

export function parseFilters(params: URLSearchParams): DiscoverFilters {
  const risk = (params.get('risk') ?? '')
    .split(',')
    .map((r) => r.trim())
    .filter((r): r is RiskLevel => RISKS.includes(r as RiskLevel));

  return {
    marketCap: range(params, 'marketCap'),
    liquidity: range(params, 'liquidity'),
    age: range(params, 'age'),
    volume24h: range(params, 'volume24h'),
    vlr: range(params, 'vlr'),
    holders: range(params, 'holders'),
    txns24h: range(params, 'txns24h'),
    buyRatio: range(params, 'buyRatio'),
    momentum: range(params, 'momentum'),
    score: range(params, 'score'),
    risk,
    requireMintRevoked: params.get('mintRevoked') === '1',
    requireFreezeRevoked: params.get('freezeRevoked') === '1',
    excludeHoneypots: params.get('excludeHoneypots') === '1',
    query: (params.get('q') ?? '').trim().slice(0, 64),
  };
}

export function parseSort(params: URLSearchParams): { sort: SortKey; direction: 'asc' | 'desc' } {
  const raw = params.get('sort') ?? 'volume24h';
  const keys: SortKey[] = [
    'score',
    'marketCap',
    'volume24h',
    'liquidity',
    'change1h',
    'change24h',
    'age',
    'holders',
  ];
  return {
    sort: keys.includes(raw as SortKey) ? (raw as SortKey) : 'volume24h',
    direction: params.get('direction') === 'asc' ? 'asc' : 'desc',
  };
}

/**
 * A range test that passes when the value is unknown.
 *
 * This is the important decision in the file. Excluding tokens whose holder
 * count MOVA cannot read would silently empty the list the moment a user
 * touched a filter the keyless deployment cannot answer — the filter would
 * appear broken rather than uninformed. Unknown values pass; known values are
 * judged.
 */
function inRange(value: number | null | undefined, r: Range): boolean {
  if (!isNum(value)) return true;
  if (r.min != null && value < r.min) return false;
  if (r.max != null && value > r.max) return false;
  return true;
}

export function applyFilters(items: TokenSummary[], filters: DiscoverFilters, now = Date.now()): TokenSummary[] {
  const query = filters.query.toLowerCase();

  return items.filter((item) => {
    const m = item.market;

    if (query.length > 0) {
      const haystack = `${item.ref.symbol} ${item.ref.name} ${item.ref.address}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }

    if (!inRange(m.marketCapUsd, filters.marketCap)) return false;
    if (!inRange(m.liquidityUsd, filters.liquidity)) return false;
    if (!inRange(m.volume24hUsd, filters.volume24h)) return false;
    if (!inRange(m.holders, filters.holders)) return false;
    if (!inRange(item.score, filters.score)) return false;
    if (!inRange(tokenAgeHours(m, now), filters.age)) return false;
    if (!inRange(ratio(m.volume24hUsd, m.liquidityUsd), filters.vlr)) return false;
    if (!inRange(momentumFromMarket(m), filters.momentum)) return false;

    const txns = (m.txns24h.buys ?? 0) + (m.txns24h.sells ?? 0);
    if (!inRange(m.txns24h.buys == null && m.txns24h.sells == null ? null : txns, filters.txns24h)) {
      return false;
    }

    const hourly = (m.txns1h.buys ?? 0) + (m.txns1h.sells ?? 0);
    const buyRatio = hourly > 0 ? (m.txns1h.buys ?? 0) / hourly : null;
    if (!inRange(buyRatio, filters.buyRatio)) return false;

    if (filters.risk.length > 0 && !filters.risk.includes(item.risk)) return false;

    return true;
  });
}

export function applySort(
  items: TokenSummary[],
  sort: SortKey,
  direction: 'asc' | 'desc',
  now = Date.now(),
): TokenSummary[] {
  const value = (item: TokenSummary): number | null => {
    switch (sort) {
      case 'score':
        return item.score;
      case 'marketCap':
        return item.market.marketCapUsd;
      case 'liquidity':
        return item.market.liquidityUsd;
      case 'change1h':
        return item.market.change1h;
      case 'change24h':
        return item.market.change24h;
      case 'holders':
        return item.market.holders;
      case 'age':
        return tokenAgeHours(item.market, now);
      default:
        return item.market.volume24hUsd;
    }
  };

  const sign = direction === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => {
    const av = value(a);
    const bv = value(b);
    // Unknown values sort last in either direction — never first by accident.
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return (av - bv) * sign;
  });
}

/** Opaque offset cursor. The set is small enough that offsets are stable enough. */
export function paginate<T>(items: T[], cursor: string | null, limit: number): { items: T[]; nextCursor: string | null } {
  const start = Math.max(0, Number.parseInt(cursor ?? '0', 10) || 0);
  const size = Math.min(100, Math.max(1, limit));
  const slice = items.slice(start, start + size);
  const next = start + size;
  return { items: slice, nextCursor: next < items.length ? String(next) : null };
}
