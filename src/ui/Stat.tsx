import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { palette, radius, space } from '@/theme';
import { NO_DATA } from '@/core/format';
import { Text, type TextTone } from './Text';
import { tap } from './haptics';

export interface StatProps {
  label: string;
  value: string;
  tone?: TextTone;
  color?: string;
  /** Small caption under the value, e.g. a secondary comparison. */
  caption?: string;
  align?: 'left' | 'right' | 'center';
  style?: ViewStyle;
}

/**
 * Label-over-value pair. Values render with tabular figures, and a value of
 * "—" automatically drops to the muted tone so missing data never looks like a
 * measured zero.
 */
export function Stat({ label, value, tone, color, caption, align = 'left', style }: StatProps) {
  const missing = value === NO_DATA;
  return (
    <View style={[styles.stat, align === 'right' && styles.right, align === 'center' && styles.center, style]}>
      <Text variant="caption" tone="tertiary" numberOfLines={1}>
        {label}
      </Text>
      <Text
        variant="bodyMedium"
        tabular
        tone={missing ? 'tertiary' : (tone ?? 'primary')}
        color={missing ? undefined : color}
        numberOfLines={1}
        style={styles.value}
      >
        {value}
      </Text>
      {caption ? (
        <Text variant="caption" tone="tertiary" numberOfLines={1}>
          {caption}
        </Text>
      ) : null}
    </View>
  );
}

/** Evenly spaced row of stats inside a card. */
export function StatRow({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

/** A two-column grid of stats — used for the token metrics block. */
export function StatGrid({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.grid, style]}>{children}</View>;
}

export interface CheckRowProps {
  label: string;
  /** true = pass, false = fail, null = the provider could not tell us. */
  status: boolean | null;
  detail?: string;
  /** Overrides the pass/fail glyph — for values that are graded, not binary. */
  overrideIcon?: string;
  overrideColor?: string;
  onPress?: () => void;
}

/**
 * One line of the safety panel. An unknown result is visually distinct from a
 * failure: "we could not check this" and "this failed" are different findings.
 */
export function CheckRow({ label, status, detail, overrideIcon, overrideColor, onPress }: CheckRowProps) {
  const icon = overrideIcon ?? (status == null ? '?' : status ? '✓' : '✕');
  const color =
    overrideColor ?? (status == null ? palette.textTertiary : status ? palette.positive : palette.negative);
  const background =
    status == null ? palette.neutralDim : status ? palette.positiveDim : palette.negativeDim;

  const content = (
    <View style={styles.checkRow}>
      <View style={[styles.checkIcon, { backgroundColor: overrideColor ? `${overrideColor}22` : background }]}>
        <Text variant="labelSemi" color={color}>
          {icon}
        </Text>
      </View>
      <Text variant="bodyMedium" style={styles.checkLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text variant="label" color={color} tabular numberOfLines={1} style={styles.checkDetail}>
        {detail ?? (status == null ? 'Unknown' : status ? 'Pass' : 'Fail')}
      </Text>
    </View>
  );

  if (!onPress) return content;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${detail ?? (status == null ? 'unknown' : status ? 'pass' : 'fail')}`}
      onPress={() => {
        tap();
        onPress();
      }}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stat: {
    gap: 3,
    flex: 1,
    minWidth: 0,
  },
  right: {
    alignItems: 'flex-end',
  },
  center: {
    alignItems: 'center',
  },
  value: {
    marginTop: 1,
  },
  row: {
    flexDirection: 'row',
    gap: space.lg,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: space.lg,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
  },
  checkIcon: {
    width: 26,
    height: 26,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkLabel: {
    flex: 1,
  },
  checkDetail: {
    maxWidth: '45%',
    textAlign: 'right',
  },
});
