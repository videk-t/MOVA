import { computeJournalStats, tradePnl, tradePnlPct, type JournalTrade } from '../journal-stats';

let counter = 0;

function trade(overrides: Partial<JournalTrade> = {}): JournalTrade {
  counter += 1;
  return {
    id: `t${counter}`,
    mode: 'paper',
    status: 'closed',
    tokenAddress: '7xKXtg2CW3xM8mQvKzYbNpRdFhJnLsWuVaBcDeFgHi9',
    tokenSymbol: 'ABC',
    tokenLogo: null,
    sizeUsd: 1_000,
    entryPrice: 1,
    exitPrice: 1.5,
    openedAt: 1_700_000_000_000 + counter * 1_000,
    closedAt: 1_700_000_100_000 + counter * 1_000,
    setup: 'Breakout',
    entryReason: '',
    exitReason: '',
    notes: '',
    scoreAtEntry: 80,
    ...overrides,
  };
}

describe('tradePnl', () => {
  it('scales the price move by the position size', () => {
    expect(tradePnl(trade({ sizeUsd: 1_000, entryPrice: 1, exitPrice: 1.5 }))).toBeCloseTo(500, 6);
    expect(tradePnl(trade({ sizeUsd: 1_000, entryPrice: 1, exitPrice: 0.4 }))).toBeCloseTo(-600, 6);
  });

  it('works at sub-cent prices', () => {
    const pnl = tradePnl(trade({ sizeUsd: 500, entryPrice: 0.0000012, exitPrice: 0.0000018 }));
    expect(pnl).toBeCloseTo(250, 4);
  });

  it('returns null for open trades and unusable prices', () => {
    expect(tradePnl(trade({ status: 'open', exitPrice: null }))).toBeNull();
    expect(tradePnl(trade({ entryPrice: 0 }))).toBeNull();
    expect(tradePnl(trade({ sizeUsd: 0 }))).toBeNull();
    expect(tradePnl(trade({ exitPrice: Number.NaN }))).toBeNull();
  });

  it('reports percentage return', () => {
    expect(tradePnlPct(trade({ sizeUsd: 1_000, entryPrice: 1, exitPrice: 1.5 }))).toBeCloseTo(50, 6);
  });
});

describe('computeJournalStats', () => {
  it('returns a zeroed shape for no trades', () => {
    const stats = computeJournalStats([]);
    expect(stats.totalTrades).toBe(0);
    expect(stats.winRatePct).toBeNull();
    expect(stats.profitFactor).toBeNull();
    expect(stats.totalPnlUsd).toBe(0);
    expect(stats.equityCurve).toEqual([]);
  });

  it('counts open trades but excludes them from performance', () => {
    const stats = computeJournalStats([
      trade({ status: 'open', exitPrice: null, closedAt: null }),
      trade({ status: 'open', exitPrice: null, closedAt: null }),
    ]);

    expect(stats.totalTrades).toBe(2);
    expect(stats.openTrades).toBe(2);
    expect(stats.closedTrades).toBe(0);
    expect(stats.winRatePct).toBeNull();
  });

  it('computes the full statistics set over a mixed record', () => {
    // +500, -300, +500, -300 on $1,000 positions.
    const stats = computeJournalStats([
      trade({ entryPrice: 1, exitPrice: 1.5 }),
      trade({ entryPrice: 1, exitPrice: 0.7 }),
      trade({ entryPrice: 1, exitPrice: 1.5 }),
      trade({ entryPrice: 1, exitPrice: 0.7 }),
    ]);

    expect(stats.closedTrades).toBe(4);
    expect(stats.wins).toBe(2);
    expect(stats.losses).toBe(2);
    expect(stats.winRatePct).toBe(50);
    expect(stats.averageWinUsd).toBeCloseTo(500, 2);
    expect(stats.averageLossUsd).toBeCloseTo(300, 2);
    expect(stats.profitFactor).toBeCloseTo(1000 / 600, 2);
    expect(stats.totalPnlUsd).toBeCloseTo(400, 2);
    expect(stats.expectancyUsd).toBeCloseTo(100, 2);
    expect(stats.bestTradeUsd).toBeCloseTo(500, 2);
    expect(stats.worstTradeUsd).toBeCloseTo(-300, 2);
  });

  it('measures max drawdown from the equity peak, not from zero', () => {
    // +1000, then -400, -400 → peak 1000, trough 200 → drawdown 800.
    const stats = computeJournalStats([
      trade({ entryPrice: 1, exitPrice: 2, closedAt: 1 }),
      trade({ entryPrice: 1, exitPrice: 0.6, closedAt: 2 }),
      trade({ entryPrice: 1, exitPrice: 0.6, closedAt: 3 }),
    ]);

    expect(stats.equityCurve).toEqual([1000, 600, 200]);
    expect(stats.maxDrawdownUsd).toBeCloseTo(800, 2);
  });

  it('orders the equity curve by close time regardless of input order', () => {
    const stats = computeJournalStats([
      trade({ entryPrice: 1, exitPrice: 0.6, closedAt: 3_000 }),
      trade({ entryPrice: 1, exitPrice: 2, closedAt: 1_000 }),
    ]);
    expect(stats.equityCurve).toEqual([1000, 600]);
  });

  it('withholds profit factor rather than reporting infinity when nothing lost', () => {
    const stats = computeJournalStats([trade({ entryPrice: 1, exitPrice: 1.5 })]);
    expect(stats.profitFactor).toBeNull();
    expect(stats.losses).toBe(0);
  });

  it('counts a flat exit as break-even, not as a win', () => {
    const stats = computeJournalStats([trade({ entryPrice: 1, exitPrice: 1 })]);
    expect(stats.breakEven).toBe(1);
    expect(stats.wins).toBe(0);
    expect(stats.winRatePct).toBe(0);
  });

  it('ignores closed trades with unusable prices instead of throwing', () => {
    const stats = computeJournalStats([
      trade({ entryPrice: 1, exitPrice: 1.5 }),
      trade({ entryPrice: 0, exitPrice: 5 }),
      trade({ exitPrice: null }),
    ]);

    expect(stats.totalTrades).toBe(3);
    expect(stats.closedTrades).toBe(1);
  });

  it('handles a non-array input defensively', () => {
    expect(computeJournalStats(undefined as unknown as JournalTrade[]).totalTrades).toBe(0);
  });
});
