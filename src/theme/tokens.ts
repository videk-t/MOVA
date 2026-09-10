import { Platform } from 'react-native';

/** 4pt base spacing scale. */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 44,
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 26,
  pill: 999,
} as const;

export const font = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  black: 'Inter_800ExtraBold',
} as const;

/**
 * Type scale. `numeric` variants opt into tabular figures so that changing
 * prices do not cause horizontal jitter.
 */
export const type = {
  display: { fontFamily: font.black, fontSize: 34, lineHeight: 38, letterSpacing: -0.8 },
  h1: { fontFamily: font.bold, fontSize: 27, lineHeight: 32, letterSpacing: -0.6 },
  h2: { fontFamily: font.semibold, fontSize: 21, lineHeight: 26, letterSpacing: -0.35 },
  h3: { fontFamily: font.semibold, fontSize: 17, lineHeight: 22, letterSpacing: -0.2 },
  body: { fontFamily: font.regular, fontSize: 15, lineHeight: 21 },
  bodyMedium: { fontFamily: font.medium, fontSize: 15, lineHeight: 21 },
  label: { fontFamily: font.medium, fontSize: 13, lineHeight: 17 },
  labelSemi: { fontFamily: font.semibold, fontSize: 13, lineHeight: 17 },
  caption: { fontFamily: font.medium, fontSize: 11, lineHeight: 14 },
  overline: {
    fontFamily: font.semibold,
    fontSize: 10.5,
    lineHeight: 13,
    letterSpacing: 1.1,
    textTransform: 'uppercase' as const,
  },
} as const;

export const numeric = { fontVariant: ['tabular-nums' as const] };

export const shadow = {
  card: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOpacity: 0.4,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
    },
    android: { elevation: 6 },
    default: {},
  }),
  sheet: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOpacity: 0.55,
      shadowRadius: 28,
      shadowOffset: { width: 0, height: -6 },
    },
    android: { elevation: 20 },
    default: {},
  }),
} as const;

export const motion = {
  fast: 140,
  base: 240,
  slow: 420,
} as const;

/** Height of the custom floating tab bar, excluding safe-area inset. */
export const TAB_BAR_HEIGHT = 62;
