import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AlertEvent } from '@/core/types';
import type { AlertCondition, AlertRule, AlertScope, TokenSnapshot } from '@/core/alert-rules';
import { describeRule } from '@/core/alert-rules';
import { isRecord, makeId, safeMerge, storage } from './persist';

interface AlertsState {
  rules: AlertRule[];
  events: AlertEvent[];
  /** Last observed state per token, used for change-based conditions. */
  snapshots: Record<string, TokenSnapshot>;
  /** Master switch — turning alerts off keeps the rules but stops evaluation. */
  enabled: boolean;

  addRule: (input: { scope: AlertScope; condition: AlertCondition; cooldownMinutes?: number }) => AlertRule;
  removeRule: (id: string) => void;
  toggleRule: (id: string) => void;
  markRuleTriggered: (id: string, at: number) => void;

  pushEvent: (event: Omit<AlertEvent, 'id' | 'read'>) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  clearEvents: () => void;

  setSnapshot: (address: string, snapshot: TokenSnapshot) => void;
  setEnabled: (enabled: boolean) => void;
  unreadCount: () => number;
}

const MAX_EVENTS = 120;
const MAX_RULES = 60;
const MAX_SNAPSHOTS = 300;

/** Rules a new install starts with, so Alerts is never an empty screen. */
function defaultRules(): AlertRule[] {
  const now = Date.now();
  const base = { enabled: true, createdAt: now, lastTriggeredAt: null, cooldownMs: 30 * 60_000 };
  const rules: AlertRule[] = [
    { id: makeId('rule'), scope: { type: 'watchlist' }, condition: { kind: 'score_moves', value: 10 }, label: '', ...base },
    { id: makeId('rule'), scope: { type: 'watchlist' }, condition: { kind: 'liquidity_drop', value: 25 }, label: '', ...base },
    { id: makeId('rule'), scope: { type: 'watchlist' }, condition: { kind: 'dev_activity' }, label: '', ...base },
    { id: makeId('rule'), scope: { type: 'all' }, condition: { kind: 'breakout' }, label: '', ...base },
  ];
  return rules.map((rule) => ({ ...rule, label: describeRule(rule) }));
}

export const useAlerts = create<AlertsState>()(
  persist(
    (set, get) => ({
      rules: defaultRules(),
      events: [],
      snapshots: {},
      enabled: true,

      addRule: ({ scope, condition, cooldownMinutes = 30 }) => {
        const rule: AlertRule = {
          id: makeId('rule'),
          scope,
          condition,
          label: '',
          enabled: true,
          createdAt: Date.now(),
          lastTriggeredAt: null,
          cooldownMs: Math.max(1, cooldownMinutes) * 60_000,
        };
        rule.label = describeRule(rule);
        set((state) => ({ rules: [rule, ...state.rules].slice(0, MAX_RULES) }));
        return rule;
      },

      removeRule: (id) => set((state) => ({ rules: state.rules.filter((r) => r.id !== id) })),

      toggleRule: (id) =>
        set((state) => ({
          rules: state.rules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)),
        })),

      markRuleTriggered: (id, at) =>
        set((state) => ({
          rules: state.rules.map((r) => (r.id === id ? { ...r, lastTriggeredAt: at } : r)),
        })),

      pushEvent: (event) =>
        set((state) => {
          // Collapse a repeat of the same alert for the same token inside a
          // short window, so one volatile token cannot flood the feed.
          const duplicate = state.events.find(
            (e) =>
              e.tokenAddress === event.tokenAddress &&
              e.kind === event.kind &&
              event.at - e.at < 10 * 60_000,
          );
          if (duplicate) return state;
          const full: AlertEvent = { ...event, id: makeId('evt'), read: false };
          return { events: [full, ...state.events].slice(0, MAX_EVENTS) };
        }),

      markRead: (id) =>
        set((state) => ({ events: state.events.map((e) => (e.id === id ? { ...e, read: true } : e)) })),

      markAllRead: () => set((state) => ({ events: state.events.map((e) => ({ ...e, read: true })) })),

      clearEvents: () => set({ events: [] }),

      setSnapshot: (address, snapshot) =>
        set((state) => {
          const next = { ...state.snapshots, [address]: snapshot };
          const keys = Object.keys(next);
          if (keys.length > MAX_SNAPSHOTS) {
            // Drop the oldest observations rather than growing without bound.
            const sorted = keys.sort((a, b) => (next[a]?.at ?? 0) - (next[b]?.at ?? 0));
            for (const key of sorted.slice(0, keys.length - MAX_SNAPSHOTS)) delete next[key];
          }
          return { snapshots: next };
        }),

      setEnabled: (enabled) => set({ enabled }),

      unreadCount: () => get().events.filter((e) => !e.read).length,
    }),
    {
      name: 'mova.alerts.v1',
      storage,
      partialize: (state) =>
        ({
          rules: state.rules,
          events: state.events,
          snapshots: state.snapshots,
          enabled: state.enabled,
        }) as AlertsState,
      merge: safeMerge((persisted, current) => {
        if (!isRecord(persisted)) return current;

        const rules = Array.isArray(persisted.rules)
          ? persisted.rules.filter(
              (r): r is AlertRule =>
                isRecord(r) && typeof r.id === 'string' && isRecord(r.condition) && isRecord(r.scope),
            )
          : current.rules;

        const events = Array.isArray(persisted.events)
          ? persisted.events
              .filter(
                (e): e is AlertEvent =>
                  isRecord(e) && typeof e.id === 'string' && typeof e.tokenAddress === 'string',
              )
              .slice(0, MAX_EVENTS)
          : [];

        return {
          ...current,
          rules: rules.slice(0, MAX_RULES),
          events,
          snapshots: isRecord(persisted.snapshots) ? (persisted.snapshots as Record<string, TokenSnapshot>) : {},
          enabled: typeof persisted.enabled === 'boolean' ? persisted.enabled : true,
        };
      }),
    },
  ),
);

export function useUnreadAlertCount(): number {
  return useAlerts((state) => state.events.reduce((count, e) => count + (e.read ? 0 : 1), 0));
}
