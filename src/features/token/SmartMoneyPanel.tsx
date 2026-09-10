import { StyleSheet, View } from 'react-native';
import type { SmartMoney, WalletEvent, WalletTag } from '@/core/types';
import { formatRelativeTime, formatUsdCompact, NO_DATA, shortenAddress } from '@/core/format';
import { isNum } from '@/core/math';
import { palette, radius, space } from '@/theme';
import { Card } from '@/ui/Card';
import { Text } from '@/ui/Text';
import { Stat, StatRow } from '@/ui/Stat';
import { EmptyState } from '@/ui/States';

const TAG_STYLE: Record<WalletTag, { label: string; color: string; background: string }> = {
  whale: { label: 'Whale', color: palette.info, background: palette.infoDim },
  smart: { label: 'Smart money', color: palette.positive, background: palette.positiveDim },
  dev: { label: 'Deployer', color: palette.negative, background: palette.negativeDim },
  insider: { label: 'Insider', color: palette.warning, background: palette.warningDim },
  sniper: { label: 'Sniper', color: palette.warning, background: palette.warningDim },
  unknown: { label: 'Wallet', color: palette.textSecondary, background: palette.neutralDim },
};

/**
 * Smart money.
 *
 * Reports what large and historically profitable wallets have done. It is
 * deliberately descriptive: a wallet with a good record is not a
 * recommendation, and the copy says so rather than implying otherwise.
 */
export function SmartMoneyPanel({ smartMoney }: { smartMoney: SmartMoney }) {
  const events = smartMoney.events.slice(0, 8);
  const hasAggregate =
    isNum(smartMoney.netFlow24hUsd) || isNum(smartMoney.whaleBuys24h) || isNum(smartMoney.smartWalletHolders);

  if (!hasAggregate && events.length === 0) {
    return (
      <Card>
        <EmptyState
          compact
          emoji="🐋"
          title="No wallet data"
          message="The current provider does not expose wallet-level activity for this token."
        />
      </Card>
    );
  }

  const netFlow = smartMoney.netFlow24hUsd;

  return (
    <Card style={styles.card}>
      <StatRow>
        <Stat
          label="Net flow 24h"
          value={netFlow == null ? NO_DATA : `${netFlow >= 0 ? '+' : '-'}${formatUsdCompact(Math.abs(netFlow))}`}
          color={netFlow == null ? undefined : netFlow > 0 ? palette.positive : netFlow < 0 ? palette.negative : undefined}
        />
        <Stat
          label="Whale buys / sells"
          value={
            isNum(smartMoney.whaleBuys24h) && isNum(smartMoney.whaleSells24h)
              ? `${smartMoney.whaleBuys24h} / ${smartMoney.whaleSells24h}`
              : NO_DATA
          }
        />
        <Stat
          label="Tracked holders"
          value={isNum(smartMoney.smartWalletHolders) ? String(smartMoney.smartWalletHolders) : NO_DATA}
        />
      </StatRow>

      {events.length > 0 ? (
        <View style={styles.events}>
          <Text variant="labelSemi" tone="secondary">
            Recent notable transactions
          </Text>
          {events.map((event) => (
            <WalletRow key={event.id} event={event} />
          ))}
        </View>
      ) : null}

      <Text variant="caption" tone="tertiary" style={styles.note}>
        Wallet labels are heuristic and describe past behaviour only. Following another wallet gives you their
        entry price and none of their information.
      </Text>
    </Card>
  );
}

function WalletRow({ event }: { event: WalletEvent }) {
  const tag = TAG_STYLE[event.tag];
  const isBuy = event.action === 'buy';

  return (
    <View
      style={styles.eventRow}
      accessibilityLabel={`${tag.label} ${event.action} of ${formatUsdCompact(event.amountUsd)}, ${formatRelativeTime(event.at)}`}
    >
      <View style={[styles.direction, { backgroundColor: isBuy ? palette.positiveDim : palette.negativeDim }]}>
        <Text variant="caption" color={isBuy ? palette.positive : palette.negative}>
          {isBuy ? '↑' : '↓'}
        </Text>
      </View>

      <View style={styles.eventBody}>
        <View style={styles.eventTop}>
          <View style={[styles.tag, { backgroundColor: tag.background }]}>
            <Text variant="caption" color={tag.color}>
              {tag.label}
            </Text>
          </View>
          <Text variant="caption" tone="tertiary" numberOfLines={1} style={styles.address}>
            {event.label ?? shortenAddress(event.address, 4, 4)}
          </Text>
        </View>
        {isNum(event.wallet30dPnlUsd) ? (
          <Text variant="caption" tone="tertiary">
            30d record: {event.wallet30dPnlUsd >= 0 ? '+' : '-'}
            {formatUsdCompact(Math.abs(event.wallet30dPnlUsd))}
          </Text>
        ) : null}
      </View>

      <View style={styles.eventRight}>
        <Text variant="labelSemi" tabular color={isBuy ? palette.positive : palette.negative}>
          {formatUsdCompact(event.amountUsd)}
        </Text>
        <Text variant="caption" tone="tertiary">
          {formatRelativeTime(event.at)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space.lg,
  },
  events: {
    gap: space.md,
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  direction: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  eventTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  tag: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  address: {
    flexShrink: 1,
  },
  eventRight: {
    alignItems: 'flex-end',
  },
  note: {
    lineHeight: 15,
  },
});
