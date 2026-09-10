import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { WatchlistRow as RowData } from '@/core/watchlist';
import { formatPct, formatPrice, formatRelativeTime, formatUsdCompact, NO_DATA } from '@/core/format';
import { deltaColor, palette, riskColor, scoreColor, space } from '@/theme';
import { PressableCard } from '@/ui/Card';
import { Text } from '@/ui/Text';
import { TokenLogo } from '@/ui/TokenLogo';
import { Sparkline } from '@/ui/Sparkline';
import { SwipeRow } from '@/ui/SwipeRow';

export interface WatchlistRowProps {
  row: RowData;
  /** How many enabled alert rules currently cover this token. */
  alertCount: number;
  onRemove: () => void;
}

/**
 * A watchlist row carries more than a discovery row: the user already decided
 * this token is worth following, so the questions change from "what is this" to
 * "what has changed since I saved it". Hence score drift, momentum and alert
 * coverage on a second line.
 */
function WatchlistRowBase({ row, alertCount, onRemove }: WatchlistRowProps) {
  const router = useRouter();
  const { entry, summary, scoreDelta, momentum } = row;

  const change = summary?.market.change24h ?? null;
  const score = summary?.score ?? null;
  const pending = summary == null;

  return (
    <SwipeRow actionLabel="Remove" onAction={onRemove}>
      <PressableCard
        padded={false}
        style={styles.card}
        accessibilityLabel={buildLabel(row, alertCount)}
        accessibilityHint="Opens the full token analysis. Swipe left to remove."
        onPress={() => router.push(`/token/${entry.address}`)}
      >
        <View style={styles.top}>
          <TokenLogo uri={entry.logoUri} symbol={entry.symbol} size={40} />

          <View style={styles.identity}>
            <View style={styles.symbolRow}>
              <Text variant="bodyMedium" numberOfLines={1} style={styles.symbol}>
                {entry.symbol}
              </Text>
              {summary ? (
                <View style={[styles.riskDot, { backgroundColor: riskColor[summary.risk] }]} />
              ) : null}
            </View>
            <Text variant="caption" tone="tertiary" numberOfLines={1}>
              {pending ? `Added ${formatRelativeTime(entry.addedAt)}` : entry.name}
            </Text>
          </View>

          {summary ? (
            <Sparkline
              values={summary.spark}
              width={50}
              height={24}
              gradientId={`watch-${entry.address}`}
            />
          ) : null}

          <View style={styles.numbers}>
            <Text variant="bodyMedium" tabular numberOfLines={1}>
              {formatPrice(summary?.market.priceUsd ?? null)}
            </Text>
            <Text variant="caption" tabular color={deltaColor(change)} numberOfLines={1}>
              {formatPct(change)}
            </Text>
          </View>
        </View>

        <View style={styles.metrics}>
          <Metric
            label="MOVA"
            value={score == null ? NO_DATA : String(Math.round(score))}
            color={score == null ? palette.textTertiary : scoreColor(score)}
            trailing={
              scoreDelta != null && Math.abs(scoreDelta) >= 1 ? (
                <Text variant="caption" tabular color={deltaColor(scoreDelta)}>
                  {scoreDelta > 0 ? '▲' : '▼'}
                  {Math.abs(scoreDelta)}
                </Text>
              ) : null
            }
          />

          <Metric label="Liquidity" value={formatUsdCompact(summary?.market.liquidityUsd ?? null)} />

          <Metric
            label="Momentum"
            value={momentum == null ? NO_DATA : String(Math.round(momentum))}
            color={momentum == null ? palette.textTertiary : scoreColor(momentum)}
          />

          <View style={styles.alerts}>
            <Text variant="caption" tone="tertiary" style={styles.metricLabel}>
              Alerts
            </Text>
            <Text
              variant="labelSemi"
              tabular
              color={alertCount > 0 ? palette.brandBright : palette.textTertiary}
            >
              {alertCount > 0 ? `🔔 ${alertCount}` : 'Off'}
            </Text>
          </View>
        </View>
      </PressableCard>
    </SwipeRow>
  );
}

interface MetricProps {
  label: string;
  value: string;
  color?: string;
  trailing?: React.ReactNode;
}

function Metric({ label, value, color, trailing }: MetricProps) {
  return (
    <View style={styles.metric}>
      <Text variant="caption" tone="tertiary" style={styles.metricLabel}>
        {label}
      </Text>
      <View style={styles.metricValue}>
        <Text variant="labelSemi" tabular color={color} numberOfLines={1}>
          {value}
        </Text>
        {trailing}
      </View>
    </View>
  );
}

function buildLabel(row: RowData, alertCount: number): string {
  const { entry, summary, scoreDelta } = row;
  if (summary == null) {
    return `${entry.symbol}, ${entry.name}. Live data not loaded yet.`;
  }
  const parts = [
    entry.symbol,
    entry.name,
    `price ${formatPrice(summary.market.priceUsd)}`,
    `24 hour change ${formatPct(summary.market.change24h)}`,
    summary.score == null ? 'no MOVA score' : `MOVA score ${Math.round(summary.score)}`,
  ];
  if (scoreDelta != null && Math.abs(scoreDelta) >= 1) {
    parts.push(`${scoreDelta > 0 ? 'up' : 'down'} ${Math.abs(scoreDelta)} points since you added it`);
  }
  parts.push(`${summary.risk} risk`);
  parts.push(alertCount > 0 ? `${alertCount} alert rules active` : 'no alert rules');
  return parts.join(', ');
}

export const WatchlistRow = memo(WatchlistRowBase);

const styles = StyleSheet.create({
  card: {
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    gap: space.md,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  identity: {
    flex: 1,
    minWidth: 0,
  },
  symbolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  symbol: {
    flexShrink: 1,
  },
  riskDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  numbers: {
    alignItems: 'flex-end',
    minWidth: 74,
  },
  metrics: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.border,
  },
  metric: {
    flex: 1,
    minWidth: 0,
  },
  metricLabel: {
    marginBottom: 3,
  },
  metricValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  alerts: {
    minWidth: 46,
    alignItems: 'flex-start',
    paddingLeft: space.sm,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: palette.border,
  },
});
