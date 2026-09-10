import type { TokenSummary } from './types';
import { momentumFromMarket } from './scoring';
import { isNum, round } from './math';

/**
 * Watchlist row assembly.
 *
 * The screen holds two half-records: what the user saved (persisted locally,
 * possibly months ago) and what the provider returned for it just now. Joining
 * them, deriving score drift and sorting the result is pure work, so it lives
 * here where it can be tested against missing and malformed data rather than in
 * the component.
 */

export const WATCHLIST_SORTS = ['added', 'score', 'change24h', 'marketCap', 'symbol'] as const;

export type WatchlistSortKey = (typeof WATCHLIST_SORTS)[number];

export const WATCHLIST_SORT_LABELS: Record<WatchlistSortKey, string> = {
  added: 'Recent',
  score: 'MOVA score',
  change24h: '24h change',
  marketCap: 'Market cap',
  symbol: 'A–Z',
};

export function isWatchlistSort(value: unknown): value is WatchlistSortKey {
  return typeof value === 'string' && (WATCHLIST_SORTS as readonly string[]).includes(value);
}

/** The saved half of a row — the shape the watchlist store persists. */
export interface WatchedToken {
  address: string;
  symbol: string;
  name: string;
  logoUri: string | null;
  addedAt: number;
  /** MOVA score at the moment of saving, so drift is measurable later. */
  scoreAtAdd: number | null;
  note: string;
}

export interface WatchlistRow {
  entry: WatchedToken;
  /** Null while the batch fetch is in flight, or if the provider dropped it. */
  summary: TokenSummary | null;
  /** Points gained or lost since the token was added. */
  scoreDelta: number | null;
  momentum: number | null;
}

export interface WatchlistStats {
  tracked: number;
  /** Mean MOVA score across rows that have one; null when none do. */
  avgScore: number | null;
  /** How many rows contributed to `avgScore`. */
  scored: number;
  gainers: number;
  losers: number;
  best: WatchlistRow | null;
  worst: WatchlistRow | null;
}

function num(value: number | null | undefined): number | null {
  return isNum(value) ? value : null;
}

/** Descending, with missing values always sorted last rather than as zero. */
function byValueDesc(a: number | null, b: number | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return b - a;
}

const COMPARATORS: Record<WatchlistSortKey, (a: WatchlistRow, b: WatchlistRow) => number> = {
  added: (a, b) => b.entry.addedAt - a.entry.addedAt,
  score: (a, b) => byValueDesc(num(a.summary?.score), num(b.summary?.score)),
  change24h: (a, b) => byValueDesc(num(a.summary?.market.change24h), num(b.summary?.market.change24h)),
  marketCap: (a, b) => byValueDesc(num(a.summary?.market.marketCapUsd), num(b.summary?.market.marketCapUsd)),
  symbol: (a, b) => a.entry.symbol.localeCompare(b.entry.symbol, 'en', { sensitivity: 'base' }),
};

/**
 * Join saved entries to freshly fetched summaries and sort them.
 *
 * An entry with no matching summary still produces a row: the token is on the
 * user's list whether or not the provider could resolve it this minute, and
 * silently dropping it would look like MOVA lost their data.
 */
export function buildWatchlistRows(
  entries: WatchedToken[],
  summaries: TokenSummary[] | undefined,
  sort: WatchlistSortKey,
): WatchlistRow[] {
  const byAddress = new Map<string, TokenSummary>();
  for (const summary of summaries ?? []) {
    byAddress.set(summary.ref.address, summary);
  }

  const rows = entries.map<WatchlistRow>((entry) => {
    const summary = byAddress.get(entry.address) ?? null;
    const liveScore = num(summary?.score);
    const addedScore = num(entry.scoreAtAdd);
    return {
      entry,
      summary,
      scoreDelta: liveScore != null && addedScore != null ? round(liveScore - addedScore) : null,
      momentum: summary == null ? null : momentumFromMarket(summary.market),
    };
  });

  return rows.sort(COMPARATORS[sort] ?? COMPARATORS.added);
}

/** Aggregates for the summary strip above the list. */
export function watchlistStats(rows: WatchlistRow[]): WatchlistStats {
  let scoreSum = 0;
  let scored = 0;
  let gainers = 0;
  let losers = 0;
  let best: WatchlistRow | null = null;
  let worst: WatchlistRow | null = null;

  for (const row of rows) {
    const score = num(row.summary?.score);
    if (score != null) {
      scoreSum += score;
      scored += 1;
    }

    const change = num(row.summary?.market.change24h);
    if (change == null) continue;
    if (change > 0) gainers += 1;
    else if (change < 0) losers += 1;

    if (best == null || change > (num(best.summary?.market.change24h) ?? -Infinity)) best = row;
    if (worst == null || change < (num(worst.summary?.market.change24h) ?? Infinity)) worst = row;
  }

  return {
    tracked: rows.length,
    avgScore: scored > 0 ? round(scoreSum / scored) : null,
    scored,
    gainers,
    losers,
    best,
    worst,
  };
}
