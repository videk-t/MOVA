import { memo } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import type { AlertCondition, AlertRule } from '@/core/alert-rules';
import { formatRelativeTime } from '@/core/format';
import { palette, radius, space } from '@/theme';
import { Card } from '@/ui/Card';
import { Text } from '@/ui/Text';
import { Badge } from '@/ui/Badge';
import { SwipeRow } from '@/ui/SwipeRow';
import { select } from '@/ui/haptics';

const CONDITION_ICONS: Record<AlertCondition['kind'], string> = {
  score_above: '🧠',
  score_below: '🧠',
  score_moves: '🧠',
  price_change: '🚀',
  volume_spike: '⚡',
  liquidity_drop: '💧',
  whale_activity: '🐋',
  dev_activity: '⚠️',
  risk_worsens: '🛡',
  breakout: '📈',
};

export interface RuleRowProps {
  rule: AlertRule;
  onToggle: () => void;
  onRemove: () => void;
}

/**
 * One configured alert rule.
 *
 * A disabled rule is dimmed but kept, because turning a rule off while a
 * position is open is a normal thing to do — deleting it should require the
 * more deliberate swipe.
 */
function RuleRowBase({ rule, onToggle, onRemove }: RuleRowProps) {
  const scopeLabel =
    rule.scope.type === 'token'
      ? rule.scope.symbol
      : rule.scope.type === 'watchlist'
        ? 'Watchlist'
        : 'All tokens';

  const cooldownMinutes = Math.round(rule.cooldownMs / 60_000);

  return (
    <SwipeRow actionLabel="Delete" onAction={onRemove}>
      <Card style={[styles.card, !rule.enabled && styles.disabled]}>
        <View style={styles.row}>
          <View style={styles.icon}>
            <Text variant="body" accessibilityElementsHidden>
              {CONDITION_ICONS[rule.condition.kind] ?? '🔔'}
            </Text>
          </View>

          <View style={styles.body}>
            <Text variant="bodyMedium" numberOfLines={2}>
              {rule.label}
            </Text>
            <View style={styles.meta}>
              <Badge
                label={scopeLabel}
                tone={rule.scope.type === 'token' ? 'brand' : 'neutral'}
                size="sm"
              />
              <Text variant="caption" tone="tertiary" numberOfLines={1} style={styles.metaText}>
                {rule.lastTriggeredAt == null
                  ? `Never fired · ${cooldownMinutes}m gap`
                  : `Last fired ${formatRelativeTime(rule.lastTriggeredAt)}`}
              </Text>
            </View>
          </View>

          <Switch
            value={rule.enabled}
            onValueChange={() => {
              select();
              onToggle();
            }}
            accessibilityLabel={`${rule.label}, ${rule.enabled ? 'on' : 'off'}`}
            trackColor={{ false: palette.surfaceHigh, true: palette.brand }}
            thumbColor="#FFFFFF"
            ios_backgroundColor={palette.surfaceHigh}
          />
        </View>
      </Card>
    </SwipeRow>
  );
}

export const RuleRow = memo(RuleRowBase);

const styles = StyleSheet.create({
  card: {
    padding: space.md,
  },
  disabled: {
    opacity: 0.55,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  icon: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: palette.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: space.sm,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  metaText: {
    flexShrink: 1,
  },
});
