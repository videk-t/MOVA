import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { palette, radius, space } from '@/theme';
import { Text } from './Text';
import { commit, select } from './haptics';

const ACTION_WIDTH = 96;
/** How far past the action the row can be dragged, for elastic feel. */
const OVERSHOOT = 28;
const SPRING = { damping: 24, stiffness: 300, mass: 0.7 } as const;

export interface SwipeRowProps {
  children: ReactNode;
  /** Revealed by dragging the row to the left. */
  actionLabel: string;
  onAction: () => void;
  /** Destructive actions get the negative tone. */
  destructive?: boolean;
  style?: ViewStyle;
}

/**
 * A row that reveals a single action when dragged left.
 *
 * Swipe is a shortcut, never the only route: the same action is exposed as an
 * accessibility action, because a gesture no screen reader can perform would
 * otherwise make the feature unreachable.
 */
export function SwipeRow({ children, actionLabel, onAction, destructive = true, style }: SwipeRowProps) {
  const x = useSharedValue(0);
  const restingAt = useSharedValue(0);
  const [open, setOpen] = useState(false);

  const close = useCallback(() => {
    setOpen(false);
    x.value = withSpring(0, SPRING);
  }, [x]);

  const fire = useCallback(() => {
    commit();
    setOpen(false);
    x.value = withSpring(0, SPRING);
    onAction();
  }, [onAction, x]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        // Horizontal intent only — anything vertical belongs to the list.
        .activeOffsetX([-16, 16])
        .failOffsetY([-12, 12])
        .onBegin(() => {
          restingAt.value = x.value;
        })
        .onUpdate((event) => {
          const next = restingAt.value + event.translationX;
          x.value = Math.max(-ACTION_WIDTH - OVERSHOOT, Math.min(0, next));
        })
        .onEnd((event) => {
          const shouldOpen = x.value < -ACTION_WIDTH / 2 || event.velocityX < -700;
          x.value = withSpring(shouldOpen ? -ACTION_WIDTH : 0, SPRING);
          runOnJS(setOpen)(shouldOpen);
          if (shouldOpen) runOnJS(select)();
        }),
    [restingAt, x],
  );

  const contentStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  const actionStyle = useAnimatedStyle(() => {
    const progress = Math.min(1, -x.value / ACTION_WIDTH);
    return { opacity: progress, transform: [{ scale: 0.86 + progress * 0.14 }] };
  });

  return (
    <View
      style={[styles.wrap, style]}
      accessibilityActions={[{ name: 'swipeAction', label: actionLabel }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'swipeAction') onAction();
      }}
    >
      <View style={styles.actionLayer} pointerEvents="box-none">
        <Animated.View style={actionStyle}>
          <Pressable
            onPress={fire}
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
            style={({ pressed }) => [
              styles.action,
              destructive ? styles.actionDestructive : styles.actionNeutral,
              pressed && styles.actionPressed,
            ]}
          >
            <Text variant="labelSemi" color={destructive ? palette.negative : palette.textSecondary}>
              {actionLabel}
            </Text>
          </Pressable>
        </Animated.View>
      </View>

      <GestureDetector gesture={pan}>
        <Animated.View style={contentStyle}>
          {children}
          {open ? (
            // Absorbs the tap that would otherwise open the token, so the first
            // tap after a swipe closes the row instead of navigating away.
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={close}
              accessibilityRole="button"
              accessibilityLabel="Close row actions"
            />
          ) : null}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  actionLayer: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: ACTION_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  action: {
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  actionDestructive: {
    backgroundColor: palette.negativeDim,
    borderColor: palette.negative,
  },
  actionNeutral: {
    backgroundColor: palette.surfaceHigh,
    borderColor: palette.borderStrong,
  },
  actionPressed: {
    opacity: 0.7,
  },
});
