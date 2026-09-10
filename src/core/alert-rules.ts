import type { AlertKind, AlertSeverity, RiskLevel, TokenDetail } from './types';
import type { MovaScore } from './scoring';
import { isNum, ratio } from './math';

export type AlertScope =
  | { type: 'watchlist' }
  | { type: 'all' }
  | { type: 'token'; address: string; symbol: string };

export type AlertCondition =
  | { kind: 'score_above'; value: number }
  | { kind: 'score_below'; value: number }
  | { kind: 'score_moves'; value: number }
  | { kind: 'price_change'; value: number; window: '5m' | '1h' | '24h' }
  | { kind: 'volume_spike'; value: number }
  | { kind: 'liquidity_drop'; value: number }
  | { kind: 'whale_activity'; value: number }
  | { kind: 'dev_activity' }
  | { kind: 'risk_worsens' }
  | { kind: 'breakout' };

export interface AlertRule {
  id: string;
  label: string;
  scope: AlertScope;
  condition: AlertCondition;
  enabled: boolean;
  createdAt: number;
  lastTriggeredAt: number | null;
  /** Minimum gap between firings for the same token, in ms. */
  cooldownMs: number;
}

/** The previous observation of a token, used for change-based conditions. */
export interface TokenSnapshot {
  score: number | null;
  risk: RiskLevel;
  liquidityUsd: number | null;
  volume1hUsd: number | null;
  priceUsd: number | null;
  at: number;
}

export interface RuleMatch {
  kind: AlertKind;
  severity: AlertSeverity;
  title: string;
  body: string;
}

const RISK_ORDER: Record<RiskLevel, number> = { low: 0, moderate: 1, elevated: 2, high: 3 };

export const CONDITION_LABELS: Record<AlertCondition['kind'], string> = {
  score_above: 'MOVA score rises above',
  score_below: 'MOVA score falls below',
  score_moves: 'MOVA score moves by',
  price_change: 'Price moves by',
  volume_spike: 'Volume spikes by',
  liquidity_drop: 'Liquidity drops by',
  whale_activity: 'Whale trade larger than',
  dev_activity: 'Deployer wallet sells',
  risk_worsens: 'Risk level worsens',
  breakout: 'Breakout detected',
};

/**
 * Evaluate one rule against a token. Returns null when the rule does not fire.
 *
 * Conditions that need history return null when no previous snapshot exists —
 * a first observation is not a change, and inventing one would produce a wave
 * of false alerts the first time a token is seen.
 */
export function evaluateRule(
  rule: AlertRule,
  detail: TokenDetail,
  score: MovaScore,
  previous: TokenSnapshot | null,
): RuleMatch | null {
  if (!rule.enabled) return null;
  if (rule.scope.type === 'token' && rule.scope.address !== detail.ref.address) return null;

  const c = rule.condition;
  const symbol = detail.ref.symbol;

  switch (c.kind) {
    case 'score_above': {
      if (score.total == null || score.total <= c.value) return null;
      // Only fire on the crossing, not on every refresh while above.
      if (previous?.score != null && previous.score > c.value) return null;
      return {
        kind: 'score_change',
        severity: 'positive',
        title: 'MOVA score crossed higher',
        body: `${symbol} moved above ${c.value} and now scores ${score.total}.`,
      };
    }
    case 'score_below': {
      if (score.total == null || score.total >= c.value) return null;
      if (previous?.score != null && previous.score < c.value) return null;
      return {
        kind: 'score_change',
        severity: 'warning',
        title: 'MOVA score dropped',
        body: `${symbol} fell below ${c.value} and now scores ${score.total}.`,
      };
    }
    case 'score_moves': {
      if (score.total == null || previous?.score == null) return null;
      const delta = score.total - previous.score;
      if (Math.abs(delta) < c.value) return null;
      return {
        kind: 'score_change',
        severity: delta > 0 ? 'positive' : 'warning',
        title: `MOVA score ${delta > 0 ? 'up' : 'down'} ${Math.abs(Math.round(delta))} points`,
        body: `${symbol} moved from ${Math.round(previous.score)} to ${score.total}.`,
      };
    }
    case 'price_change': {
      const change =
        c.window === '5m' ? detail.market.change5m : c.window === '1h' ? detail.market.change1h : detail.market.change24h;
      if (!isNum(change) || Math.abs(change) < c.value) return null;
      return {
        kind: change > 0 ? 'momentum_spike' : 'breakout',
        severity: change > 0 ? 'positive' : 'warning',
        title: change > 0 ? 'Momentum spike' : 'Sharp drawdown',
        body: `${symbol} moved ${change > 0 ? '+' : ''}${change.toFixed(1)}% over ${c.window}.`,
      };
    }
    case 'volume_spike': {
      if (previous?.volume1hUsd == null || !isNum(detail.market.volume1hUsd)) return null;
      if (previous.volume1hUsd <= 0) return null;
      const multiple = detail.market.volume1hUsd / previous.volume1hUsd;
      if (multiple < c.value) return null;
      return {
        kind: 'volume_spike',
        severity: 'info',
        title: 'Unusual volume',
        body: `${symbol} hourly volume is ${multiple.toFixed(1)}x its previous reading.`,
      };
    }
    case 'liquidity_drop': {
      if (previous?.liquidityUsd == null || !isNum(detail.market.liquidityUsd)) return null;
      if (previous.liquidityUsd <= 0) return null;
      const dropPct = ((previous.liquidityUsd - detail.market.liquidityUsd) / previous.liquidityUsd) * 100;
      if (dropPct < c.value) return null;
      return {
        kind: 'liquidity_change',
        severity: 'critical',
        title: 'Liquidity removed',
        body: `${symbol} pool depth fell ${dropPct.toFixed(1)}% since the last check.`,
      };
    }
    case 'whale_activity': {
      const recent = detail.smartMoney.events.filter(
        (e) => (e.tag === 'whale' || e.tag === 'smart') && e.amountUsd >= c.value,
      );
      if (recent.length === 0) return null;
      const buys = recent.filter((e) => e.action === 'buy').length;
      const sells = recent.length - buys;
      return {
        kind: 'whale_accumulation',
        severity: buys >= sells ? 'positive' : 'warning',
        title: buys >= sells ? 'Whale accumulation' : 'Whale distribution',
        body: `${symbol} saw ${buys} large buy${buys === 1 ? '' : 's'} and ${sells} large sell${
          sells === 1 ? '' : 's'
        } above $${c.value.toLocaleString('en-US')}.`,
      };
    }
    case 'dev_activity': {
      const devSells = detail.smartMoney.events.filter((e) => e.tag === 'dev' && e.action === 'sell');
      if (devSells.length === 0) return null;
      const total = devSells.reduce((sum, e) => sum + e.amountUsd, 0);
      return {
        kind: 'dev_selling',
        severity: 'critical',
        title: 'Deployer wallet selling',
        body: `${symbol} deployer sold roughly $${Math.round(total).toLocaleString('en-US')} in recent transactions.`,
      };
    }
    case 'risk_worsens': {
      if (previous == null) return null;
      if (RISK_ORDER[score.risk] <= RISK_ORDER[previous.risk]) return null;
      return {
        kind: 'risk_change',
        severity: 'warning',
        title: 'Risk level worsened',
        body: `${symbol} moved from ${previous.risk} to ${score.risk} risk.`,
      };
    }
    case 'breakout': {
      // A breakout here means price and turnover rising together, which is the
      // combination that separates a real move from a thin-book wick.
      const turnover = ratio(detail.market.volume1hUsd, detail.market.liquidityUsd);
      const change = detail.market.change1h;
      if (!isNum(change) || change < 15 || turnover == null || turnover < 0.8) return null;
      return {
        kind: 'breakout',
        severity: 'positive',
        title: 'Breakout detected',
        body: `${symbol} is up ${change.toFixed(1)}% in an hour on ${turnover.toFixed(1)}x pool turnover.`,
      };
    }
    default:
      return null;
  }
}

/** Whether a rule is allowed to fire again for this token right now. */
export function isCoolingDown(rule: AlertRule, now: number = Date.now()): boolean {
  if (rule.lastTriggeredAt == null) return false;
  return now - rule.lastTriggeredAt < rule.cooldownMs;
}

export type ThresholdUnit = 'points' | 'percent' | 'multiple' | 'usd';

export interface ThresholdSpec {
  min: number;
  max: number;
  step: number;
  default: number;
  unit: ThresholdUnit;
}

export interface ConditionSpec {
  kind: AlertCondition['kind'];
  label: string;
  /** What the rule watches, in one plain-language line. */
  description: string;
  /** Null when the condition takes no threshold. */
  threshold: ThresholdSpec | null;
  /** Whether the condition needs a time window alongside its value. */
  hasWindow?: boolean;
}

/**
 * The rule builder's vocabulary.
 *
 * Bounds are here rather than in the screen so that "what is a sane threshold"
 * stays with the engine that evaluates it — a stepper that can reach values the
 * rule can never fire on is a bug the UI cannot see.
 */
export const CONDITION_SPECS: ConditionSpec[] = [
  {
    kind: 'score_moves',
    label: 'MOVA score moves',
    description: 'Fires when the score shifts by this many points in either direction.',
    threshold: { min: 5, max: 40, step: 5, default: 10, unit: 'points' },
  },
  {
    kind: 'score_above',
    label: 'Score rises above',
    description: 'Fires once, on the crossing — not repeatedly while the score stays high.',
    threshold: { min: 40, max: 95, step: 5, default: 80, unit: 'points' },
  },
  {
    kind: 'score_below',
    label: 'Score falls below',
    description: 'An early warning that the structure behind a token is deteriorating.',
    threshold: { min: 10, max: 80, step: 5, default: 40, unit: 'points' },
  },
  {
    kind: 'price_change',
    label: 'Price moves',
    description: 'Fires on a move of at least this size, up or down, in the chosen window.',
    threshold: { min: 5, max: 200, step: 5, default: 25, unit: 'percent' },
    hasWindow: true,
  },
  {
    kind: 'volume_spike',
    label: 'Volume spike',
    description: 'Hourly volume reaching this multiple of the previous reading.',
    threshold: { min: 2, max: 10, step: 1, default: 3, unit: 'multiple' },
  },
  {
    kind: 'liquidity_drop',
    label: 'Liquidity drops',
    description: 'Pool depth falling by this much since the last check — often the first sign of an exit.',
    threshold: { min: 10, max: 80, step: 5, default: 25, unit: 'percent' },
  },
  {
    kind: 'whale_activity',
    label: 'Large wallet trades',
    description: 'A tracked whale or profitable wallet trading above this size.',
    threshold: { min: 1_000, max: 100_000, step: 1_000, default: 10_000, unit: 'usd' },
  },
  {
    kind: 'dev_activity',
    label: 'Deployer sells',
    description: 'The wallet that created the token sells any of its holding.',
    threshold: null,
  },
  {
    kind: 'risk_worsens',
    label: 'Risk level worsens',
    description: 'The risk band moves up a step, for example moderate to elevated.',
    threshold: null,
  },
  {
    kind: 'breakout',
    label: 'Breakout detected',
    description: 'Price and pool turnover rising together, rather than a thin-book wick.',
    threshold: null,
  },
];

export function conditionSpec(kind: AlertCondition['kind']): ConditionSpec | null {
  return CONDITION_SPECS.find((spec) => spec.kind === kind) ?? null;
}

/**
 * Assemble a condition from the builder's inputs, clamping the threshold into
 * the range the engine can actually act on.
 */
export function buildCondition(
  kind: AlertCondition['kind'],
  value: number,
  window: '5m' | '1h' | '24h' = '1h',
): AlertCondition {
  const spec = conditionSpec(kind);
  const safe =
    spec?.threshold == null
      ? 0
      : Math.min(spec.threshold.max, Math.max(spec.threshold.min, isNum(value) ? value : spec.threshold.default));

  switch (kind) {
    case 'price_change':
      return { kind, value: safe, window };
    case 'dev_activity':
    case 'risk_worsens':
    case 'breakout':
      return { kind };
    default:
      return { kind, value: safe } as AlertCondition;
  }
}

export function describeRule(rule: AlertRule): string {
  const c = rule.condition;
  const scope =
    rule.scope.type === 'token' ? rule.scope.symbol : rule.scope.type === 'watchlist' ? 'Watchlist' : 'All tokens';
  switch (c.kind) {
    case 'score_above':
      return `${scope} · score above ${c.value}`;
    case 'score_below':
      return `${scope} · score below ${c.value}`;
    case 'score_moves':
      return `${scope} · score moves ${c.value}+ points`;
    case 'price_change':
      return `${scope} · price moves ${c.value}% in ${c.window}`;
    case 'volume_spike':
      return `${scope} · volume ${c.value}x previous hour`;
    case 'liquidity_drop':
      return `${scope} · liquidity drops ${c.value}%`;
    case 'whale_activity':
      return `${scope} · whale trade over $${c.value.toLocaleString('en-US')}`;
    case 'dev_activity':
      return `${scope} · deployer sells`;
    case 'risk_worsens':
      return `${scope} · risk level worsens`;
    case 'breakout':
      return `${scope} · breakout detected`;
    default:
      return scope;
  }
}
