import {
  buildWatchlistRows,
  isWatchlistSort,
  watchlistStats,
  type WatchedToken,
} from '../watchlist';
import type { TokenSummary } from '../types';
import { cleanMarket, emptyMarket } from './fixtures';

function entry(overrides: Partial<WatchedToken> & { address: string }): WatchedToken {
  return {
    symbol: overrides.address.toUpperCase(),
    name: `${overrides.address} token`,
    logoUri: null,
    addedAt: 1_000,
    scoreAtAdd: null,
    note: '',
    ...overrides,
  };
}

function summary(
  address: string,
  overrides: { score?: number | null; market?: Partial<TokenSummary['market']> } = {},
): TokenSummary {
  return {
    ref: { address, symbol: address.toUpperCase(), name: address, logoUri: null, chain: 'solana' },
    market: { ...cleanMarket, ...overrides.market },
    score: overrides.score === undefined ? 70 : overrides.score,
    risk: 'moderate',
    spark: [1, 2, 3],
  };
}

describe('buildWatchlistRows', () => {
  it('joins each saved entry to its summary', () => {
    const rows = buildWatchlistRows(
      [entry({ address: 'a' }), entry({ address: 'b' })],
      [summary('b'), summary('a')],
      'symbol',
    );

    expect(rows.map((r) => r.entry.address)).toEqual(['a', 'b']);
    expect(rows[0]?.summary?.ref.address).toBe('a');
    expect(rows[1]?.summary?.ref.address).toBe('b');
  });

  it('keeps entries the provider did not return', () => {
    const rows = buildWatchlistRows([entry({ address: 'ghost' })], [], 'added');

    expect(rows).toHaveLength(1);
    expect(rows[0]?.summary).toBeNull();
    expect(rows[0]?.momentum).toBeNull();
    expect(rows[0]?.scoreDelta).toBeNull();
  });

  it('tolerates a completely absent summaries payload', () => {
    const rows = buildWatchlistRows([entry({ address: 'a' })], undefined, 'score');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.summary).toBeNull();
  });

  it('measures score drift since the token was added', () => {
    const rows = buildWatchlistRows(
      [entry({ address: 'a', scoreAtAdd: 60 })],
      [summary('a', { score: 82 })],
      'added',
    );
    expect(rows[0]?.scoreDelta).toBe(22);
  });

  it('reports no drift when either end of the comparison is missing', () => {
    const noBaseline = buildWatchlistRows([entry({ address: 'a' })], [summary('a', { score: 80 })], 'added');
    expect(noBaseline[0]?.scoreDelta).toBeNull();

    const noCurrent = buildWatchlistRows(
      [entry({ address: 'a', scoreAtAdd: 80 })],
      [summary('a', { score: null })],
      'added',
    );
    expect(noCurrent[0]?.scoreDelta).toBeNull();
  });

  it('derives momentum from market data alone', () => {
    const rows = buildWatchlistRows([entry({ address: 'a' })], [summary('a')], 'added');
    const momentum = rows[0]?.momentum;
    expect(momentum).not.toBeNull();
    expect(momentum).toBeGreaterThanOrEqual(0);
    expect(momentum).toBeLessThanOrEqual(100);
  });

  it('returns null momentum when the market is entirely empty', () => {
    const rows = buildWatchlistRows([entry({ address: 'a' })], [summary('a', { market: emptyMarket })], 'added');
    expect(rows[0]?.momentum).toBeNull();
  });

  it('sorts most recently added first', () => {
    const rows = buildWatchlistRows(
      [entry({ address: 'old', addedAt: 1 }), entry({ address: 'new', addedAt: 999 })],
      [],
      'added',
    );
    expect(rows.map((r) => r.entry.address)).toEqual(['new', 'old']);
  });

  it('sorts by score descending with unscored tokens last', () => {
    const rows = buildWatchlistRows(
      [entry({ address: 'a' }), entry({ address: 'b' }), entry({ address: 'c' })],
      [summary('a', { score: 40 }), summary('b', { score: null }), summary('c', { score: 91 })],
      'score',
    );
    expect(rows.map((r) => r.entry.address)).toEqual(['c', 'a', 'b']);
  });

  it('puts rows with no summary at the end of a numeric sort', () => {
    const rows = buildWatchlistRows(
      [entry({ address: 'missing' }), entry({ address: 'present' })],
      [summary('present', { score: 55 })],
      'score',
    );
    expect(rows.map((r) => r.entry.address)).toEqual(['present', 'missing']);
  });

  it('treats a non-finite metric as missing rather than as zero', () => {
    const rows = buildWatchlistRows(
      [entry({ address: 'nan' }), entry({ address: 'real' })],
      [
        summary('nan', { market: { marketCapUsd: Number.NaN } }),
        summary('real', { market: { marketCapUsd: 5_000 } }),
      ],
      'marketCap',
    );
    expect(rows.map((r) => r.entry.address)).toEqual(['real', 'nan']);
  });

  it('sorts symbols case-insensitively', () => {
    const rows = buildWatchlistRows(
      [entry({ address: 'x', symbol: 'zeta' }), entry({ address: 'y', symbol: 'Alpha' })],
      [],
      'symbol',
    );
    expect(rows.map((r) => r.entry.symbol)).toEqual(['Alpha', 'zeta']);
  });

  it('does not mutate the entries it was given', () => {
    const entries = [entry({ address: 'a', addedAt: 1 }), entry({ address: 'b', addedAt: 2 })];
    const snapshot = entries.map((e) => e.address);
    buildWatchlistRows(entries, [], 'added');
    expect(entries.map((e) => e.address)).toEqual(snapshot);
  });

  it('falls back to recency for an unrecognised sort key', () => {
    const rows = buildWatchlistRows(
      [entry({ address: 'old', addedAt: 1 }), entry({ address: 'new', addedAt: 2 })],
      [],
      'nonsense' as never,
    );
    expect(rows.map((r) => r.entry.address)).toEqual(['new', 'old']);
  });

  it('handles an empty watchlist', () => {
    expect(buildWatchlistRows([], [summary('a')], 'added')).toEqual([]);
  });
});

describe('watchlistStats', () => {
  it('averages only the tokens that carry a score', () => {
    const rows = buildWatchlistRows(
      [entry({ address: 'a' }), entry({ address: 'b' }), entry({ address: 'c' })],
      [summary('a', { score: 60 }), summary('b', { score: 80 }), summary('c', { score: null })],
      'added',
    );
    const stats = watchlistStats(rows);

    expect(stats.tracked).toBe(3);
    expect(stats.scored).toBe(2);
    expect(stats.avgScore).toBe(70);
  });

  it('counts gainers and losers, ignoring flat and unknown moves', () => {
    const rows = buildWatchlistRows(
      [entry({ address: 'up' }), entry({ address: 'down' }), entry({ address: 'flat' }), entry({ address: 'unknown' })],
      [
        summary('up', { market: { change24h: 12 } }),
        summary('down', { market: { change24h: -4 } }),
        summary('flat', { market: { change24h: 0 } }),
        summary('unknown', { market: { change24h: null } }),
      ],
      'added',
    );
    const stats = watchlistStats(rows);

    expect(stats.gainers).toBe(1);
    expect(stats.losers).toBe(1);
    expect(stats.best?.entry.address).toBe('up');
    expect(stats.worst?.entry.address).toBe('down');
  });

  it('reports nothing rather than zero when no row has data', () => {
    const rows = buildWatchlistRows([entry({ address: 'a' })], [], 'added');
    const stats = watchlistStats(rows);

    expect(stats.avgScore).toBeNull();
    expect(stats.scored).toBe(0);
    expect(stats.best).toBeNull();
    expect(stats.worst).toBeNull();
  });

  it('is empty-safe', () => {
    const stats = watchlistStats([]);
    expect(stats).toMatchObject({ tracked: 0, avgScore: null, gainers: 0, losers: 0, best: null, worst: null });
  });
});

describe('isWatchlistSort', () => {
  it('accepts the known keys and rejects anything else', () => {
    expect(isWatchlistSort('score')).toBe(true);
    expect(isWatchlistSort('added')).toBe(true);
    expect(isWatchlistSort('nope')).toBe(false);
    expect(isWatchlistSort(null)).toBe(false);
    expect(isWatchlistSort(3)).toBe(false);
  });
});
