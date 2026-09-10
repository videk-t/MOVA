/**
 * MOVA colour system.
 *
 * Design intent: a near-black, slightly cool canvas so that numbers and state
 * colours carry all of the visual weight. One brand accent (indigo), one
 * positive, one negative, one warning. No neon, no gradients-for-gradients-sake.
 */
export const palette = {
  // Canvas + surfaces
  bg: '#07080C',
  bgElevated: '#0C0E14',
  surface: '#12141C',
  surfaceAlt: '#171A24',
  surfaceHigh: '#1E212D',
  scrim: 'rgba(4, 5, 8, 0.72)',

  // Hairlines
  border: 'rgba(255, 255, 255, 0.07)',
  borderStrong: 'rgba(255, 255, 255, 0.13)',

  // Text
  text: '#F3F5F9',
  textSecondary: '#98A0B3',
  textTertiary: '#606879',
  textInverse: '#07080C',

  // Brand
  brand: '#6E56F8',
  brandBright: '#8B77FF',
  brandDim: 'rgba(110, 86, 248, 0.16)',

  // State
  positive: '#2ED47A',
  positiveDim: 'rgba(46, 212, 122, 0.14)',
  negative: '#FF4D6A',
  negativeDim: 'rgba(255, 77, 106, 0.14)',
  warning: '#FFB020',
  warningDim: 'rgba(255, 176, 32, 0.14)',
  info: '#3DA5F5',
  infoDim: 'rgba(61, 165, 245, 0.14)',
  neutralDim: 'rgba(255, 255, 255, 0.06)',
} as const;

export type RiskLevel = 'low' | 'moderate' | 'elevated' | 'high';

export const riskColor: Record<RiskLevel, string> = {
  low: palette.positive,
  moderate: palette.info,
  elevated: palette.warning,
  high: palette.negative,
};

export const riskDim: Record<RiskLevel, string> = {
  low: palette.positiveDim,
  moderate: palette.infoDim,
  elevated: palette.warningDim,
  high: palette.negativeDim,
};

export const riskLabel: Record<RiskLevel, string> = {
  low: 'Low risk',
  moderate: 'Moderate risk',
  elevated: 'Elevated risk',
  high: 'High risk',
};

/** Colour for a 0-100 MOVA score or sub-score. */
export function scoreColor(score: number): string {
  if (!Number.isFinite(score)) return palette.textTertiary;
  if (score >= 80) return palette.positive;
  if (score >= 60) return '#5BD6C0';
  if (score >= 40) return palette.warning;
  return palette.negative;
}

export function scoreTint(score: number): string {
  if (!Number.isFinite(score)) return palette.neutralDim;
  if (score >= 80) return palette.positiveDim;
  if (score >= 60) return 'rgba(91, 214, 192, 0.14)';
  if (score >= 40) return palette.warningDim;
  return palette.negativeDim;
}

/** Short human band for a score, used in badges. */
export function scoreBand(score: number): string {
  if (!Number.isFinite(score)) return 'No data';
  if (score >= 80) return 'Strong';
  if (score >= 60) return 'Solid';
  if (score >= 40) return 'Mixed';
  return 'Weak';
}

/** Colour for a signed change value. */
export function deltaColor(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value === 0) return palette.textSecondary;
  return value > 0 ? palette.positive : palette.negative;
}
