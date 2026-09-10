import { useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { JournalTrade, TradeMode } from '@/core/journal-stats';
import { computeJournalStats } from '@/core/journal-stats';
import type { TokenRef } from '@/core/types';
import { isRecord, makeId, safeMerge, storage } from './persist';

/**
 * Trade journal and paper-trading ledger.
 *
 * Paper and manually-recorded real trades live in the same store but are kept
 * strictly separated by `mode` everywhere they are read — mixing simulated
 * results into a real track record would make the statistics worthless.
 *
 * MOVA never connects to an exchange or a wallet. Every number here is typed in
 * by the user.
 */

export interface OpenTradeInput {
  ref: TokenRef;
  mode: TradeMode;
  sizeUsd: number;
  entryPrice: number;
  setup: string;
  entryReason: string;
  notes?: string;
  scoreAtEntry: number | null;
}

/** Starting balance for the paper account, in USD. */
export const PAPER_STARTING_BALANCE = 10_000;

interface JournalState {
  trades: JournalTrade[];
  open: (input: OpenTradeInput) => JournalTrade;
  close: (id: string, exitPrice: number, exitReason: string) => void;
  update: (id: string, patch: Partial<Omit<JournalTrade, 'id'>>) => void;
  remove: (id: string) => void;
  clearMode: (mode: TradeMode) => void;
  /** Realised P/L plus the cash not currently in a position. */
  paperBalance: () => { cash: number; deployed: number; realised: number };
}

const MAX_TRADES = 500;

export const useJournal = create<JournalState>()(
  persist(
    (set, get) => ({
      trades: [],

      open: (input) => {
        const trade: JournalTrade = {
          id: makeId('trade'),
          mode: input.mode,
          status: 'open',
          tokenAddress: input.ref.address,
          tokenSymbol: input.ref.symbol,
          tokenLogo: input.ref.logoUri,
          sizeUsd: input.sizeUsd,
          entryPrice: input.entryPrice,
          exitPrice: null,
          openedAt: Date.now(),
          closedAt: null,
          setup: input.setup.slice(0, 80),
          entryReason: input.entryReason.slice(0, 1_000),
          exitReason: '',
          notes: (input.notes ?? '').slice(0, 2_000),
          scoreAtEntry: input.scoreAtEntry,
        };
        set((state) => ({ trades: [trade, ...state.trades].slice(0, MAX_TRADES) }));
        return trade;
      },

      close: (id, exitPrice, exitReason) => {
        set((state) => ({
          trades: state.trades.map((t) =>
            t.id === id && t.status === 'open'
              ? {
                  ...t,
                  status: 'closed',
                  exitPrice,
                  closedAt: Date.now(),
                  exitReason: exitReason.slice(0, 1_000),
                }
              : t,
          ),
        }));
      },

      update: (id, patch) => {
        set((state) => ({ trades: state.trades.map((t) => (t.id === id ? { ...t, ...patch, id } : t)) }));
      },

      remove: (id) => set((state) => ({ trades: state.trades.filter((t) => t.id !== id) })),

      clearMode: (mode) => set((state) => ({ trades: state.trades.filter((t) => t.mode !== mode) })),

      paperBalance: () => {
        const paper = get().trades.filter((t) => t.mode === 'paper');
        const stats = computeJournalStats(paper);
        const deployed = paper
          .filter((t) => t.status === 'open')
          .reduce((sum, t) => sum + (Number.isFinite(t.sizeUsd) ? t.sizeUsd : 0), 0);
        const realised = stats.totalPnlUsd;
        return { cash: PAPER_STARTING_BALANCE + realised - deployed, deployed, realised };
      },
    }),
    {
      name: 'mova.journal.v1',
      storage,
      partialize: (state) => ({ trades: state.trades }) as JournalState,
      merge: safeMerge((persisted, current) => {
        if (!isRecord(persisted) || !Array.isArray(persisted.trades)) return current;
        const trades = persisted.trades
          .filter(
            (t): t is JournalTrade =>
              isRecord(t) &&
              typeof t.id === 'string' &&
              typeof t.tokenAddress === 'string' &&
              (t.mode === 'paper' || t.mode === 'real') &&
              (t.status === 'open' || t.status === 'closed'),
          )
          .slice(0, MAX_TRADES);
        return { ...current, trades };
      }),
    },
  ),
);

/**
 * Trades for one mode, newest first.
 *
 * The filtering happens in a memo rather than inside the selector: a selector
 * that builds a new array on every call gives zustand a different snapshot each
 * time and re-renders forever.
 */
export function useTrades(mode: TradeMode): JournalTrade[] {
  const trades = useJournal((state) => state.trades);
  return useMemo(
    () => trades.filter((t) => t.mode === mode).sort((a, b) => b.openedAt - a.openedAt),
    [trades, mode],
  );
}
