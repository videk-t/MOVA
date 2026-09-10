import { useEffect } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import type { ScoreComponent } from '@/core/scoring';
import { palette, radius, scoreColor, space } from '@/theme';
import { formatScore } from '@/core/format';
import { Text } from './Text';
import { tap } from './haptics';

export interface ScoreBarProps {
  component: ScoreComponent;
  onPress?: () => void;
  /** Stagger index, so the bars fill in sequence rather than all at once. */
  index?: number;
}

/**
 * One component of the MOVA score.
 *
 * Every bar is tappable and opens the explanation for that component — the
 * score is only useful if a user can find out what produced it.
 */
export function ScoreBar({ component, onPress, index = 0 }: ScoreBarProps) {
  const width = useSharedValue(0);
  const target = component.score == null ? 0 : Math.max(0, Math.min(100, component.score));

  useEffect(() => {
    width.value = withDelay(
      index * 70,
      withTiming(target, { duration: 720, easing: Easing.out(Easing.cubic) }),
    );
  }, [target, index, width]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${width.value}%` }));
  const color = component.score == null ? palette.textTertiary : scoreColor(component.score);

  const body = (
    <View style={styles.row}>
      <View style={styles.head}>
        <Text variant="label" accessibilityElementsHidden>
          {component.icon}
        </Text>
        <Text variant="bodyMedium" style={styles.label} numberOfLines={1}>
          {component.label}
        </Text>
        <Text variant="bodyMedium" tabular color={color}>
          {formatScore(component.score)}
        </Text>
        {onPress ? (
          <Text variant="label" tone="tertiary" style={styles.chevron}>
            ›
          </Text>
        ) : null}
      </View>

      <View style={styles.track}>
        <Animated.View style={[styles.fill, { backgroundColor: color }, fillStyle]} />
      </View>

      {component.score == null ? (
        <Text variant="caption" tone="tertiary">
          Data unavailable
        </Text>
      ) : null}
    </View>
  );

  if (!onPress) return body;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        component.score == null
          ? `${component.label}: data unavailable. Tap to read why.`
          : `${component.label}: ${Math.round(component.score)} out of 100. Tap for an explanation.`
      }
      onPress={() => {
        tap();
        onPress();
      }}
      style={styles.pressable}
    >
      {body}
    </Pressable>
  );
}

export function ScoreBars({
  components,
  onSelect,
  style,
}: {
  components: ScoreComponent[];
  onSelect?: (component: ScoreComponent) => void;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.list, style]}>
      {components.map((component, i) => (
        <ScoreBar
          key={component.key}
          component={component}
          index={i}
          onPress={onSelect ? () => onSelect(component) : undefined}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: space.lg,
  },
  pressable: {
    borderRadius: radius.sm,
  },
  row: {
    gap: space.sm,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  label: {
    flex: 1,
  },
  chevron: {
    marginLeft: 2,
  },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: palette.surfaceHigh,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 3,
  },
});
