import { isNum, round } from './math';

export type TradeMode = 'paper' | 'real';
export type TradeStatus = 'open' | 'closed';

export interface JournalTrade {
  id: string;
  mode: TradeMode;
  status: TradeStatus;
  tokenAddress: string;
  tokenSymbol: string;
  tokenLogo: string | null;
  /** Position size in USD at entry. */
  sizeUsd: number;
  entryPrice: number;
  exitPrice: number | null;
  openedAt: number;
  closedAt: number | null;
  setup: string;
  entryReason: string;
  exitReason: string;
  notes: string;
  /** MOVA score at the time of entry, for later review of the thesis. */
  scoreAtEntry: number | null;
}

export interface JournalStats {
  totalTrades: number;
  closedTrades: number;
  openTrades: number;
  wins: number;
  losses: number;
  breakEven: number;
  /** 0-100. Null when nothing has been closed yet. */
  winRatePct: number | null;
  averageWinUsd: number | null;
  averageLossUsd: number | null;
  /** Gross profit / gross loss. Null when there are no losses to divide by. */
  profitFactor: number | null;
  /** Expected USD result per trade, at the sizes actually used. */
  expectancyUsd: number | null;
  totalPnlUsd: number;
  /** Largest peak-to-trough decline of the running equity curve, in USD. */
  maxDrawdownUsd: number;
  bestTradeUsd: number | null;
  worstTradeUsd: number | null;
  /** Running cumulative P/L after each closed trade, oldest first. */
  equityCurve: number[];
}

/** Realised P/L in USD. Null while the trade is still open. */
export function tradePnl(trade: JournalTrade): number | null {
  if (trade.status !== 'closed') return null;
  if (!isNum(trade.exitPrice) || !isNum(trade.entryPrice) || trade.entryPrice <= 0) return null;
  if (!isNum(trade.sizeUsd) || trade.sizeUsd <= 0) return null;
  const units = trade.sizeUsd / trade.entryPrice;
  return units * (trade.exitPrice - trade.entryPrice);
}

/** Realised return as a percent of the position. Null while open. */
export function tradePnlPct(trade: JournalTrade): number | null {
  const pnl = tradePnl(trade);
  if (pnl == null || !isNum(trade.sizeUsd) || trade.sizeUsd <= 0) return null;
  return (pnl / trade.sizeUsd) * 100;
}

const EMPTY_STATS: JournalStats = {
  totalTrades: 0,
  closedTrades: 0,
  openTrades: 0,
  wins: 0,
  losses: 0,
  breakEven: 0,
  winRatePct: null,
  averageWinUsd: null,
  averageLossUsd: null,
  profitFactor: null,
  expectancyUsd: null,
  totalPnlUsd: 0,
  maxDrawdownUsd: 0,
  bestTradeUsd: null,
  worstTradeUsd: null,
  equityCurve: [],
};

/**
 * Performance statistics over a set of journal entries.
 *
 * Only closed trades with usable prices contribute. Open positions are counted
 * but never marked to market here — unrealised P/L is a live number and does
 * not belong in a record of what actually happened.
 */
export function computeJournalStats(trades: JournalTrade[]): JournalStats {
  if (!Array.isArray(trades) || trades.length === 0) return { ...EMPTY_STATS };

  const openTrades = trades.filter((t) => t.status === 'open').length;
  const closed = trades
    .filter((t) => t.status === 'closed')
    .map((t) => ({ trade: t, pnl: tradePnl(t) }))
    .filter((x): x is { trade: JournalTrade; pnl: number } => x.pnl != null)
    .sort((a, b) => (a.trade.closedAt ?? 0) - (b.trade.closedAt ?? 0));

  if (closed.length === 0) {
    return { ...EMPTY_STATS, totalTrades: trades.length, openTrades };
  }

  let grossProfit = 0;
  let grossLoss = 0;
  let wins = 0;
  let losses = 0;
  let breakEven = 0;
  let running = 0;
  let peak = 0;
  let maxDrawdown = 0;
  const equityCurve: number[] = [];

  for (const { pnl } of closed) {
    if (pnl > 0) {
      wins += 1;
      grossProfit += pnl;
    } else if (pnl < 0) {
      losses += 1;
      grossLoss += Math.abs(pnl);
    } else {
      breakEven += 1;
    }

    running += pnl;
    equityCurve.push(round(running, 2));
    peak = Math.max(peak, running);
    maxDrawdown = Math.max(maxDrawdown, peak - running);
  }

  const totalPnlUsd = running;
  const averageWinUsd = wins > 0 ? grossProfit / wins : null;
  const averageLossUsd = losses > 0 ? grossLoss / losses : null;

  // Profit factor is undefined without losses; reporting Infinity would read as
  // a strategy that cannot lose, which is exactly the claim to avoid.
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : null;

  return {
    totalTrades: trades.length,
    closedTrades: closed.length,
    openTrades,
    wins,
    losses,
    breakEven,
    winRatePct: round((wins / closed.length) * 100, 1),
    averageWinUsd: averageWinUsd == null ? null : round(averageWinUsd, 2),
    averageLossUsd: averageLossUsd == null ? null : round(averageLossUsd, 2),
    profitFactor: profitFactor == null ? null : round(profitFactor, 2),
    expectancyUsd: round(totalPnlUsd / closed.length, 2),
    totalPnlUsd: round(totalPnlUsd, 2),
    maxDrawdownUsd: round(maxDrawdown, 2),
    bestTradeUsd: round(Math.max(...closed.map((c) => c.pnl)), 2),
    worstTradeUsd: round(Math.min(...closed.map((c) => c.pnl)), 2),
    equityCurve,
  };
}
