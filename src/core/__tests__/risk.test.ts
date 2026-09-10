import { calculateRisk } from '../risk';

describe('calculateRisk', () => {
  it('sizes a long position from the distance to the stop', () => {
    // Risking 2% of $10,000 is $200. A 20% stop distance means the position can
    // be $1,000, because 20% of $1,000 is exactly the $200 at risk.
    const result = calculateRisk({ portfolioUsd: 10_000, riskPct: 2, entryPrice: 1, stopPrice: 0.8 });

    expect(result.ok).toBe(true);
    expect(result.riskAmountUsd).toBe(200);
    expect(result.positionSizeUsd).toBe(1_000);
    expect(result.positionUnits).toBeCloseTo(1_000, 6);
    expect(result.stopDistancePct).toBe(20);
    expect(result.potentialLossUsd).toBeCloseTo(200, 6);
    expect(result.portfolioExposurePct).toBe(10);
    expect(result.direction).toBe('long');
  });

  it('computes reward and the risk/reward ratio from a target', () => {
    const result = calculateRisk({
      portfolioUsd: 10_000,
      riskPct: 2,
      entryPrice: 1,
      stopPrice: 0.8,
      targetPrice: 1.6,
    });

    expect(result.potentialProfitUsd).toBeCloseTo(600, 6);
    expect(result.riskRewardRatio).toBe(3);
  });

  it('handles a short setup where the stop sits above entry', () => {
    const result = calculateRisk({
      portfolioUsd: 5_000,
      riskPct: 1,
      entryPrice: 100,
      stopPrice: 110,
      targetPrice: 80,
    });

    expect(result.direction).toBe('short');
    expect(result.riskAmountUsd).toBe(50);
    expect(result.potentialProfitUsd).toBeCloseTo(100, 6);
    expect(result.riskRewardRatio).toBe(2);
  });

  it('caps the position at the portfolio instead of implying leverage', () => {
    // A 0.1% stop would need a $2M position to risk $200 of a $10k account.
    const result = calculateRisk({ portfolioUsd: 10_000, riskPct: 2, entryPrice: 1, stopPrice: 0.999 });

    expect(result.ok).toBe(true);
    expect(result.positionSizeUsd).toBe(10_000);
    expect(result.portfolioExposurePct).toBe(100);
    expect(result.potentialLossUsd).toBeLessThan(result.riskAmountUsd);
    expect(result.warnings.join(' ')).toMatch(/capped/i);
  });

  it('warns when reward is smaller than risk', () => {
    const result = calculateRisk({
      portfolioUsd: 10_000,
      riskPct: 1,
      entryPrice: 1,
      stopPrice: 0.5,
      targetPrice: 1.2,
    });

    expect(result.riskRewardRatio).toBeLessThan(1);
    expect(result.warnings.join(' ')).toMatch(/1:1|below/i);
  });

  it('warns when a target would book a loss', () => {
    const result = calculateRisk({
      portfolioUsd: 10_000,
      riskPct: 1,
      entryPrice: 1,
      stopPrice: 0.8,
      targetPrice: 0.9,
    });

    expect(result.potentialProfitUsd!).toBeLessThan(0);
    expect(result.warnings.join(' ')).toMatch(/loss even when it works/i);
  });

  it('warns about aggressive risk per trade', () => {
    const result = calculateRisk({ portfolioUsd: 10_000, riskPct: 25, entryPrice: 1, stopPrice: 0.5 });
    expect(result.warnings.join(' ')).toMatch(/aggressive/i);
  });

  describe('invalid input', () => {
    const cases: [string, Parameters<typeof calculateRisk>[0]][] = [
      ['zero portfolio', { portfolioUsd: 0, riskPct: 2, entryPrice: 1, stopPrice: 0.8 }],
      ['negative portfolio', { portfolioUsd: -100, riskPct: 2, entryPrice: 1, stopPrice: 0.8 }],
      ['zero risk', { portfolioUsd: 1_000, riskPct: 0, entryPrice: 1, stopPrice: 0.8 }],
      ['risk over 100%', { portfolioUsd: 1_000, riskPct: 140, entryPrice: 1, stopPrice: 0.8 }],
      ['zero entry', { portfolioUsd: 1_000, riskPct: 2, entryPrice: 0, stopPrice: 0.8 }],
      ['stop equal to entry', { portfolioUsd: 1_000, riskPct: 2, entryPrice: 1, stopPrice: 1 }],
      ['NaN entry', { portfolioUsd: 1_000, riskPct: 2, entryPrice: Number.NaN, stopPrice: 0.8 }],
      [
        'infinite portfolio',
        { portfolioUsd: Number.POSITIVE_INFINITY, riskPct: 2, entryPrice: 1, stopPrice: 0.8 },
      ],
    ];

    it.each(cases)('rejects %s with a readable message', (_name, input) => {
      const result = calculateRisk(input);
      expect(result.ok).toBe(false);
      expect(result.error).toBeTruthy();
      expect(result.positionSizeUsd).toBe(0);
    });
  });

  it('never returns NaN for sub-cent memecoin prices', () => {
    const result = calculateRisk({
      portfolioUsd: 2_500,
      riskPct: 1.5,
      entryPrice: 0.00000124,
      stopPrice: 0.00000098,
      targetPrice: 0.0000031,
    });

    expect(result.ok).toBe(true);
    for (const value of [
      result.riskAmountUsd,
      result.positionSizeUsd,
      result.positionUnits,
      result.potentialLossUsd,
      result.potentialProfitUsd!,
      result.riskRewardRatio!,
    ]) {
      expect(Number.isFinite(value)).toBe(true);
    }
    expect(result.positionUnits).toBeGreaterThan(0);
  });
});
