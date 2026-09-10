import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { JournalTrade } from '@/core/journal-stats';
import { tradePnl, tradePnlPct } from '@/core/journal-stats';
import { isSolanaAddress } from '@/core/normalize';
import { formatPct, formatPrice, formatRelativeTime, formatUsd, NO_DATA } from '@/core/format';
import { deltaColor, palette, radius, space } from '@/theme';
import { PressableCard } from '@/ui/Card';
import { Text } from '@/ui/Text';
import { Badge } from '@/ui/Badge';
import { TokenLogo } from '@/ui/TokenLogo';
import { SwipeRow } from '@/ui/SwipeRow';

export interface TradeRowProps {
  trade: JournalTrade;
  /** Current price for an open position, when one could be fetched. */
  livePrice?: number | null;
  onRemove: () => void;
}

/**
 * One journal entry.
 *
 * A closed trade shows what happened; an open one shows the unrealised move
 * where a live price is available, clearly marked as unrealised so it is never
 * confused with a booked result.
 */
function TradeRowBase({ trade, livePrice = null, onRemove }: TradeRowProps) {
  const router = useRouter();
  const closed = trade.status === 'closed';

  const realised = closed ? tradePnl(trade) : null;
  const realisedPct = closed ? tradePnlPct(trade) : null;

  const unrealised =
    !closed && livePrice != null && livePrice > 0 && trade.entryPrice > 0
      ? (trade.sizeUsd / trade.entryPrice) * (livePrice - trade.entryPrice)
      : null;
  const unrealisedPct =
    unrealised != null && trade.sizeUsd > 0 ? (unrealised / trade.sizeUsd) * 100 : null;

  const pnl = closed ? realised : unrealised;
  const pnlPct = closed ? realisedPct : unrealisedPct;

  // A manually recorded trade may have no mint address, in which case there is
  // no token page to open. Closing is always available.
  const hasTokenPage = isSolanaAddress(trade.tokenAddress);

  return (
    <SwipeRow actionLabel="Delete" onAction={onRemove}>
      <PressableCard
        padded={false}
        style={styles.card}
        accessibilityLabel={buildLabel(trade, pnl, pnlPct)}
        accessibilityHint={
          closed
            ? hasTokenPage
              ? 'Opens the token'
              : undefined
            : 'Opens the form to close this position'
        }
        onPress={() => {
          if (!closed) router.push(`/tools/trade?close=${trade.id}`);
          else if (hasTokenPage) router.push(`/token/${trade.tokenAddress}`);
        }}
      >
        <View style={styles.top}>
          <TokenLogo uri={trade.tokenLogo} symbol={trade.tokenSymbol} size={38} />

          <View style={styles.identity}>
            <View style={styles.symbolRow}>
              <Text variant="bodyMedium" numberOfLines={1} style={styles.symbol}>
                {trade.tokenSymbol}
              </Text>
              {closed ? null : <Badge label="Open" tone="info" size="sm" />}
            </View>
            <Text variant="caption" tone="tertiary" numberOfLines={1}>
              {trade.setup} · {formatRelativeTime(closed ? (trade.closedAt ?? trade.openedAt) : trade.openedAt)}
            </Text>
          </View>

          <View style={styles.numbers}>
            {pnl == null ? (
              <Text variant="bodyMedium" tone="tertiary" tabular>
                {NO_DATA}
              </Text>
            ) : (
              <>
                <Text variant="bodyMedium" tabular color={deltaColor(pnl)}>
                  {pnl >= 0 ? '+' : '−'}
                  {formatUsd(Math.abs(pnl))}
                </Text>
                <Text variant="caption" tabular color={deltaColor(pnlPct)}>
                  {formatPct(pnlPct)}
                </Text>
              </>
            )}
            {!closed && pnl != null ? (
              <Text variant="caption" tone="tertiary">
                unrealised
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.details}>
          <Detail label="Size" value={formatUsd(trade.sizeUsd)} />
          <Detail label="Entry" value={formatPrice(trade.entryPrice)} />
          <Detail
            label={closed ? 'Exit' : 'Now'}
            value={closed ? formatPrice(trade.exitPrice) : formatPrice(livePrice)}
          />
          <Detail
            label="Score"
            value={trade.scoreAtEntry == null ? NO_DATA : String(Math.round(trade.scoreAtEntry))}
          />
        </View>

        {trade.entryReason.trim().length > 0 ? (
          <Text variant="caption" tone="secondary" numberOfLines={2} style={styles.reason}>
            {trade.entryReason.trim()}
          </Text>
        ) : null}
      </PressableCard>
    </SwipeRow>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detail}>
      <Text variant="caption" tone="tertiary">
        {label}
      </Text>
      <Text variant="label" tabular tone={value === NO_DATA ? 'tertiary' : 'primary'} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function buildLabel(trade: JournalTrade, pnl: number | null, pnlPct: number | null): string {
  const parts = [
    trade.tokenSymbol,
    trade.status === 'closed' ? 'closed' : 'open position',
    `size ${formatUsd(trade.sizeUsd)}`,
    `entry ${formatPrice(trade.entryPrice)}`,
  ];
  if (pnl != null) {
    parts.push(
      `${trade.status === 'closed' ? 'result' : 'unrealised'} ${pnl >= 0 ? 'up' : 'down'} ${formatUsd(
        Math.abs(pnl),
      )}, ${formatPct(pnlPct)}`,
    );
  }
  return parts.join(', ');
}

export const TradeRow = memo(TradeRowBase);

const styles = StyleSheet.create({
  card: {
    padding: space.md,
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
    gap: space.sm,
  },
  symbol: {
    flexShrink: 1,
  },
  numbers: {
    alignItems: 'flex-end',
  },
  details: {
    flexDirection: 'row',
    gap: space.sm,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.border,
  },
  detail: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  reason: {
    backgroundColor: palette.bgElevated,
    borderRadius: radius.sm,
    padding: space.md,
    lineHeight: 16,
  },
});
