import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { palette, radius, space, TAB_BAR_HEIGHT } from '@/theme';
import { Text } from '@/ui/Text';
import { tap } from '@/ui/haptics';
import { useUnreadAlertCount } from '@/store/alerts';

/**
 * Structural props for a tab bar.
 *
 * Typed against what this component actually reads rather than imported from
 * the navigator's internals, so an upstream refactor of those internals cannot
 * break the build over a type MOVA only uses five fields of.
 */
export interface TabBarProps {
  state: { index: number; routes: { key: string; name: string; params?: object }[] };
  descriptors: Record<string, { options: { title?: string } }>;
  navigation: {
    emit: (event: { type: 'tabPress'; target: string; canPreventDefault: true }) => { defaultPrevented: boolean };
    navigate: (name: string, params?: object) => void;
  };
}

/**
 * Floating tab bar.
 *
 * Sits above the content on a blurred pill rather than as an opaque bar, so
 * lists read as continuing underneath it. Five destinations is the practical
 * ceiling for reachable, labelled tabs on a phone.
 */
export function TabBar({ state, descriptors, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const unread = useUnreadAlertCount();

  return (
    <View style={[styles.wrapper, { paddingBottom: Math.max(insets.bottom, space.md) }]} pointerEvents="box-none">
      <BlurView intensity={40} tint="dark" style={styles.bar}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key] ?? { options: {} };
          const label = (options.title ?? route.name) as string;
          const focused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (focused || event.defaultPrevented) return;
            tap();
            navigation.navigate(route.name, route.params);
          };

          return (
            <TabButton
              key={route.key}
              label={label}
              routeName={route.name}
              focused={focused}
              badge={route.name === 'alerts' && unread > 0 ? unread : 0}
              onPress={onPress}
            />
          );
        })}
      </BlurView>
    </View>
  );
}

function TabButton({
  label,
  routeName,
  focused,
  badge,
  onPress,
}: {
  label: string;
  routeName: string;
  focused: boolean;
  badge: number;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const color = focused ? palette.text : palette.textTertiary;

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={badge > 0 ? `${label}, ${badge} unread` : label}
      onPressIn={() => {
        scale.value = withSpring(0.9, { damping: 20, stiffness: 400 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 20, stiffness: 400 });
      }}
      onPress={onPress}
      style={styles.tab}
      hitSlop={6}
    >
      <Animated.View style={[styles.tabInner, animatedStyle]}>
        <View>
          <TabIcon name={routeName} color={color} focused={focused} />
          {badge > 0 ? (
            <View style={styles.badge}>
              <Text variant="caption" color="#FFFFFF" style={styles.badgeText}>
                {badge > 9 ? '9+' : badge}
              </Text>
            </View>
          ) : null}
        </View>
        <Text variant="caption" color={color} numberOfLines={1}>
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

/**
 * Line icons drawn inline rather than pulled from an icon font — five glyphs
 * is not worth a dependency, and this keeps stroke weight consistent with the
 * rest of the interface.
 */
function TabIcon({ name, color, focused }: { name: string; color: string; focused: boolean }) {
  const width = focused ? 2.1 : 1.7;
  const props = { stroke: color, strokeWidth: width, fill: 'none', strokeLinecap: 'round' as const };

  switch (name) {
    case 'index':
      return (
        <Svg width={22} height={22} viewBox="0 0 24 24">
          <Path d="M3 17l5-6 4 4 4-7 5 5" {...props} strokeLinejoin="round" />
          <Path d="M3 21h18" {...props} opacity={0.45} />
        </Svg>
      );
    case 'discover':
      return (
        <Svg width={22} height={22} viewBox="0 0 24 24">
          <Circle cx={11} cy={11} r={7} {...props} />
          <Path d="M16.5 16.5L21 21" {...props} />
        </Svg>
      );
    case 'watchlist':
      return (
        <Svg width={22} height={22} viewBox="0 0 24 24">
          <Path
            d="M12 4.5l2.3 4.7 5.2.8-3.8 3.7.9 5.2-4.6-2.4-4.6 2.4.9-5.2L4.5 10l5.2-.8z"
            stroke={color}
            strokeWidth={width}
            strokeLinejoin="round"
            fill={focused ? color : 'none'}
            fillOpacity={focused ? 0.16 : 0}
          />
        </Svg>
      );
    case 'alerts':
      return (
        <Svg width={22} height={22} viewBox="0 0 24 24">
          <Path d="M18 15v-4a6 6 0 10-12 0v4l-1.5 2.5h15z" {...props} strokeLinejoin="round" />
          <Path d="M10 20.5a2.2 2.2 0 004 0" {...props} />
        </Svg>
      );
    case 'profile':
      return (
        <Svg width={22} height={22} viewBox="0 0 24 24">
          <Circle cx={12} cy={8.5} r={3.6} {...props} />
          <Path d="M4.8 20a7.4 7.4 0 0114.4 0" {...props} strokeLinejoin="round" />
        </Svg>
      );
    default:
      return (
        <Svg width={22} height={22} viewBox="0 0 24 24">
          <Rect x={5} y={5} width={14} height={14} rx={4} {...props} />
        </Svg>
      );
  }
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: space.lg,
  },
  bar: {
    flexDirection: 'row',
    height: TAB_BAR_HEIGHT,
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.borderStrong,
    // The blur carries the translucency on iOS. expo-blur barely blurs on
    // Android without its experimental backend, so there the bar has to be
    // near-opaque in its own right — at 0.82 alpha, list rows scrolling under
    // it were legible straight through the tab labels.
    backgroundColor: Platform.select({
      ios: 'rgba(16, 18, 26, 0.82)',
      default: 'rgba(13, 15, 22, 0.985)',
    }),
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabInner: {
    alignItems: 'center',
    gap: 3,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: palette.negative,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 9,
    lineHeight: 12,
  },
});
