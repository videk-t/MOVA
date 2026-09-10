import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import type { AlertEvent, TokenDetail } from '@/core/types';
import { computeMovaScore } from '@/core/scoring';
import { evaluateRule, isCoolingDown, type TokenSnapshot } from '@/core/alert-rules';
import { useAlerts } from '@/store/alerts';
import { useWatchlist } from '@/store/watchlist';
import { getProviders } from './providers';

/**
 * Alert evaluation.
 *
 * Rules are evaluated on the device against tokens the user actually cares
 * about — the watchlist, plus a small trending sample for "all tokens" rules.
 * This keeps the MVP free of any server-side scheduler while still producing a
 * real, working alert feed.
 *
 * Change-based conditions need a previous observation, so each pass stores a
 * snapshot per token. The first time a token is seen it can only fire
 * threshold rules, never change rules — which is correct: nothing has changed
 * yet.
 *
 * A production build would move this to a backend worker with push delivery;
 * the rule logic in `@/core/alert-rules` is deliberately pure so it can run in
 * either place unchanged.
 */

const SWEEP_INTERVAL_MS = 45_000;
/** Cap on tokens examined per sweep, so a large watchlist cannot stall the UI. */
const MAX_TOKENS_PER_SWEEP = 12;

async function sweep(): Promise<void> {
  const alerts = useAlerts.getState();
  if (!alerts.enabled || alerts.rules.every((r) => !r.enabled)) return;

  const watched = useWatchlist.getState().entries.map((e) => e.address);
  const needsGlobal = alerts.rules.some((r) => r.enabled && r.scope.type === 'all');

  const addresses = new Set(watched);

  if (needsGlobal) {
    try {
      const trending = await getProviders().market.getTrending();
      for (const item of trending.data.slice(0, 6)) addresses.add(item.ref.address);
    } catch {
      // A failed trending fetch should not stop watchlist rules from running.
    }
  }

  const targets = [...addresses].slice(0, MAX_TOKENS_PER_SWEEP);
  if (targets.length === 0) return;

  const providers = getProviders();
  const now = Date.now();

  for (const address of targets) {
    let detail: TokenDetail;
    let origin: AlertEvent['origin'];
    try {
      const response = await providers.token.getToken(address);
      detail = response.data;
      origin = response.meta.origin;
    } catch {
      continue;
    }

    const score = computeMovaScore(detail);
    const state = useAlerts.getState();
    const previous: TokenSnapshot | null = state.snapshots[address] ?? null;

    for (const rule of state.rules) {
      if (!rule.enabled) continue;
      if (rule.scope.type === 'watchlist' && !watched.includes(address)) continue;
      if (isCoolingDown(rule, now)) continue;

      const match = evaluateRule(rule, detail, score, previous);
      if (!match) continue;

      useAlerts.getState().pushEvent({
        kind: match.kind,
        severity: match.severity,
        tokenAddress: detail.ref.address,
        tokenSymbol: detail.ref.symbol,
        tokenLogo: detail.ref.logoUri,
        title: match.title,
        body: match.body,
        at: now,
        origin,
      });
      useAlerts.getState().markRuleTriggered(rule.id, now);
    }

    useAlerts.getState().setSnapshot(address, {
      score: score.total,
      risk: score.risk,
      liquidityUsd: detail.market.liquidityUsd,
      volume1hUsd: detail.market.volume1hUsd,
      priceUsd: detail.market.priceUsd,
      at: now,
    });
  }
}

/**
 * Runs the alert sweep while the app is in the foreground.
 *
 * Mounted once, at the root. Sweeps pause in the background rather than
 * draining the battery, and never overlap: a slow sweep delays the next one
 * instead of stacking with it.
 */
export function useAlertEngine(): void {
  const running = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const run = async () => {
      if (cancelled || running.current) return;
      if (AppState.currentState !== 'active') return;
      running.current = true;
      try {
        await sweep();
      } catch {
        // A failed sweep is not worth surfacing; the next one will retry.
      } finally {
        running.current = false;
      }
    };

    const schedule = () => {
      timer = setTimeout(async () => {
        await run();
        if (!cancelled) schedule();
      }, SWEEP_INTERVAL_MS);
    };

    // Give the first screen a moment to settle before doing background work.
    const initial = setTimeout(() => {
      void run();
      schedule();
    }, 4_000);

    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void run();
    });

    return () => {
      cancelled = true;
      clearTimeout(initial);
      if (timer) clearTimeout(timer);
      subscription.remove();
    };
  }, []);
}

export { sweep as runAlertSweep };
