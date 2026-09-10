import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TokenRef } from '@/core/types';
import { isWatchlistSort, type WatchedToken, type WatchlistSortKey } from '@/core/watchlist';
import { asNumber, asString, isRecord, safeMerge, storage } from './persist';

/** The persisted entry shape. Defined in core so the row builder can be tested. */
export type WatchlistEntry = WatchedToken;

export type WatchlistSort = WatchlistSortKey;

interface WatchlistState {
  entries: WatchlistEntry[];
  sort: WatchlistSort;
  add: (ref: TokenRef, score: number | null) => void;
  remove: (address: string) => void;
  toggle: (ref: TokenRef, score: number | null) => boolean;
  setNote: (address: string, note: string) => void;
  setSort: (sort: WatchlistSort) => void;
  has: (address: string) => boolean;
  clear: () => void;
}

const MAX_ENTRIES = 200;

function isEntry(value: unknown): value is WatchlistEntry {
  return isRecord(value) && typeof value.address === 'string' && typeof value.symbol === 'string';
}

export const useWatchlist = create<WatchlistState>()(
  persist(
    (set, get) => ({
      entries: [],
      sort: 'added',

      add: (ref, score) => {
        set((state) => {
          if (state.entries.some((e) => e.address === ref.address)) return state;
          const entry: WatchlistEntry = {
            address: ref.address,
            symbol: ref.symbol,
            name: ref.name,
            logoUri: ref.logoUri,
            addedAt: Date.now(),
            scoreAtAdd: score,
            note: '',
          };
          return { entries: [entry, ...state.entries].slice(0, MAX_ENTRIES) };
        });
      },

      remove: (address) => {
        set((state) => ({ entries: state.entries.filter((e) => e.address !== address) }));
      },

      toggle: (ref, score) => {
        const exists = get().entries.some((e) => e.address === ref.address);
        if (exists) get().remove(ref.address);
        else get().add(ref, score);
        return !exists;
      },

      setNote: (address, note) => {
        set((state) => ({
          entries: state.entries.map((e) => (e.address === address ? { ...e, note: note.slice(0, 500) } : e)),
        }));
      },

      setSort: (sort) => set({ sort }),

      has: (address) => get().entries.some((e) => e.address === address),

      clear: () => set({ entries: [] }),
    }),
    {
      name: 'mova.watchlist.v1',
      storage,
      partialize: (state) => ({ entries: state.entries, sort: state.sort }) as WatchlistState,
      merge: safeMerge((persisted, current) => {
        if (!isRecord(persisted)) return current;
        const raw = Array.isArray(persisted.entries) ? persisted.entries : [];
        const entries = raw
          .filter(isEntry)
          .slice(0, MAX_ENTRIES)
          .map((e) => ({
            address: e.address,
            symbol: asString(e.symbol, '???').slice(0, 16),
            name: asString(e.name, 'Unknown token').slice(0, 48),
            logoUri: typeof e.logoUri === 'string' ? e.logoUri : null,
            addedAt: asNumber(e.addedAt, Date.now()),
            scoreAtAdd: typeof e.scoreAtAdd === 'number' && Number.isFinite(e.scoreAtAdd) ? e.scoreAtAdd : null,
            note: asString(e.note).slice(0, 500),
          }));

        return {
          ...current,
          entries,
          sort: isWatchlistSort(persisted.sort) ? persisted.sort : 'added',
        };
      }),
    },
  ),
);

/** Stable selector for "is this token watched", so rows do not re-render on every change. */
export function useIsWatched(address: string): boolean {
  return useWatchlist((state) => state.entries.some((e) => e.address === address));
}
