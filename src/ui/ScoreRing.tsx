import { useEffect } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { palette, scoreBand, scoreColor } from '@/theme';
import { Text } from './Text';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export interface ScoreRingProps {
  /** 0-100, or null when the model withheld a score. */
  score: number | null;
  size?: number;
  strokeWidth?: number;
  /** Shows the band word ("Strong") under the number. */
  showBand?: boolean;
  label?: string;
  style?: ViewStyle;
}

/**
 * The MOVA score, rendered as a ring that fills to the value.
 *
 * When the score is null the ring stays empty and reads "—". A partially filled
 * ring would imply a measurement that was never made.
 */
export function ScoreRing({
  score,
  size = 132,
  strokeWidth = 10,
  showBand = true,
  label,
  style,
}: ScoreRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(score == null ? 0 : Math.max(0, Math.min(100, score)) / 100, {
      duration: 900,
      easing: Easing.out(Easing.cubic),
    });
  }, [score, progress]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }));

  const color = score == null ? palette.textTertiary : scoreColor(score);

  return (
    <View style={[styles.container, { width: size, height: size }, style]}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="scoreRing" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity="0.65" />
            <Stop offset="1" stopColor={color} stopOpacity="1" />
          </LinearGradient>
        </Defs>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={palette.surfaceHigh}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="url(#scoreRing)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          animatedProps={animatedProps}
          // Start the arc at 12 o'clock rather than 3 o'clock.
          transform={`rotate(-90, ${size / 2}, ${size / 2})`}
        />
      </Svg>

      <View style={styles.readout} accessibilityRole="text" accessibilityLabel={accessibleLabel(score, label)}>
        {label ? (
          <Text variant="overline" tone="tertiary">
            {label}
          </Text>
        ) : null}
        <View style={styles.valueRow}>
          <Text
            tabular
            color={color}
            style={{ fontSize: size * 0.3, lineHeight: size * 0.34, fontWeight: '800' }}
          >
            {score == null ? '—' : Math.round(score)}
          </Text>
          {score != null ? (
            <Text variant="caption" tone="tertiary" style={styles.outOf}>
              /100
            </Text>
          ) : null}
        </View>
        {showBand ? (
          <Text variant="labelSemi" color={color}>
            {score == null ? 'No score' : scoreBand(score)}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function accessibleLabel(score: number | null, label?: string): string {
  const prefix = label ?? 'MOVA score';
  if (score == null) return `${prefix}: not available, too little data`;
  return `${prefix}: ${Math.round(score)} out of 100, ${scoreBand(score)}`;
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  readout: {
    alignItems: 'center',
    gap: 2,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  outOf: {
    marginBottom: 3,
  },
});
