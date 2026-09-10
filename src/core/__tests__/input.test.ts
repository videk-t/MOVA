import { isPositiveInput, sanitizeDecimal, toInputText, toNumber } from '../input';

describe('sanitizeDecimal', () => {
  it('keeps a plain decimal untouched', () => {
    expect(sanitizeDecimal('12.34')).toBe('12.34');
  });

  it('strips letters, symbols and separators', () => {
    expect(sanitizeDecimal('$1,234.50 USD')).toBe('1234.50');
    expect(sanitizeDecimal('-42')).toBe('42');
  });

  it('keeps only the first decimal point', () => {
    expect(sanitizeDecimal('1.2.3.4')).toBe('1.234');
  });

  it('preserves a trailing point so the user can keep typing', () => {
    expect(sanitizeDecimal('0.')).toBe('0.');
  });

  it('preserves leading zeros mid-entry', () => {
    expect(sanitizeDecimal('0.0000')).toBe('0.0000');
  });

  it('handles empty and non-string input', () => {
    expect(sanitizeDecimal('')).toBe('');
    expect(sanitizeDecimal(undefined as unknown as string)).toBe('');
  });
});

describe('toNumber', () => {
  it('parses a normal value', () => {
    expect(toNumber('1250.75')).toBe(1250.75);
  });

  it('treats intermediate typing states as the fallback', () => {
    expect(toNumber('')).toBe(0);
    expect(toNumber('.')).toBe(0);
    expect(toNumber('   ')).toBe(0);
  });

  it('uses the supplied fallback', () => {
    expect(toNumber('', 5)).toBe(5);
    expect(toNumber('abc', -1)).toBe(-1);
  });

  it('never returns NaN or Infinity', () => {
    expect(toNumber('NaN')).toBe(0);
    expect(toNumber('Infinity')).toBe(0);
    expect(toNumber('1e999')).toBe(0);
  });

  it('parses very small prices without losing them', () => {
    expect(toNumber('0.000000124')).toBeCloseTo(0.000000124, 12);
  });
});

describe('isPositiveInput', () => {
  it('accepts positive amounts only', () => {
    expect(isPositiveInput('0.0001')).toBe(true);
    expect(isPositiveInput('0')).toBe(false);
    expect(isPositiveInput('')).toBe(false);
    expect(isPositiveInput('.')).toBe(false);
  });
});

describe('toInputText', () => {
  it('renders a value the field can edit', () => {
    expect(toInputText(1250.5)).toBe('1250.5');
    expect(toInputText(42)).toBe('42');
  });

  it('avoids exponential notation for tiny prices', () => {
    const text = toInputText(0.000000124);
    expect(text).not.toContain('e');
    expect(Number(text)).toBeCloseTo(0.000000124, 12);
  });

  it('returns an empty field for nothing to show', () => {
    expect(toInputText(null)).toBe('');
    expect(toInputText(undefined)).toBe('');
    expect(toInputText(0)).toBe('');
    expect(toInputText(Number.NaN)).toBe('');
  });

  it('round-trips through sanitize and parse', () => {
    for (const value of [1, 0.5, 1234.56, 0.000000124]) {
      expect(toNumber(sanitizeDecimal(toInputText(value)))).toBeCloseTo(value, 12);
    }
  });
});
