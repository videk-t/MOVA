import { useCallback } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { palette, radius, space } from '@/theme';
import { Text } from './Text';
import { select } from './haptics';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  style?: ViewStyle;
  /** Fills the available width, splitting it evenly. */
  stretch?: boolean;
  accessibilityLabel?: string;
}

/** Compact selector for timeframes, sort keys and modes. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  style,
  stretch = true,
  accessibilityLabel,
}: SegmentedProps<T>) {
  const handle = useCallback(
    (next: T) => {
      if (next === value) return;
      select();
      onChange(next);
    },
    [onChange, value],
  );

  return (
    <View style={[styles.track, style]} accessibilityRole="tablist" accessibilityLabel={accessibilityLabel}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={option.label}
            onPress={() => handle(option.value)}
            style={[styles.segment, stretch && styles.stretch]}
          >
            {active ? (
              <Animated.View entering={FadeIn.duration(120)} style={styles.activeBackground} />
            ) : null}
            <Text variant="labelSemi" tone={active ? 'primary' : 'tertiary'} numberOfLines={1}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export interface ChipOption<T extends string> {
  value: T;
  label: string;
  emoji?: string;
}

export interface ChipRowProps<T extends string> {
  options: ChipOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  style?: ViewStyle;
  contentStyle?: ViewStyle;
}

/** Horizontally scrolling chips — used for Discover presets. */
export function ChipRow<T extends string>({ options, value, onChange, style, contentStyle }: ChipRowProps<T>) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={style}
      contentContainerStyle={[styles.chipRow, contentStyle]}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={option.label}
            onPress={() => {
              select();
              onChange(option.value);
            }}
            style={[styles.chip, active && styles.chipActive]}
          >
            {option.emoji ? (
              <Text variant="label" accessibilityElementsHidden>
                {option.emoji}
              </Text>
            ) : null}
            <Text variant="labelSemi" tone={active ? 'primary' : 'secondary'}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: palette.bgElevated,
    borderRadius: radius.md,
    padding: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  segment: {
    paddingVertical: 8,
    paddingHorizontal: space.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  stretch: {
    flex: 1,
  },
  activeBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: palette.surfaceHigh,
    borderRadius: radius.sm,
  },
  chipRow: {
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.xs,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.md,
    paddingVertical: 9,
    borderRadius: radius.pill,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  chipActive: {
    backgroundColor: palette.brandDim,
    borderColor: palette.brand,
  },
});
