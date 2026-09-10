import {
  buildCondition,
  conditionSpec,
  CONDITION_SPECS,
  describeRule,
  evaluateRule,
  isCoolingDown,
  type AlertCondition,
  type AlertRule,
  type AlertScope,
  type TokenSnapshot,
} from '../alert-rules';
import { computeMovaScore } from '../scoring';
import { makeDetail } from './fixtures';

function rule(condition: AlertCondition, overrides: Partial<AlertRule> = {}): AlertRule {
  return {
    id: 'r1',
    label: 'test rule',
    scope: { type: 'watchlist' },
    condition,
    enabled: true,
    createdAt: 0,
    lastTriggeredAt: null,
    cooldownMs: 30 * 60_000,
    ...overrides,
  };
}

function snapshot(overrides: Partial<TokenSnapshot> = {}): TokenSnapshot {
  return {
    score: 70,
    risk: 'moderate',
    liquidityUsd: 150_000,
    volume1hUsd: 90_000,
    priceUsd: 0.0000124,
    at: 0,
    ...overrides,
  };
}

describe('evaluateRule', () => {
  it('never fires a disabled rule', () => {
    const detail = makeDetail();
    const score = computeMovaScore(detail);
    expect(evaluateRule(rule({ kind: 'breakout' }, { enabled: false }), detail, score, null)).toBeNull();
  });

  it('ignores a token-scoped rule pointed at a different token', () => {
    const detail = makeDetail();
    const score = computeMovaScore(detail);
    const scope: AlertScope = { type: 'token', address: 'somewhere-else', symbol: 'XYZ' };
    expect(evaluateRule(rule({ kind: 'breakout' }, { scope }), detail, score, null)).toBeNull();
  });

  describe('score thresholds', () => {
    it('fires when the score first crosses above', () => {
      const detail = makeDetail();
      const score = computeMovaScore(detail);
      const threshold = (score.total ?? 100) - 5;

      const match = evaluateRule(rule({ kind: 'score_above', value: threshold }), detail, score, null);
      expect(match?.kind).toBe('score_change');
      expect(match?.severity).toBe('positive');
    });

    it('does not fire again while the score stays above', () => {
      const detail = makeDetail();
      const score = computeMovaScore(detail);
      const threshold = (score.total ?? 100) - 5;
      const previous = snapshot({ score: (score.total ?? 100) - 1 });

      expect(evaluateRule(rule({ kind: 'score_above', value: threshold }), detail, score, previous)).toBeNull();
    });

    it('withholds threshold rules when the score is unavailable', () => {
      const detail = makeDetail();
      const score = { ...computeMovaScore(detail), total: null };
      expect(evaluateRule(rule({ kind: 'score_above', value: 10 }), detail, score, null)).toBeNull();
      expect(evaluateRule(rule({ kind: 'score_below', value: 90 }), detail, score, null)).toBeNull();
    });

    it('needs a previous observation before it can report a move', () => {
      const detail = makeDetail();
      const score = computeMovaScore(detail);
      expect(evaluateRule(rule({ kind: 'score_moves', value: 5 }), detail, score, null)).toBeNull();
    });

    it('reports the direction and size of a score move', () => {
      const detail = makeDetail();
      const score = computeMovaScore(detail);
      const previous = snapshot({ score: (score.total ?? 0) - 20 });

      const match = evaluateRule(rule({ kind: 'score_moves', value: 10 }), detail, score, previous);
      expect(match?.severity).toBe('positive');
      expect(match?.title).toContain('up');
    });

    it('stays quiet for a move smaller than the threshold', () => {
      const detail = makeDetail();
      const score = computeMovaScore(detail);
      const previous = snapshot({ score: (score.total ?? 0) - 2 });
      expect(evaluateRule(rule({ kind: 'score_moves', value: 10 }), detail, score, previous)).toBeNull();
    });
  });

  describe('market conditions', () => {
    it('fires on a large price move in the chosen window', () => {
      const detail = makeDetail({ market: { change1h: 42 } });
      const score = computeMovaScore(detail);

      const match = evaluateRule(
        rule({ kind: 'price_change', value: 25, window: '1h' }),
        detail,
        score,
        null,
      );
      expect(match?.kind).toBe('momentum_spike');
      expect(match?.body).toContain('42.0%');
    });

    it('treats a large drop as a warning, not a spike', () => {
      const detail = makeDetail({ market: { change24h: -60 } });
      const score = computeMovaScore(detail);

      const match = evaluateRule(
        rule({ kind: 'price_change', value: 25, window: '24h' }),
        detail,
        score,
        null,
      );
      expect(match?.severity).toBe('warning');
    });

    it('ignores a missing price change rather than treating it as zero', () => {
      const detail = makeDetail({ market: { change5m: null } });
      const score = computeMovaScore(detail);
      expect(
        evaluateRule(rule({ kind: 'price_change', value: 1, window: '5m' }), detail, score, null),
      ).toBeNull();
    });

    it('measures a volume spike against the previous reading', () => {
      const detail = makeDetail({ market: { volume1hUsd: 400_000 } });
      const score = computeMovaScore(detail);
      const previous = snapshot({ volume1hUsd: 100_000 });

      const match = evaluateRule(rule({ kind: 'volume_spike', value: 3 }), detail, score, previous);
      expect(match?.kind).toBe('volume_spike');
      expect(match?.body).toContain('4.0x');
    });

    it('cannot divide by a previous volume of zero', () => {
      const detail = makeDetail({ market: { volume1hUsd: 400_000 } });
      const score = computeMovaScore(detail);
      const previous = snapshot({ volume1hUsd: 0 });
      expect(evaluateRule(rule({ kind: 'volume_spike', value: 3 }), detail, score, previous)).toBeNull();
    });

    it('flags a liquidity drop as critical', () => {
      const detail = makeDetail({ market: { liquidityUsd: 60_000 } });
      const score = computeMovaScore(detail);
      const previous = snapshot({ liquidityUsd: 100_000 });

      const match = evaluateRule(rule({ kind: 'liquidity_drop', value: 25 }), detail, score, previous);
      expect(match?.severity).toBe('critical');
      expect(match?.body).toContain('40.0%');
    });

    it('does not treat rising liquidity as a drop', () => {
      const detail = makeDetail({ market: { liquidityUsd: 200_000 } });
      const score = computeMovaScore(detail);
      const previous = snapshot({ liquidityUsd: 100_000 });
      expect(evaluateRule(rule({ kind: 'liquidity_drop', value: 25 }), detail, score, previous)).toBeNull();
    });

    it('requires price and turnover together for a breakout', () => {
      const score1 = computeMovaScore(makeDetail());
      // Price is up, but the pool is barely turning over.
      const quiet = makeDetail({ market: { change1h: 40, volume1hUsd: 1_000, liquidityUsd: 500_000 } });
      expect(evaluateRule(rule({ kind: 'breakout' }), quiet, score1, null)).toBeNull();

      const real = makeDetail({ market: { change1h: 40, volume1hUsd: 500_000, liquidityUsd: 200_000 } });
      const match = evaluateRule(rule({ kind: 'breakout' }), real, computeMovaScore(real), null);
      expect(match?.kind).toBe('breakout');
    });
  });

  describe('wallet conditions', () => {
    it('summarises large wallet trades above the threshold', () => {
      const detail = makeDetail({
        smartMoney: {
          events: [
            { id: '1', address: 'w1', label: null, tag: 'whale', action: 'buy', amountUsd: 50_000, at: 0, wallet30dPnlUsd: null },
            { id: '2', address: 'w2', label: null, tag: 'smart', action: 'buy', amountUsd: 20_000, at: 0, wallet30dPnlUsd: null },
            { id: '3', address: 'w3', label: null, tag: 'whale', action: 'sell', amountUsd: 12_000, at: 0, wallet30dPnlUsd: null },
          ],
        },
      });
      const match = evaluateRule(
        rule({ kind: 'whale_activity', value: 10_000 }),
        detail,
        computeMovaScore(detail),
        null,
      );
      expect(match?.title).toBe('Whale accumulation');
      expect(match?.body).toContain('2 large buys');
    });

    it('ignores trades below the threshold and untagged wallets', () => {
      const detail = makeDetail({
        smartMoney: {
          events: [
            { id: '1', address: 'w1', label: null, tag: 'whale', action: 'buy', amountUsd: 500, at: 0, wallet30dPnlUsd: null },
            { id: '2', address: 'w2', label: null, tag: 'unknown', action: 'buy', amountUsd: 90_000, at: 0, wallet30dPnlUsd: null },
          ],
        },
      });
      expect(
        evaluateRule(rule({ kind: 'whale_activity', value: 10_000 }), detail, computeMovaScore(detail), null),
      ).toBeNull();
    });

    it('fires on any deployer sell', () => {
      const detail = makeDetail({
        smartMoney: {
          events: [
            { id: '1', address: 'dev', label: 'Deployer', tag: 'dev', action: 'sell', amountUsd: 8_000, at: 0, wallet30dPnlUsd: null },
          ],
        },
      });
      const match = evaluateRule(rule({ kind: 'dev_activity' }), detail, computeMovaScore(detail), null);
      expect(match?.severity).toBe('critical');
    });

    it('does not fire on a deployer buy', () => {
      const detail = makeDetail({
        smartMoney: {
          events: [
            { id: '1', address: 'dev', label: 'Deployer', tag: 'dev', action: 'buy', amountUsd: 8_000, at: 0, wallet30dPnlUsd: null },
          ],
        },
      });
      expect(evaluateRule(rule({ kind: 'dev_activity' }), detail, computeMovaScore(detail), null)).toBeNull();
    });
  });

  describe('risk_worsens', () => {
    it('fires only when risk moves up a band', () => {
      const detail = makeDetail();
      const score = { ...computeMovaScore(detail), risk: 'high' as const };

      expect(evaluateRule(rule({ kind: 'risk_worsens' }), detail, score, snapshot({ risk: 'low' }))).not.toBeNull();
      expect(evaluateRule(rule({ kind: 'risk_worsens' }), detail, score, snapshot({ risk: 'high' }))).toBeNull();
    });

    it('needs a previous observation', () => {
      const detail = makeDetail();
      const score = computeMovaScore(detail);
      expect(evaluateRule(rule({ kind: 'risk_worsens' }), detail, score, null)).toBeNull();
    });

    it('does not fire when risk improves', () => {
      const detail = makeDetail();
      const score = { ...computeMovaScore(detail), risk: 'low' as const };
      expect(evaluateRule(rule({ kind: 'risk_worsens' }), detail, score, snapshot({ risk: 'high' }))).toBeNull();
    });
  });
});

describe('isCoolingDown', () => {
  it('is false for a rule that has never fired', () => {
    expect(isCoolingDown(rule({ kind: 'breakout' }), 10_000)).toBe(false);
  });

  it('blocks a repeat inside the cooldown and allows one after it', () => {
    const r = rule({ kind: 'breakout' }, { lastTriggeredAt: 0, cooldownMs: 1_000 });
    expect(isCoolingDown(r, 500)).toBe(true);
    expect(isCoolingDown(r, 1_500)).toBe(false);
  });
});

describe('buildCondition', () => {
  it('clamps a threshold into the range the engine can act on', () => {
    const spec = conditionSpec('score_moves');
    const high = buildCondition('score_moves', 9_999);
    const low = buildCondition('score_moves', -50);

    expect(high).toEqual({ kind: 'score_moves', value: spec?.threshold?.max });
    expect(low).toEqual({ kind: 'score_moves', value: spec?.threshold?.min });
  });

  it('falls back to the default for a non-finite value', () => {
    const spec = conditionSpec('liquidity_drop');
    expect(buildCondition('liquidity_drop', Number.NaN)).toEqual({
      kind: 'liquidity_drop',
      value: spec?.threshold?.default,
    });
  });

  it('carries the window for price conditions', () => {
    expect(buildCondition('price_change', 30, '5m')).toEqual({ kind: 'price_change', value: 30, window: '5m' });
  });

  it('omits the value for conditions that take none', () => {
    expect(buildCondition('dev_activity', 50)).toEqual({ kind: 'dev_activity' });
    expect(buildCondition('breakout', 50)).toEqual({ kind: 'breakout' });
    expect(buildCondition('risk_worsens', 50)).toEqual({ kind: 'risk_worsens' });
  });

  it('produces a condition the engine understands for every listed spec', () => {
    const detail = makeDetail();
    const score = computeMovaScore(detail);

    for (const spec of CONDITION_SPECS) {
      const condition = buildCondition(spec.kind, spec.threshold?.default ?? 0);
      // The assertion is that nothing throws and the shape is evaluable.
      expect(() => evaluateRule(rule(condition), detail, score, snapshot())).not.toThrow();
      expect(describeRule(rule(condition))).toContain('Watchlist');
    }
  });
});
