import { computeMovaScore, MIN_CONFIDENCE, compareByScore, tokenAgeHours } from '../scoring';
import { makeDetail, makeEmptyDetail } from './fixtures';

const HOUR = 3_600_000;

describe('computeMovaScore', () => {
  it('scores a healthy token highly and keeps every component in range', () => {
    const score = computeMovaScore(makeDetail());

    expect(score.total).not.toBeNull();
    expect(score.total!).toBeGreaterThan(65);
    expect(score.total!).toBeLessThanOrEqual(100);
    expect(score.components).toHaveLength(5);

    for (const component of score.components) {
      expect(component.score).not.toBeNull();
      expect(component.score!).toBeGreaterThanOrEqual(0);
      expect(component.score!).toBeLessThanOrEqual(100);
      expect(component.reasons.length).toBeGreaterThan(0);
      expect(component.summary.length).toBeGreaterThan(0);
    }
  });

  it('weights sum to 1 so the total is a true weighted mean', () => {
    const score = computeMovaScore(makeDetail());
    const totalWeight = score.components.reduce((sum, c) => sum + c.weight, 0);
    expect(totalWeight).toBeCloseTo(1, 6);
  });

  it('withholds the total rather than guessing when nothing is known', () => {
    const score = computeMovaScore(makeEmptyDetail());

    expect(score.total).toBeNull();
    expect(score.confidence).toBeLessThan(MIN_CONFIDENCE);
    expect(score.unavailableReason).toBeTruthy();
    // Risk defaults to the cautious side rather than to "low".
    expect(score.risk).toBe('elevated');
  });

  it('treats a missing component as unknown, not as zero', () => {
    const withSocial = computeMovaScore(makeDetail());
    const withoutSocial = computeMovaScore(
      makeDetail({
        social: {
          mentions24h: null,
          mentionsGrowthPct: null,
          uniqueAuthors24h: null,
          botLikelihoodPct: null,
          kolMentions24h: null,
        },
      }),
    );

    expect(withoutSocial.components.find((c) => c.key === 'social')!.score).toBeNull();
    expect(withoutSocial.confidence).toBeLessThan(withSocial.confidence);
    // Dropping a component must not drag the total toward zero.
    expect(withoutSocial.total!).toBeGreaterThan(60);
  });

  it('reports confidence proportional to how much data was present', () => {
    expect(computeMovaScore(makeDetail()).confidence).toBeCloseTo(1, 1);
  });

  describe('honeypot handling', () => {
    const honeypot = computeMovaScore(makeDetail({ security: { sellsSucceeding: false } }));

    it('zeroes safety regardless of every other passing check', () => {
      expect(honeypot.components.find((c) => c.key === 'safety')!.score).toBe(0);
    });

    it('forces high risk', () => {
      expect(honeypot.risk).toBe('high');
    });

    it('leads the explanation with the honeypot finding', () => {
      const safety = honeypot.components.find((c) => c.key === 'safety')!;
      expect(safety.reasons[0]).toMatch(/honeypot/i);
    });
  });

  it('forces high risk while mint authority is still live, however good the rest is', () => {
    const score = computeMovaScore(makeDetail({ security: { mintAuthorityRevoked: false } }));
    expect(score.risk).toBe('high');
  });

  it('separates risk from score — momentum cannot make a token safe', () => {
    const risky = computeMovaScore(
      makeDetail({
        market: { change1h: 90, change24h: 400, volume1hUsd: 500_000, liquidityUsd: 9_000 },
        security: { top10HolderPct: 68, lpBurnedPct: 0, lpLocked: false, devHoldingPct: 19 },
      }),
    );

    expect(risky.components.find((c) => c.key === 'momentum')!.score!).toBeGreaterThan(40);
    expect(risky.risk === 'high' || risky.risk === 'elevated').toBe(true);
  });

  it('penalises a draining pool', () => {
    const stable = computeMovaScore(makeDetail({ security: { liquidityChange24hPct: 10 } }));
    const draining = computeMovaScore(makeDetail({ security: { liquidityChange24hPct: -60 } }));

    const stableLiq = stable.components.find((c) => c.key === 'liquidity')!.score!;
    const drainingLiq = draining.components.find((c) => c.key === 'liquidity')!.score!;
    expect(drainingLiq).toBeLessThan(stableLiq);
  });

  it('caps safety for a pool that is only hours old', () => {
    const young = computeMovaScore(makeDetail({ market: { createdAt: Date.now() - 2 * HOUR } }));
    expect(young.components.find((c) => c.key === 'safety')!.score!).toBeLessThanOrEqual(72);
  });

  it('does not reward extreme turnover as though it were healthy volume', () => {
    const healthy = computeMovaScore(makeDetail({ market: { volume1hUsd: 105_000, liquidityUsd: 150_000 } }));
    const frantic = computeMovaScore(makeDetail({ market: { volume1hUsd: 3_000_000, liquidityUsd: 150_000 } }));

    const healthyMomentum = healthy.components.find((c) => c.key === 'momentum')!.score!;
    const franticMomentum = frantic.components.find((c) => c.key === 'momentum')!.score!;
    expect(franticMomentum).toBeLessThan(healthyMomentum);
  });

  it('flags coordinated social activity in the summary rather than rewarding the volume', () => {
    const score = computeMovaScore(
      makeDetail({ social: { authenticity: 'coordinated', botLikelihoodPct: 82, mentionsGrowthPct: 500 } }),
    );
    const social = score.components.find((c) => c.key === 'social')!;
    expect(social.summary).toMatch(/coordinated/i);
  });

  describe('extreme and malformed values', () => {
    const cases: { name: string; detail: ReturnType<typeof makeDetail> }[] = [
      {
        name: 'infinite market cap',
        detail: makeDetail({ market: { marketCapUsd: Number.POSITIVE_INFINITY } }),
      },
      { name: 'NaN liquidity', detail: makeDetail({ market: { liquidityUsd: Number.NaN } }) },
      { name: 'negative price change', detail: makeDetail({ market: { change1h: -99.9, change24h: -100 } }) },
      { name: 'zero liquidity', detail: makeDetail({ market: { liquidityUsd: 0 } }) },
      { name: 'zero transactions', detail: makeDetail({ market: { txns1h: { buys: 0, sells: 0 } } }) },
      {
        name: 'percentages beyond 100',
        detail: makeDetail({ security: { top10HolderPct: 9_999, devHoldingPct: 1e9 } }),
      },
      { name: 'future creation date', detail: makeDetail({ market: { createdAt: Date.now() + 1e10 } }) },
      { name: 'astronomically large cap', detail: makeDetail({ market: { marketCapUsd: 1e30 } }) },
    ];

    it.each(cases)('survives $name without producing NaN', ({ detail }) => {
      const score = computeMovaScore(detail);

      if (score.total != null) {
        expect(Number.isFinite(score.total)).toBe(true);
        expect(score.total).toBeGreaterThanOrEqual(0);
        expect(score.total).toBeLessThanOrEqual(100);
      }
      for (const component of score.components) {
        if (component.score != null) {
          expect(Number.isFinite(component.score)).toBe(true);
          expect(component.score).toBeGreaterThanOrEqual(0);
          expect(component.score).toBeLessThanOrEqual(100);
        }
      }
      expect(['low', 'moderate', 'elevated', 'high']).toContain(score.risk);
    });
  });

  it('is deterministic for identical input', () => {
    const detail = makeDetail();
    expect(computeMovaScore(detail).total).toBe(computeMovaScore(detail).total);
  });
});

describe('tokenAgeHours', () => {
  it('measures age in hours', () => {
    const now = 1_700_000_000_000;
    expect(tokenAgeHours({ ...makeDetail().market, createdAt: now - 5 * HOUR }, now)).toBeCloseTo(5, 5);
  });

  it('returns null for a missing or future timestamp', () => {
    const now = 1_700_000_000_000;
    expect(tokenAgeHours({ ...makeDetail().market, createdAt: null }, now)).toBeNull();
    expect(tokenAgeHours({ ...makeDetail().market, createdAt: now + HOUR }, now)).toBeNull();
  });
});

describe('compareByScore', () => {
  it('sorts high to low and sinks unknown scores', () => {
    const sorted = [40, null, 90, null, 70].sort(compareByScore);
    expect(sorted).toEqual([90, 70, 40, null, null]);
  });
});
