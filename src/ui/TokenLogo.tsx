import { useState } from 'react';
import { Image, StyleSheet, View, type ViewStyle } from 'react-native';
import { palette, radius } from '@/theme';
import { Text } from './Text';

/** Muted, readable fills for the initials fallback. No neon. */
const FALLBACK_COLORS = [
  ['#2A2440', '#A78BFA'],
  ['#12303A', '#5BD6C0'],
  ['#33261A', '#F0A868'],
  ['#1F2C42', '#7DA7F5'],
  ['#331E28', '#F08CA8'],
  ['#1E3326', '#7BD99A'],
  ['#2E2A18', '#DCC26A'],
] as const;

function paletteFor(symbol: string): readonly [string, string] {
  let hash = 0;
  for (let i = 0; i < symbol.length; i += 1) hash = (hash * 31 + symbol.charCodeAt(i)) >>> 0;
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length] ?? FALLBACK_COLORS[0];
}

function initialsFor(symbol: string): string {
  const cleaned = symbol.replace(/[^A-Za-z0-9]/g, '');
  return (cleaned.length > 0 ? cleaned : symbol).slice(0, 2).toUpperCase();
}

export interface TokenLogoProps {
  uri: string | null;
  symbol: string;
  size?: number;
  style?: ViewStyle;
}

/**
 * Token images come from third-party metadata: the URL is often missing, often
 * dead, and occasionally not an image at all. The initials fallback is the
 * normal case rather than the exception, so it is designed rather than tacked on.
 */
export function TokenLogo({ uri, symbol, size = 44, style }: TokenLogoProps) {
  // Remember *which* URL failed rather than a boolean. A recycled row showing a
  // different token then retries on its own, with no effect to reset the flag.
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const failed = uri != null && failedUri === uri;

  const [background, foreground] = paletteFor(symbol);
  const dimensions = { width: size, height: size, borderRadius: size * 0.32 };

  if (uri == null || failed) {
    return (
      <View
        style={[styles.base, dimensions, { backgroundColor: background }, style]}
        accessibilityLabel={`${symbol} logo`}
      >
        <Text variant="labelSemi" color={foreground} style={{ fontSize: size * 0.34, lineHeight: size * 0.42 }}>
          {initialsFor(symbol)}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.base, dimensions, styles.imageWrap, style]}>
      <Image
        source={{ uri }}
        style={dimensions}
        onError={() => setFailedUri(uri)}
        accessibilityLabel={`${symbol} logo`}
        resizeMode="cover"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  imageWrap: {
    backgroundColor: palette.surfaceHigh,
    borderRadius: radius.md,
  },
});
