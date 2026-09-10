import { computeMovaScore, MIN_SAFETY_COVERAGE_FOR_LOW_RISK } from '../scoring';
import { makeDetail, emptySecurity } from './fixtures';

/**
 * Risk verdicts and how much was actually checked.
 *
 * Found by pointing the app at the live backend: a seven-hour-old token whose
 * holder distribution, pool status and deployer were all unreadable still came
 * back "Low risk", because the two authority checks that *could* run both
 * passed. Passing the readable checks is not evidence about the unreadable
 * ones, and "low risk" is the strongest reassurance MOVA gives.
 */

const HOUR = 3_600_000;

describe('risk requires evidence, not just absence of bad news', () => {
  it('will not call a token low-risk on authority checks alone', () => {
    const thin = makeDetail({
      security: {
        ...emptySecurity,
        // The only two facts a throttled RPC reliably returns.
        mintAuthorityRevoked: true,
        freezeAuthorityRevoked: true,
      },
      market: { createdAt: Date.now() - 400 * HOUR, liquidityUsd: 900_000, marketCapUsd: 4_000_000 },
    });

    const score = computeMovaScore(thin);
    const safety = score.components.find((c) => c.key === 'safety');

    expect(safety?.score).toBe(100);
    expect(safety?.coverage ?? 1).toBeLessThan(MIN_SAFETY_COVERAGE_FOR_LOW_RISK);
    expect(score.risk).toBe('moderate');
  });

  it('still awards low risk when the safety checks actually ran', () => {
    // The clean fixture has every security field populated.
    const score = computeMovaScore(makeDetail());
    const safety = score.components.find((c) => c.key === 'safety');

    expect(safety?.coverage ?? 0).toBeGreaterThanOrEqual(MIN_SAFETY_COVERAGE_FOR_LOW_RISK);
    expect(score.risk).toBe('low');
  });

  it('does not downgrade a verdict that was never low to begin with', () => {
    const weak = makeDetail({
      security: { ...emptySecurity, mintAuthorityRevoked: true, top10HolderPct: 62 },
      market: { liquidityUsd: 4_000, marketCapUsd: 9_000_000 },
    });

    // Holding a poor verdict at moderate would be an upgrade, not a caution.
    expect(['elevated', 'high']).toContain(computeMovaScore(weak).risk);
  });

  it('keeps hard overrides ahead of the coverage rule', () => {
    const honeypot = makeDetail({ security: { sellsSucceeding: false } });
    expect(computeMovaScore(honeypot).risk).toBe('high');

    const mintable = makeDetail({ security: { mintAuthorityRevoked: false } });
    expect(computeMovaScore(mintable).risk).toBe('high');
  });

  it('stays elevated when almost nothing is known', () => {
    const blind = makeDetail({ security: { ...emptySecurity }, market: { liquidityUsd: null, marketCapUsd: null } });
    expect(computeMovaScore(blind).risk).toBe('elevated');
  });
});
