import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { palette, radius, shadow, space } from '@/theme';
import { Text } from './Text';
import { tap } from './haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface CardProps {
  children: ReactNode;
  /** Accepts the full RN style shape so callers can pass conditional arrays. */
  style?: StyleProp<ViewStyle>;
  /** Slightly lighter surface, for cards sitting on top of other cards. */
  elevated?: boolean;
  padded?: boolean;
}

export function Card({ children, style, elevated = false, padded = true }: CardProps) {
  return (
    <View
      style={[
        styles.card,
        elevated ? styles.elevated : null,
        padded ? styles.padded : null,
        shadow.card as ViewStyle,
        style,
      ]}
    >
      {children}
    </View>
  );
}

export interface PressableCardProps extends CardProps {
  onPress: () => void;
  onLongPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  disabled?: boolean;
}

/**
 * A card that responds to touch. The press scale is deliberately small — the
 * feedback should read as the surface accepting the touch, not as an animation.
 */
export function PressableCard({
  children,
  style,
  elevated = false,
  padded = true,
  onPress,
  onLongPress,
  accessibilityLabel,
  accessibilityHint,
  disabled = false,
}: PressableCardProps) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPressIn={() => {
        scale.value = withSpring(0.975, { damping: 24, stiffness: 340 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 24, stiffness: 340 });
      }}
      onPress={() => {
        tap();
        onPress();
      }}
      onLongPress={onLongPress}
      style={[
        styles.card,
        elevated ? styles.elevated : null,
        padded ? styles.padded : null,
        shadow.card as ViewStyle,
        disabled ? styles.disabled : null,
        animatedStyle,
        style,
      ]}
    >
      {children}
    </AnimatedPressable>
  );
}

export interface SectionProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  style?: ViewStyle;
}

/** A titled block. Used for every major grouping on Home and Token Detail. */
export function Section({ title, subtitle, action, children, style }: SectionProps) {
  return (
    <View style={[styles.section, style]}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeadings}>
          <Text variant="h3">{title}</Text>
          {subtitle ? (
            <Text variant="caption" tone="tertiary" style={styles.sectionSubtitle}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {action}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    overflow: 'hidden',
  },
  elevated: {
    backgroundColor: palette.surfaceAlt,
    borderColor: palette.borderStrong,
  },
  padded: {
    padding: space.lg,
  },
  disabled: {
    opacity: 0.5,
  },
  section: {
    marginBottom: space['2xl'],
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: space.md,
    paddingHorizontal: space.xs,
    gap: space.md,
  },
  sectionHeadings: {
    flex: 1,
  },
  sectionSubtitle: {
    marginTop: 3,
  },
});
