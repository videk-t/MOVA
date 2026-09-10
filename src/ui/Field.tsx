import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Switch,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { palette, radius, space, type as typeScale } from '@/theme';
import { Text } from './Text';
import { select } from './haptics';

export interface TextFieldProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  /** Prefix rendered inside the field, e.g. "$". */
  prefix?: string;
  suffix?: string;
  hint?: string;
  error?: string | null;
  multiline?: boolean;
  style?: ViewStyle;
  autoFocus?: boolean;
  maxLength?: number;
}

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  prefix,
  suffix,
  hint,
  error,
  multiline = false,
  style,
  autoFocus = false,
  maxLength,
}: TextFieldProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.field, style]}>
      <Text variant="label" tone="secondary">
        {label}
      </Text>
      <View
        style={[
          styles.inputWrap,
          focused && styles.inputFocused,
          error ? styles.inputError : null,
          multiline && styles.inputMultiline,
        ]}
      >
        {prefix ? (
          <Text variant="bodyMedium" tone="tertiary">
            {prefix}
          </Text>
        ) : null}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={palette.textTertiary}
          keyboardType={keyboardType}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          multiline={multiline}
          autoFocus={autoFocus}
          maxLength={maxLength}
          accessibilityLabel={label}
          style={[styles.input, multiline && styles.inputMultilineText]}
          selectionColor={palette.brandBright}
        />
        {suffix ? (
          <Text variant="bodyMedium" tone="tertiary">
            {suffix}
          </Text>
        ) : null}
      </View>
      {error ? (
        <Text variant="caption" tone="negative">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" tone="tertiary">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

export interface ToggleRowProps {
  label: string;
  description?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  style?: ViewStyle;
}

export function ToggleRow({ label, description, value, onChange, style }: ToggleRowProps) {
  return (
    <View style={[styles.toggleRow, style]}>
      <View style={styles.toggleText}>
        <Text variant="bodyMedium">{label}</Text>
        {description ? (
          <Text variant="caption" tone="tertiary" style={styles.toggleDescription}>
            {description}
          </Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={(next) => {
          select();
          onChange(next);
        }}
        accessibilityLabel={label}
        trackColor={{ false: palette.surfaceHigh, true: palette.brand }}
        thumbColor="#FFFFFF"
        ios_backgroundColor={palette.surfaceHigh}
      />
    </View>
  );
}

export interface StepperProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  format?: (value: number) => string;
  style?: ViewStyle;
}

/**
 * Discrete stepper. Preferred over a slider for threshold values, because an
 * alert set to "82.37" is not something anyone meant to configure.
 */
export function Stepper({ label, value, onChange, min, max, step, format, style }: StepperProps) {
  const clamp = (next: number) => Math.min(max, Math.max(min, Math.round(next / step) * step));
  const display = format ? format(value) : String(value);

  return (
    <View style={[styles.field, style]}>
      <Text variant="label" tone="secondary">
        {label}
      </Text>
      <View style={styles.stepper}>
        <StepButton
          symbol="−"
          label={`Decrease ${label}`}
          disabled={value <= min}
          onPress={() => onChange(clamp(value - step))}
        />
        <Text variant="h3" tabular style={styles.stepperValue}>
          {display}
        </Text>
        <StepButton
          symbol="+"
          label={`Increase ${label}`}
          disabled={value >= max}
          onPress={() => onChange(clamp(value + step))}
        />
      </View>
    </View>
  );
}

function StepButton({
  symbol,
  label,
  onPress,
  disabled,
}: {
  symbol: string;
  label: string;
  onPress: () => void;
  disabled: boolean;
}) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPressIn={() => {
          scale.value = withTiming(0.9, { duration: 90 });
        }}
        onPressOut={() => {
          scale.value = withTiming(1, { duration: 120 });
        }}
        onPress={() => {
          select();
          onPress();
        }}
        style={[styles.stepButton, disabled && styles.stepButtonDisabled]}
      >
        <Text variant="h3" tone={disabled ? 'tertiary' : 'primary'}>
          {symbol}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: space.sm,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 50,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  inputFocused: {
    borderColor: palette.brand,
    backgroundColor: palette.surfaceAlt,
  },
  inputError: {
    borderColor: palette.negative,
  },
  inputMultiline: {
    minHeight: 104,
    alignItems: 'flex-start',
    paddingVertical: space.md,
  },
  input: {
    flex: 1,
    color: palette.text,
    ...typeScale.bodyMedium,
    paddingVertical: 0,
  },
  inputMultilineText: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.lg,
    paddingVertical: space.md,
  },
  toggleText: {
    flex: 1,
  },
  toggleDescription: {
    marginTop: 3,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 54,
    paddingHorizontal: space.sm,
    borderRadius: radius.md,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  stepperValue: {
    flex: 1,
    textAlign: 'center',
  },
  stepButton: {
    width: 42,
    height: 42,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surfaceHigh,
  },
  stepButtonDisabled: {
    opacity: 0.4,
  },
});
