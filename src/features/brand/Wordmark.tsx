import { StyleSheet, View, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { palette, space } from '@/theme';
import { Text } from '@/ui/Text';

/**
 * MOVA wordmark.
 *
 * The mark is an upward-stepping chevron built from the same geometry as the
 * "M" — a signal reading left to right. Drawn as vectors so it stays crisp at
 * any size and needs no asset pipeline.
 */
export function MovaMark({ size = 26 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" accessibilityLabel="MOVA">
      <Defs>
        <LinearGradient id="movaMark" x1="0" y1="1" x2="1" y2="0">
          <Stop offset="0" stopColor={palette.brand} />
          <Stop offset="1" stopColor="#5BD6C0" />
        </LinearGradient>
      </Defs>
      <Path
        d="M4 24.5L11 13.5L16.5 20L27 5.5"
        stroke="url(#movaMark)"
        strokeWidth={3.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Path d="M20.5 5.5H27V12" stroke="url(#movaMark)" strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

export function MovaWordmark({ size = 24, style }: { size?: number; style?: ViewStyle }) {
  return (
    <View style={[styles.row, style]} accessibilityRole="header" accessibilityLabel="MOVA">
      <MovaMark size={size * 1.1} />
      <Text
        style={{
          fontSize: size,
          lineHeight: size * 1.15,
          letterSpacing: size * 0.06,
          fontWeight: '800',
          color: palette.text,
        }}
      >
        MOVA
      </Text>
    </View>
  );
}

/** Full lockup with the expansion, used on the profile and onboarding screens. */
export function MovaLockup() {
  return (
    <View style={styles.lockup}>
      <MovaWordmark size={30} />
      <Text variant="caption" tone="tertiary">
        Meme Opportunity & Value Analytics
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  lockup: {
    alignItems: 'center',
    gap: space.sm,
  },
});
