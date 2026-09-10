import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { AlertEvent, AlertKind, AlertSeverity } from '@/core/types';
import { formatRelativeTime } from '@/core/format';
import { palette, radius, space } from '@/theme';
import { PressableCard } from '@/ui/Card';
import { Text } from '@/ui/Text';
import { useAlerts } from '@/store/alerts';

export const ALERT_ICONS: Record<AlertKind, string> = {
  momentum_spike: '🚀',
  whale_accumulation: '🐋',
  dev_selling: '⚠️',
  liquidity_change: '💧',
  breakout: '📈',
  score_change: '🧠',
  volume_spike: '⚡',
  risk_change: '🛡',
};

const SEVERITY_COLOR: Record<AlertSeverity, string> = {
  info: palette.info,
  positive: palette.positive,
  warning: palette.warning,
  critical: palette.negative,
};

const SEVERITY_TINT: Record<AlertSeverity, string> = {
  info: palette.infoDim,
  positive: palette.positiveDim,
  warning: palette.warningDim,
  critical: palette.negativeDim,
};

/**
 * One alert in the feed.
 *
 * Unread items carry a left accent bar; opening one marks it read and jumps to
 * the token, because an alert is only useful as a route to the thing it is
 * about.
 */
export function AlertRow({ event, compact = false }: { event: AlertEvent; compact?: boolean }) {
  const router = useRouter();
  const markRead = useAlerts((s) => s.markRead);
  const color = SEVERITY_COLOR[event.severity];

  return (
    <PressableCard
      padded={false}
      style={styles.card}
      accessibilityLabel={`${event.title}. ${event.body} ${formatRelativeTime(event.at)}${
        event.read ? '' : '. Unread'
      }`}
      onPress={() => {
        markRead(event.id);
        router.push(`/token/${event.tokenAddress}`);
      }}
    >
      <View style={styles.row}>
        {!event.read ? <View style={[styles.unreadBar, { backgroundColor: color }]} /> : null}

        <View style={[styles.icon, { backgroundColor: SEVERITY_TINT[event.severity] }]}>
          <Text variant="body" accessibilityElementsHidden>
            {ALERT_ICONS[event.kind] ?? '🔔'}
          </Text>
        </View>

        <View style={styles.body}>
          <View style={styles.titleRow}>
            <Text variant="bodyMedium" numberOfLines={1} style={styles.title}>
              {event.title}
            </Text>
            <Text variant="caption" tone="tertiary">
              {formatRelativeTime(event.at)}
            </Text>
          </View>
          <Text
            variant="caption"
            tone="secondary"
            numberOfLines={compact ? 1 : 2}
            style={styles.message}
          >
            {event.body}
          </Text>
          {event.origin === 'mock' ? (
            <Text variant="caption" tone="tertiary" style={styles.demo}>
              From demo data
            </Text>
          ) : null}
        </View>
      </View>
    </PressableCard>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: space.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
  },
  unreadBar: {
    position: 'absolute',
    left: -space.md,
    top: -space.md,
    bottom: -space.md,
    width: 3,
  },
  icon: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  title: {
    flexShrink: 1,
  },
  message: {
    lineHeight: 16,
  },
  demo: {
    marginTop: 2,
  },
});
