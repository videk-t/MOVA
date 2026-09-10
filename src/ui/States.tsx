import { StyleSheet, View, type ViewStyle } from 'react-native';
import { palette, radius, space } from '@/theme';
import { Text } from './Text';
import { Button } from './Button';

/**
 * Empty and error states.
 *
 * Both say what happened, why, and what the user can do next. An empty screen
 * with no explanation reads as a bug, so every list in MOVA has one of these
 * behind it.
 */

export interface EmptyStateProps {
  emoji: string;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: ViewStyle;
  compact?: boolean;
}

export function EmptyState({
  emoji,
  title,
  message,
  actionLabel,
  onAction,
  style,
  compact = false,
}: EmptyStateProps) {
  return (
    <View style={[styles.container, compact && styles.compact, style]} accessibilityRole="summary">
      <View style={styles.emojiWrap}>
        <Text variant="h1" accessibilityElementsHidden>
          {emoji}
        </Text>
      </View>
      <Text variant="h3" center style={styles.title}>
        {title}
      </Text>
      <Text variant="body" tone="secondary" center style={styles.message}>
        {message}
      </Text>
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} variant="secondary" style={styles.action} />
      ) : null}
    </View>
  );
}

export interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  /** Shown in small type — the underlying failure, for debugging. */
  detail?: string;
  style?: ViewStyle;
  compact?: boolean;
}

export function ErrorState({
  title = 'Could not load this',
  message = 'The data source did not respond. Your connection or the provider may be having trouble.',
  onRetry,
  detail,
  style,
  compact = false,
}: ErrorStateProps) {
  return (
    <View style={[styles.container, styles.errorContainer, compact && styles.compact, style]}>
      <View style={[styles.emojiWrap, styles.errorEmoji]}>
        <Text variant="h2" accessibilityElementsHidden>
          ⚠︎
        </Text>
      </View>
      <Text variant="h3" center style={styles.title}>
        {title}
      </Text>
      <Text variant="body" tone="secondary" center style={styles.message}>
        {message}
      </Text>
      {detail ? (
        <Text variant="caption" tone="tertiary" center style={styles.detail} numberOfLines={3}>
          {detail}
        </Text>
      ) : null}
      {onRetry ? <Button label="Try again" onPress={onRetry} variant="secondary" style={styles.action} /> : null}
    </View>
  );
}

/** Inline marker for a single missing value, rather than a whole failed screen. */
export function DataUnavailable({ label = 'Data unavailable' }: { label?: string }) {
  return (
    <View style={styles.unavailable}>
      <Text variant="caption" tone="tertiary">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: space['4xl'],
    paddingHorizontal: space.xl,
  },
  compact: {
    paddingVertical: space['2xl'],
  },
  errorContainer: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  emojiWrap: {
    width: 64,
    height: 64,
    borderRadius: radius.xl,
    backgroundColor: palette.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.lg,
  },
  errorEmoji: {
    backgroundColor: palette.warningDim,
  },
  title: {
    marginBottom: space.sm,
  },
  message: {
    maxWidth: 320,
  },
  detail: {
    marginTop: space.md,
    maxWidth: 320,
  },
  action: {
    marginTop: space.xl,
  },
  unavailable: {
    paddingVertical: 2,
  },
});
