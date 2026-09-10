import { beforeEach, describe, expect, it } from 'vitest';
import type { TokenSummary } from '@/core/types';
import { applyFilters, applySort, paginate, parseFilters, parseSort } from '../services/discover.js';

const HOUR = 3_600_000;
const NOW = 1_760_000_000_000;

function summary(overrides: {
  symbol?: string;
  score?: number | null;
  marketCap?: number | null;
  liquidity?: number | null;
  volume24h?: number | null;
  change24h?: number | null;
  holders?: number | null;
  ageHours?: number | null;
  risk?: TokenSummary['risk'];
} = {}): TokenSummary {
  const symbol = overrides.symbol ?? 'TEST';
  return {
    ref: {
      address: `Token${symbol}`.padEnd(44, 'A'),
      symbol,
      name: `${symbol} coin`,
      logoUri: null,
      chain: 'solana',
    },
    market: {
      priceUsd: 0.001,
      marketCapUsd: overrides.marketCap === undefined ? 1_000_000 : overrides.marketCap,
      fdvUsd: null,
      liquidityUsd: overrides.liquidity === undefined ? 100_000 : overrides.liquidity,
      volume1hUsd: 10_000,
      volume24hUsd: overrides.volume24h === undefined ? 500_000 : overrides.volume24h,
      change5m: 0,
      change1h: 2,
      change6h: 5,
      change24h: overrides.change24h === undefined ? 10 : overrides.change24h,
      txns1h: { buys: 60, sells: 40 },
      txns24h: { buys: 600, sells: 400 },
      holders: overrides.holders === undefined ? 5_000 : overrides.holders,
      createdAt: overrides.ageHours === undefined ? NOW - 100 * HOUR : overrides.ageHours == null ? null : NOW - overrides.ageHours * HOUR,
      pairAddress: null,
      dexId: 'raydium',
    },
    score: overrides.score === undefined ? 70 : overrides.score,
    risk: overrides.risk ?? 'moderate',
    spark: [],
  };
}

describe('parseFilters', () => {
  it('reads ranges, flags and risk levels from the query string', () => {
    const params = new URLSearchParams(
      'marketCapMin=100000&marketCapMax=5000000&risk=low,high&mintRevoked=1&q=BONK',
    );
    const filters = parseFilters(params);

    expect(filters.marketCap).toEqual({ min: 100_000, max: 5_000_000 });
    expect(filters.risk).toEqual(['low', 'high']);
    expect(filters.requireMintRevoked).toBe(true);
    expect(filters.query).toBe('BONK');
  });

  it('ignores unparseable numbers and unknown risk levels', () => {
    const filters = parseFilters(new URLSearchParams('marketCapMin=abc&risk=purple,low'));
    expect(filters.marketCap.min).toBeNull();
    expect(filters.risk).toEqual(['low']);
  });

  it('defaults to an unfiltered query', () => {
    const filters = parseFilters(new URLSearchParams(''));
    expect(filters.marketCap).toEqual({ min: null, max: null });
    expect(filters.risk).toEqual([]);
    expect(filters.query).toBe('');
  });
});

describe('parseSort', () => {
  it('accepts known keys and rejects anything else', () => {
    expect(parseSort(new URLSearchParams('sort=score&direction=asc'))).toEqual({
      sort: 'score',
      direction: 'asc',
    });
    expect(parseSort(new URLSearchParams('sort=nonsense')).sort).toBe('volume24h');
  });
});

describe('applyFilters', () => {
  let items: TokenSummary[];

  beforeEach(() => {
    items = [
      summary({ symbol: 'BIG', marketCap: 10_000_000, score: 85, risk: 'low' }),
      summary({ symbol: 'MID', marketCap: 1_000_000, score: 60, risk: 'moderate' }),
      summary({ symbol: 'SMALL', marketCap: 50_000, score: 30, risk: 'high' }),
    ];
  });

  it('filters by a range on both ends', () => {
    const filters = parseFilters(new URLSearchParams('marketCapMin=100000&marketCapMax=5000000'));
    expect(applyFilters(items, filters, NOW).map((i) => i.ref.symbol)).toEqual(['MID']);
  });

  it('filters by risk level', () => {
    const filters = parseFilters(new URLSearchParams('risk=low,moderate'));
    expect(applyFilters(items, filters, NOW).map((i) => i.ref.symbol)).toEqual(['BIG', 'MID']);
  });

  it('matches a query against symbol, name and address', () => {
    const filters = parseFilters(new URLSearchParams('q=small'));
    expect(applyFilters(items, filters, NOW).map((i) => i.ref.symbol)).toEqual(['SMALL']);
  });

  /**
   * The central decision in the filter layer. A keyless deployment cannot read
   * holder counts, so judging that unknown against a minimum would empty the
   * list the instant a user touched the filter — which reads as a broken app
   * rather than an uninformed one.
   */
  it('keeps tokens whose value for a filtered field is unknown', () => {
    const unknown = summary({ symbol: 'UNKNOWN', holders: null });
    const filters = parseFilters(new URLSearchParams('holdersMin=1000'));

    expect(applyFilters([unknown], filters, NOW)).toHaveLength(1);
  });

  it('still excludes a known value that fails the same filter', () => {
    const known = summary({ symbol: 'FEW', holders: 10 });
    const filters = parseFilters(new URLSearchParams('holdersMin=1000'));

    expect(applyFilters([known], filters, NOW)).toHaveLength(0);
  });

  it('filters on derived values like age and volume-to-liquidity', () => {
    const young = summary({ symbol: 'YOUNG', ageHours: 5 });
    const old = summary({ symbol: 'OLD', ageHours: 900 });

    const byAge = parseFilters(new URLSearchParams('ageMax=24'));
    expect(applyFilters([young, old], byAge, NOW).map((i) => i.ref.symbol)).toEqual(['YOUNG']);

    const thin = summary({ symbol: 'THIN', volume24h: 900_000, liquidity: 100_000 });
    const deep = summary({ symbol: 'DEEP', volume24h: 100_000, liquidity: 1_000_000 });
    const byVlr = parseFilters(new URLSearchParams('vlrMin=3'));
    expect(applyFilters([thin, deep], byVlr, NOW).map((i) => i.ref.symbol)).toEqual(['THIN']);
  });

  it('returns everything when nothing is filtered', () => {
    expect(applyFilters(items, parseFilters(new URLSearchParams('')), NOW)).toHaveLength(3);
  });
});

describe('applySort', () => {
  it('sorts descending by default and ascending on request', () => {
    const items = [
      summary({ symbol: 'A', score: 40 }),
      summary({ symbol: 'B', score: 90 }),
      summary({ symbol: 'C', score: 65 }),
    ];

    expect(applySort(items, 'score', 'desc', NOW).map((i) => i.ref.symbol)).toEqual(['B', 'C', 'A']);
    expect(applySort(items, 'score', 'asc', NOW).map((i) => i.ref.symbol)).toEqual(['A', 'C', 'B']);
  });

  it('sorts unknown values last in both directions', () => {
    const items = [
      summary({ symbol: 'NONE', score: null }),
      summary({ symbol: 'HIGH', score: 90 }),
      summary({ symbol: 'LOW', score: 10 }),
    ];

    // A null must never win a sort by accident, in either direction.
    expect(applySort(items, 'score', 'desc', NOW).map((i) => i.ref.symbol)).toEqual(['HIGH', 'LOW', 'NONE']);
    expect(applySort(items, 'score', 'asc', NOW).map((i) => i.ref.symbol)).toEqual(['LOW', 'HIGH', 'NONE']);
  });

  it('does not mutate its input', () => {
    const items = [summary({ symbol: 'A', score: 10 }), summary({ symbol: 'B', score: 90 })];
    const before = items.map((i) => i.ref.symbol);
    applySort(items, 'score', 'desc', NOW);
    expect(items.map((i) => i.ref.symbol)).toEqual(before);
  });
});

describe('paginate', () => {
  const items = Array.from({ length: 55 }, (_, i) => i);

  it('returns the first page and a cursor', () => {
    const page = paginate(items, null, 20);
    expect(page.items).toHaveLength(20);
    expect(page.nextCursor).toBe('20');
  });

  it('walks to the end and stops', () => {
    const page = paginate(items, '40', 20);
    expect(page.items).toHaveLength(15);
    expect(page.nextCursor).toBeNull();
  });

  it('treats a malformed cursor as the start', () => {
    expect(paginate(items, 'garbage', 5).items[0]).toBe(0);
  });

  it('clamps an absurd limit', () => {
    expect(paginate(items, null, 100_000).items).toHaveLength(55);
    expect(paginate(items, null, -5).items).toHaveLength(1);
  });
});
