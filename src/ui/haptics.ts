import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { useSettings } from '@/store/settings';

/**
 * Haptics are a physical claim that something happened. They fire on state the
 * user caused and would otherwise have to verify visually — never on scroll,
 * arrival of data, or decoration.
 *
 * Web has no haptic engine, so every call is a no-op there rather than an error.
 */

const supported = Platform.OS === 'ios' || Platform.OS === 'android';

function enabled(): boolean {
  if (!supported) return false;
  // Read the store imperatively: these are called from event handlers, not
  // render, and every call site would otherwise need to thread the preference
  // through as a prop.
  try {
    return useSettings.getState().hapticsEnabled;
  } catch {
    // Before the store hydrates, default to the shipped preference.
    return true;
  }
}

function safely(run: () => Promise<unknown>): void {
  if (!enabled()) return;
  // Haptics can reject on devices with the engine disabled; that is not an error
  // worth surfacing, and must never break the interaction that triggered it.
  void run().catch(() => undefined);
}

/** Light tick for a card or row press. */
export function tap(): void {
  safely(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

/** Firmer bump for a committed action: saving, adding, confirming. */
export function commit(): void {
  safely(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
}

/** Discrete tick while moving through options — chart scrub, segmented control. */
export function select(): void {
  safely(() => Haptics.selectionAsync());
}

export function success(): void {
  safely(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

export function warn(): void {
  safely(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
}

export function error(): void {
  safely(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
}
