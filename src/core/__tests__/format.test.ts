import {
  formatAge,
  formatCompactNumber,
  formatPct,
  formatPrice,
  formatRelativeTime,
  formatScore,
  formatUsd,
  formatUsdCompact,
  NO_DATA,
  shortenAddress,
} from '../format';

describe('formatUsdCompact', () => {
  it('compacts across magnitudes', () => {
    expect(formatUsdCompact(1_240_000)).toBe('$1.24M');
    expect(formatUsdCompact(856_000)).toBe('$856K');
    expect(formatUsdCompact(4_200_000_000)).toBe('$4.20B');
    expect(formatUsdCompact(1.5e12)).toBe('$1.50T');
    expect(formatUsdCompact(42)).toBe('$42');
    expect(formatUsdCompact(4.2)).toBe('$4.20');
  });

  it('keeps the sign for negatives', () => {
    expect(formatUsdCompact(-1_240_000)).toBe('-$1.24M');
  });

  it('never prints NaN', () => {
    expect(formatUsdCompact(null)).toBe(NO_DATA);
    expect(formatUsdCompact(undefined)).toBe(NO_DATA);
    expect(formatUsdCompact(Number.NaN)).toBe(NO_DATA);
    expect(formatUsdCompact(Number.POSITIVE_INFINITY)).toBe(NO_DATA);
  });
});

describe('formatPrice', () => {
  it('keeps significant digits at memecoin scale', () => {
    expect(formatPrice(1234.5)).toBe('$1,234.5');
    expect(formatPrice(1.2367)).toBe('$1.237');
    expect(formatPrice(0.01234)).toBe('$0.01234');
  });

  it('compresses leading zeros below a thousandth', () => {
    // 0.0000004821 → four leading zeros after the point.
    expect(formatPrice(0.0000004821)).toMatch(/^\$0\.0₆/);
    expect(formatPrice(0.000012)).toMatch(/^\$0\.0₄/);
  });

  it('handles zero and missing values', () => {
    expect(formatPrice(0)).toBe('$0');
    expect(formatPrice(null)).toBe(NO_DATA);
    expect(formatPrice(Number.NaN)).toBe(NO_DATA);
  });
});

describe('formatPct', () => {
  it('signs the value', () => {
    expect(formatPct(47.2)).toBe('+47.2%');
    expect(formatPct(-8.4)).toBe('-8.4%');
    expect(formatPct(0)).toBe('0.0%');
  });

  it('returns a dash for missing data', () => {
    expect(formatPct(null)).toBe(NO_DATA);
  });
});

describe('formatCompactNumber', () => {
  it('compacts counts', () => {
    expect(formatCompactNumber(4_820)).toBe('4.82K');
    expect(formatCompactNumber(1_200_000)).toBe('1.20M');
    expect(formatCompactNumber(42)).toBe('42');
    expect(formatCompactNumber(null)).toBe(NO_DATA);
  });
});

describe('formatUsd', () => {
  it('prints cents', () => {
    expect(formatUsd(1234.5)).toBe('$1,234.50');
    expect(formatUsd(-50)).toBe('-$50.00');
    expect(formatUsd(null)).toBe(NO_DATA);
  });
});

describe('formatRelativeTime', () => {
  const now = 1_700_000_000_000;

  it('describes recency', () => {
    expect(formatRelativeTime(now - 30_000, now)).toBe('just now');
    expect(formatRelativeTime(now - 4 * 60_000, now)).toBe('4m ago');
    expect(formatRelativeTime(now - 3 * 3_600_000, now)).toBe('3h ago');
    expect(formatRelativeTime(now - 2 * 86_400_000, now)).toBe('2d ago');
    expect(formatRelativeTime(now - 60 * 86_400_000, now)).toBe('2mo ago');
  });

  it('clamps future timestamps to "just now" rather than negatives', () => {
    expect(formatRelativeTime(now + 60_000, now)).toBe('just now');
  });
});

describe('formatAge', () => {
  it('scales the unit to the value', () => {
    expect(formatAge(0.5)).toBe('30m');
    expect(formatAge(3)).toBe('3h');
    expect(formatAge(50)).toBe('2d 2h');
    expect(formatAge(500)).toBe('20d');
    expect(formatAge(null)).toBe(NO_DATA);
    expect(formatAge(-4)).toBe(NO_DATA);
  });
});

describe('shortenAddress', () => {
  it('middle-truncates long addresses', () => {
    expect(shortenAddress('7xKXtg2CW3xM8mQvKzYbNpRdFhJnLsWuVaBcDeFgHi9')).toBe('7xKX…gHi9');
  });

  it('leaves short strings alone and handles nulls', () => {
    expect(shortenAddress('abc')).toBe('abc');
    expect(shortenAddress(null)).toBe(NO_DATA);
    expect(shortenAddress('')).toBe(NO_DATA);
  });
});

describe('formatScore', () => {
  it('rounds to an integer and withholds nulls', () => {
    expect(formatScore(87.4)).toBe('87');
    expect(formatScore(null)).toBe(NO_DATA);
    expect(formatScore(Number.NaN)).toBe(NO_DATA);
  });
});
