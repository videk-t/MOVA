import { StyleSheet, View, type ViewStyle } from 'react-native';
import type { DataOrigin, RiskLevel } from '@/core/types';
import { palette, radius, riskColor, riskDim, scoreBand, scoreColor, scoreTint, space } from '@/theme';
import { formatScore } from '@/core/format';
import { Text } from './Text';

export type BadgeTone = 'neutral' | 'brand' | 'positive' | 'negative' | 'warning' | 'info';

const TONE_BG: Record<BadgeTone, string> = {
  neutral: palette.neutralDim,
  brand: palette.brandDim,
  positive: palette.positiveDim,
  negative: palette.negativeDim,
  warning: palette.warningDim,
  info: palette.infoDim,
};

const TONE_FG: Record<BadgeTone, string> = {
  neutral: palette.textSecondary,
  brand: palette.brandBright,
  positive: palette.positive,
  negative: palette.negative,
  warning: palette.warning,
  info: palette.info,
};

export interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  /** Explicit colours win over `tone`, for score-driven shades. */
  color?: string;
  background?: string;
  size?: 'sm' | 'md';
  style?: ViewStyle;
}

export function Badge({ label, tone = 'neutral', color, background, size = 'md', style }: BadgeProps) {
  return (
    <View
      style={[
        styles.badge,
        size === 'sm' ? styles.sm : styles.md,
        { backgroundColor: background ?? TONE_BG[tone] },
        style,
      ]}
    >
      <Text variant={size === 'sm' ? 'caption' : 'labelSemi'} color={color ?? TONE_FG[tone]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** Risk level pill. Colour and wording always agree. */
export function RiskBadge({ risk, size = 'sm' }: { risk: RiskLevel; size?: 'sm' | 'md' }) {
  const labels: Record<RiskLevel, string> = {
    low: 'Low risk',
    moderate: 'Moderate',
    elevated: 'Elevated',
    high: 'High risk',
  };
  return <Badge label={labels[risk]} color={riskColor[risk]} background={riskDim[risk]} size={size} />;
}

/** Compact score chip used on token rows. */
export function ScoreBadge({ score, size = 'sm' }: { score: number | null; size?: 'sm' | 'md' }) {
  if (score == null) {
    return <Badge label="No score" tone="neutral" size={size} />;
  }
  return (
    <Badge
      label={`${formatScore(score)} · ${scoreBand(score)}`}
      color={scoreColor(score)}
      background={scoreTint(score)}
      size={size}
    />
  );
}

/**
 * Origin marker. MOVA never shows generated numbers without saying so, and this
 * badge is the mechanism — it renders wherever demo data reaches a screen.
 */
export function OriginBadge({ origin, style }: { origin: DataOrigin; style?: ViewStyle }) {
  if (origin === 'live') {
    return <Badge label="LIVE DATA" tone="positive" size="sm" style={style} />;
  }
  return (
    <Badge
      label="DEMO DATA"
      color={palette.warning}
      background={palette.warningDim}
      size="sm"
      style={style}
    />
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
    justifyContent: 'center',
  },
  sm: {
    paddingHorizontal: space.sm,
    paddingVertical: 3,
  },
  md: {
    paddingHorizontal: space.md,
    paddingVertical: 5,
  },
});
