import { useCallback, useMemo } from 'react';
import {
  keepPreviousData,
  useInfiniteQuery,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { Timeframe, TokenDetail, TokenSummary } from '@/core/types';
import { computeMovaScore, type MovaScore } from '@/core/scoring';
import { getProviders } from './providers';
import type { DiscoverQuery } from './providers/types';

/**
 * Query layer.
 *
 * Cache policy is set per data class rather than globally, because the cost of
 * stale data differs: a price is wrong within seconds, a mint authority is not.
 * Longer stale times on slow-moving data are what keep MOVA from hammering the
 * upstream providers.
 */

const STALE = {
  /** Prices and volume — refreshed while a screen is open. */
  live: 15_000,
  /** Lists — expensive, and a few seconds of staleness is invisible. */
  list: 30_000,
  /** Candles — one bucket of the smallest timeframe. */
  candles: 60_000,
  /** Contract-level facts that rarely change. */
  structural: 5 * 60_000,
  /** Generated analysis — expensive and not worth regenerating on every visit. */
  analysis: 3 * 60_000,
} as const;

export const queryKeys = {
  overview: ['market', 'overview'] as const,
  trending: ['market', 'trending'] as const,
  movers: ['market', 'movers'] as const,
  unusual: ['market', 'unusual'] as const,
  discover: (query: DiscoverQuery) => ['discover', query] as const,
  token: (address: string) => ['token', address] as const,
  candles: (address: string, tf: Timeframe) => ['token', address, 'candles', tf] as const,
  holders: (address: string) => ['token', address, 'holders'] as const,
  analysis: (address: string) => ['token', address, 'analysis'] as const,
  summaries: (addresses: string[]) => ['summaries', [...addresses].sort()] as const,
  search: (term: string) => ['search', term] as const,
};

// ---------------------------------------------------------------------------
// Market
// ---------------------------------------------------------------------------

export function useMarketOverview(refetchIntervalMs?: number) {
  return useQuery({
    queryKey: queryKeys.overview,
    queryFn: ({ signal }) => getProviders().market.getOverview(signal),
    staleTime: STALE.live,
    refetchInterval: refetchIntervalMs && refetchIntervalMs > 0 ? refetchIntervalMs : false,
  });
}

export function useTrending(refetchIntervalMs?: number) {
  return useQuery({
    queryKey: queryKeys.trending,
    queryFn: ({ signal }) => getProviders().market.getTrending(signal),
    staleTime: STALE.list,
    refetchInterval: refetchIntervalMs && refetchIntervalMs > 0 ? refetchIntervalMs : false,
  });
}

export function useTopMovers() {
  return useQuery({
    queryKey: queryKeys.movers,
    queryFn: ({ signal }) => getProviders().market.getTopMovers(signal),
    staleTime: STALE.list,
  });
}

export function useUnusualVolume() {
  return useQuery({
    queryKey: queryKeys.unusual,
    queryFn: ({ signal }) => getProviders().market.getUnusualVolume(signal),
    staleTime: STALE.list,
  });
}

// ---------------------------------------------------------------------------
// Discover
// ---------------------------------------------------------------------------

/**
 * Paged discovery. `keepPreviousData` means changing a filter re-renders the
 * previous results dimmed rather than flashing an empty list, which makes rapid
 * filter adjustment feel continuous.
 */
export function useDiscover(query: DiscoverQuery) {
  return useInfiniteQuery({
    queryKey: queryKeys.discover(query),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      getProviders().token.discover({ ...query, cursor: pageParam }, signal),
    getNextPageParam: (lastPage) => lastPage.data.nextCursor,
    staleTime: STALE.list,
    placeholderData: keepPreviousData,
  });
}

export function useTokenSearch(term: string) {
  const trimmed = term.trim();
  return useQuery({
    queryKey: queryKeys.search(trimmed),
    queryFn: ({ signal }) => getProviders().token.search(trimmed, signal),
    enabled: trimmed.length >= 2,
    staleTime: STALE.list,
    placeholderData: keepPreviousData,
  });
}

// ---------------------------------------------------------------------------
// Token detail
// ---------------------------------------------------------------------------

export function useToken(address: string | undefined, refetchIntervalMs?: number) {
  return useQuery({
    queryKey: queryKeys.token(address ?? ''),
    queryFn: ({ signal }) => getProviders().token.getToken(address!, signal),
    enabled: typeof address === 'string' && address.length > 0,
    staleTime: STALE.live,
    refetchInterval: refetchIntervalMs && refetchIntervalMs > 0 ? refetchIntervalMs : false,
    retry: 1,
  });
}

/**
 * The MOVA score for a token.
 *
 * Scoring is pure and cheap, so it is memoised off the token query rather than
 * fetched. That guarantees the score on screen always matches the data on
 * screen — they cannot arrive from different refreshes.
 */
export function useMovaScore(detail: TokenDetail | undefined): MovaScore | null {
  return useMemo(() => (detail ? computeMovaScore(detail) : null), [detail]);
}

export function useCandles(address: string | undefined, timeframe: Timeframe) {
  return useQuery({
    queryKey: queryKeys.candles(address ?? '', timeframe),
    queryFn: ({ signal }) => getProviders().token.getCandles(address!, timeframe, signal),
    enabled: typeof address === 'string' && address.length > 0,
    staleTime: STALE.candles,
    placeholderData: keepPreviousData,
  });
}

export function useTopHolders(address: string | undefined) {
  return useQuery({
    queryKey: queryKeys.holders(address ?? ''),
    queryFn: ({ signal }) => getProviders().holders.getTopHolders(address!, signal),
    enabled: typeof address === 'string' && address.length > 0,
    staleTime: STALE.structural,
  });
}

export function useAnalysis(detail: TokenDetail | undefined, score: MovaScore | null) {
  return useQuery({
    queryKey: queryKeys.analysis(detail?.ref.address ?? ''),
    queryFn: ({ signal }) => getProviders().analysis.analyze(detail!, score!, signal),
    enabled: detail != null && score != null,
    staleTime: STALE.analysis,
  });
}

// ---------------------------------------------------------------------------
// Batches
// ---------------------------------------------------------------------------

/** Summaries for the watchlist. One request, not one per row. */
export function useSummaries(addresses: string[], refetchIntervalMs?: number) {
  const key = useMemo(() => [...addresses].sort(), [addresses]);
  return useQuery({
    queryKey: queryKeys.summaries(key),
    queryFn: ({ signal }) => getProviders().token.getSummaries(key, signal),
    enabled: key.length > 0,
    staleTime: STALE.live,
    refetchInterval: refetchIntervalMs && refetchIntervalMs > 0 ? refetchIntervalMs : false,
  });
}

/** Full detail for several tokens at once, used by Compare. */
export function useTokenDetails(addresses: string[]) {
  return useQueries({
    queries: addresses.map((address) => ({
      queryKey: queryKeys.token(address),
      queryFn: ({ signal }: { signal: AbortSignal }) => getProviders().token.getToken(address, signal),
      staleTime: STALE.live,
    })),
    combine: (results) => ({
      isLoading: results.some((r) => r.isLoading),
      isError: results.some((r) => r.isError),
      items: results
        .map((r) => r.data?.data)
        .filter((d): d is TokenDetail => d != null)
        .map((detail) => ({ detail, score: computeMovaScore(detail) })),
      origin: results.find((r) => r.data)?.data?.meta.origin ?? null,
    }),
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Flatten an infinite discover result into a single list. */
export function flattenPages(pages: { data: { items: TokenSummary[] } }[] | undefined): TokenSummary[] {
  if (!pages) return [];
  return pages.flatMap((page) => page.data.items);
}

/**
 * Invalidate everything. Wired to pull-to-refresh, and to the data-source
 * switch in Profile — changing provider must not leave the old bundle's data
 * on screen.
 */
export function useRefreshAll() {
  const client = useQueryClient();
  return useCallback(async () => {
    await client.invalidateQueries();
  }, [client]);
}

export function useClearCache() {
  const client = useQueryClient();
  return useCallback(() => {
    client.clear();
  }, [client]);
}
