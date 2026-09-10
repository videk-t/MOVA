import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { palette, radius, space } from '@/theme';
import { Text } from './Text';
import { commit, tap } from './haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  /** Rendered before the label — an emoji or a small view. */
  icon?: ReactNode;
  fullWidth?: boolean;
  style?: ViewStyle;
  accessibilityHint?: string;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  icon,
  fullWidth = false,
  style,
  accessibilityHint,
}: ButtonProps) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const inactive = disabled || loading;

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPressIn={() => {
        scale.value = withSpring(0.96, { damping: 22, stiffness: 380 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 22, stiffness: 380 });
      }}
      onPress={() => {
        if (variant === 'primary' || variant === 'danger') commit();
        else tap();
        onPress();
      }}
      style={[
        styles.base,
        SIZES[size],
        VARIANTS[variant],
        fullWidth && styles.fullWidth,
        inactive && styles.inactive,
        animatedStyle,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={variant === 'primary' ? palette.textInverse : palette.text} />
      ) : (
        <View style={styles.content}>
          {icon}
          <Text
            variant={size === 'sm' ? 'labelSemi' : 'bodyMedium'}
            color={LABEL_COLORS[variant]}
            numberOfLines={1}
          >
            {label}
          </Text>
        </View>
      )}
    </AnimatedPressable>
  );
}

const VARIANTS: Record<ButtonVariant, ViewStyle> = {
  primary: { backgroundColor: palette.brand },
  secondary: {
    backgroundColor: palette.surfaceHigh,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.borderStrong,
  },
  ghost: { backgroundColor: 'transparent' },
  danger: { backgroundColor: palette.negativeDim, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.negative },
};

const LABEL_COLORS: Record<ButtonVariant, string> = {
  primary: '#FFFFFF',
  secondary: palette.text,
  ghost: palette.textSecondary,
  danger: palette.negative,
};

const SIZES: Record<ButtonSize, ViewStyle> = {
  sm: { height: 34, paddingHorizontal: space.md, borderRadius: radius.sm },
  md: { height: 46, paddingHorizontal: space.lg, borderRadius: radius.md },
  lg: { height: 54, paddingHorizontal: space.xl, borderRadius: radius.md },
};

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  inactive: {
    opacity: 0.45,
  },
});
