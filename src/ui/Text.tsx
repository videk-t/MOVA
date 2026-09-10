import { StyleSheet, Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';
import { palette, type as typeScale, numeric } from '@/theme';

export type TextVariant = keyof typeof typeScale;
export type TextTone = 'primary' | 'secondary' | 'tertiary' | 'brand' | 'positive' | 'negative' | 'warning' | 'inverse';

const TONE_COLORS: Record<TextTone, string> = {
  primary: palette.text,
  secondary: palette.textSecondary,
  tertiary: palette.textTertiary,
  brand: palette.brandBright,
  positive: palette.positive,
  negative: palette.negative,
  warning: palette.warning,
  inverse: palette.textInverse,
};

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  tone?: TextTone;
  /** Use tabular figures so changing numbers do not shift layout. */
  tabular?: boolean;
  color?: string;
  center?: boolean;
}

/**
 * The only text primitive in the app. Going through one component keeps the
 * type scale honest and guarantees every string picks up a deliberate colour
 * rather than inheriting the platform default.
 */
export function Text({
  variant = 'body',
  tone = 'primary',
  tabular = false,
  color,
  center = false,
  style,
  ...rest
}: TextProps) {
  const base = typeScale[variant] as TextStyle;
  return (
    <RNText
      {...rest}
      style={[
        base,
        { color: color ?? TONE_COLORS[tone] },
        tabular && numeric,
        center && styles.center,
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
});
