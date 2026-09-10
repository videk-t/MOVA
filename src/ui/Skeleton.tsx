import { useEffect } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { palette, radius, space } from '@/theme';

/**
 * Loading placeholders that match the shape of the content they stand in for.
 * A skeleton that is the wrong size is worse than a spinner, because the layout
 * jumps the moment real data lands.
 */

export interface SkeletonProps {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: ViewStyle;
}

export function Skeleton({ width = '100%', height = 14, radius: r = 6, style }: SkeletonProps) {
  const pulse = useSharedValue(0.4);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(0.85, { duration: 900, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [pulse]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <Animated.View
      accessibilityRole="progressbar"
      accessibilityLabel="Loading"
      style={[{ width, height, borderRadius: r, backgroundColor: palette.surfaceHigh }, animatedStyle, style]}
    />
  );
}

/** Placeholder matching the token row used across Home, Discover and Watchlist. */
export function TokenRowSkeleton() {
  return (
    <View style={styles.row}>
      <Skeleton width={44} height={44} radius={14} />
      <View style={styles.rowBody}>
        <Skeleton width="45%" height={15} />
        <Skeleton width="65%" height={11} style={styles.gap} />
      </View>
      <View style={styles.rowRight}>
        <Skeleton width={64} height={15} />
        <Skeleton width={44} height={11} style={styles.gap} />
      </View>
    </View>
  );
}

export function TokenListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <View style={styles.list}>
      {Array.from({ length: count }, (_, i) => (
        <TokenRowSkeleton key={i} />
      ))}
    </View>
  );
}

export function CardSkeleton({ height = 120 }: { height?: number }) {
  return <Skeleton width="100%" height={height} radius={radius.lg} />;
}

const styles = StyleSheet.create({
  list: {
    gap: space.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  rowBody: {
    flex: 1,
  },
  rowRight: {
    alignItems: 'flex-end',
  },
  gap: {
    marginTop: space.sm,
  },
});
