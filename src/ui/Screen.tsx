import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { palette, space, TAB_BAR_HEIGHT } from '@/theme';
import { Text } from './Text';
import { tap } from './haptics';

export interface ScreenProps {
  children: ReactNode;
  /** Adds bottom padding to clear the floating tab bar. */
  withTabBar?: boolean;
  style?: ViewStyle;
}

/** Root container for every screen: dark canvas plus safe-area handling. */
export function Screen({ children, withTabBar = false, style }: ScreenProps) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.screen,
        { paddingTop: insets.top },
        withTabBar ? { paddingBottom: 0 } : { paddingBottom: insets.bottom },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Bottom padding that clears the floating tab bar inside a scroll view. */
export function useTabBarPadding(): number {
  const insets = useSafeAreaInsets();
  return TAB_BAR_HEIGHT + insets.bottom + space.xl;
}

export interface HeaderProps {
  title: string;
  subtitle?: string;
  /** Shows a back affordance. Defaults to true on pushed routes. */
  onBack?: () => void;
  right?: ReactNode;
  large?: boolean;
  style?: ViewStyle;
}

export function Header({ title, subtitle, onBack, right, large = false, style }: HeaderProps) {
  return (
    <View style={[styles.header, style]}>
      {onBack ? (
        <Pressable
          onPress={() => {
            tap();
            onBack();
          }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={12}
          style={styles.back}
        >
          <Text variant="h3" tone="secondary">
            ‹
          </Text>
        </Pressable>
      ) : null}

      <View style={styles.headerText}>
        <Text variant={large ? 'h1' : 'h3'} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" tone="tertiary" numberOfLines={1} style={styles.headerSubtitle}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {right ? <View style={styles.headerRight}>{right}</View> : null}
    </View>
  );
}

/** Header for pushed routes; wires the back button to the router. */
export function PushedHeader(props: Omit<HeaderProps, 'onBack'> & { onBack?: () => void }) {
  const router = useRouter();
  return (
    <Header
      {...props}
      onBack={
        props.onBack ??
        (() => {
          if (router.canGoBack()) router.back();
          else router.replace('/');
        })
      }
    />
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.xl,
    paddingTop: space.sm,
    paddingBottom: space.md,
  },
  back: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  headerText: {
    flex: 1,
  },
  headerSubtitle: {
    marginTop: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
});
