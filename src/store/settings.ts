import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { asBoolean, asNumber, asString, isRecord, safeMerge, storage } from './persist';

export type TradeVenue = 'gmgn' | 'fomo' | 'jupiter' | 'dexscreener' | 'birdeye' | 'solscan';

interface SettingsState {
  /** Set once the user has seen the "MOVA is research, not execution" notice. */
  hasSeenDisclaimer: boolean;
  /** Optional local display name. MOVA has no account requirement. */
  displayName: string;
  hapticsEnabled: boolean;
  /** Auto-refresh interval for live screens, in seconds. 0 disables it. */
  refreshIntervalSec: number;
  preferredVenue: TradeVenue;
  /** Portfolio size remembered by the risk calculator between sessions. */
  portfolioUsd: number;
  defaultRiskPct: number;
  /** Reduces motion for users who prefer it. */
  reduceMotion: boolean;

  acceptDisclaimer: () => void;
  setDisplayName: (name: string) => void;
  setHaptics: (enabled: boolean) => void;
  setRefreshInterval: (seconds: number) => void;
  setPreferredVenue: (venue: TradeVenue) => void;
  setPortfolio: (usd: number) => void;
  setDefaultRisk: (pct: number) => void;
  setReduceMotion: (value: boolean) => void;
  reset: () => void;
}

const DEFAULTS = {
  hasSeenDisclaimer: false,
  displayName: '',
  hapticsEnabled: true,
  refreshIntervalSec: 30,
  preferredVenue: 'gmgn' as TradeVenue,
  portfolioUsd: 5_000,
  defaultRiskPct: 2,
  reduceMotion: false,
};

const VENUES: TradeVenue[] = ['gmgn', 'fomo', 'jupiter', 'dexscreener', 'birdeye', 'solscan'];

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULTS,

      acceptDisclaimer: () => set({ hasSeenDisclaimer: true }),
      setDisplayName: (name) => set({ displayName: name.slice(0, 40) }),
      setHaptics: (hapticsEnabled) => set({ hapticsEnabled }),
      setRefreshInterval: (seconds) => set({ refreshIntervalSec: Math.max(0, Math.min(300, seconds)) }),
      setPreferredVenue: (preferredVenue) => set({ preferredVenue }),
      setPortfolio: (usd) => set({ portfolioUsd: Math.max(0, Math.min(1e12, usd)) }),
      setDefaultRisk: (pct) => set({ defaultRiskPct: Math.max(0.1, Math.min(100, pct)) }),
      setReduceMotion: (reduceMotion) => set({ reduceMotion }),
      reset: () => set({ ...DEFAULTS }),
    }),
    {
      name: 'mova.settings.v1',
      storage,
      merge: safeMerge((persisted, current) => {
        if (!isRecord(persisted)) return current;
        const venue = persisted.preferredVenue;
        return {
          ...current,
          hasSeenDisclaimer: asBoolean(persisted.hasSeenDisclaimer, false),
          displayName: asString(persisted.displayName).slice(0, 40),
          hapticsEnabled: asBoolean(persisted.hapticsEnabled, true),
          refreshIntervalSec: Math.max(0, Math.min(300, asNumber(persisted.refreshIntervalSec, 30))),
          preferredVenue: VENUES.includes(venue as TradeVenue) ? (venue as TradeVenue) : 'gmgn',
          portfolioUsd: Math.max(0, asNumber(persisted.portfolioUsd, DEFAULTS.portfolioUsd)),
          defaultRiskPct: Math.max(0.1, Math.min(100, asNumber(persisted.defaultRiskPct, 2))),
          reduceMotion: asBoolean(persisted.reduceMotion, false),
        };
      }),
    },
  ),
);
