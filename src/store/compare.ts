import { create } from 'zustand';
import type { TokenRef } from '@/core/types';

/**
 * Compare selection.
 *
 * Deliberately not persisted: a comparison is a question you are asking right
 * now, and restoring last week's selection on launch would be noise.
 */

export const MAX_COMPARE = 4;

interface CompareState {
  selected: TokenRef[];
  toggle: (ref: TokenRef) => { added: boolean; full: boolean };
  remove: (address: string) => void;
  clear: () => void;
  has: (address: string) => boolean;
}

export const useCompare = create<CompareState>((set, get) => ({
  selected: [],

  toggle: (ref) => {
    const { selected } = get();
    const exists = selected.some((t) => t.address === ref.address);

    if (exists) {
      set({ selected: selected.filter((t) => t.address !== ref.address) });
      return { added: false, full: false };
    }
    if (selected.length >= MAX_COMPARE) {
      // Beyond four columns the table stops being readable on a phone.
      return { added: false, full: true };
    }
    set({ selected: [...selected, ref] });
    return { added: true, full: false };
  },

  remove: (address) => set((state) => ({ selected: state.selected.filter((t) => t.address !== address) })),
  clear: () => set({ selected: [] }),
  has: (address) => get().selected.some((t) => t.address === address),
}));

export function useIsComparing(address: string): boolean {
  return useCompare((state) => state.selected.some((t) => t.address === address));
}
