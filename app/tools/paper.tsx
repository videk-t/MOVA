import { useCallback, useMemo } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { JournalTrade } from '@/core/journal-stats';
import { computeJournalStats } from '@/core/journal-stats';
import { isSolanaAddress } from '@/core/normalize';
import { formatPct, formatUsd, NO_DATA } from '@/core/format';
import { deltaColor, palette, radius, space } from '@/theme';
import { Screen, PushedHeader } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { Badge, OriginBadge } from '@/ui/Badge';
import { EmptyState } from '@/ui/States';
import { Stat, StatRow } from '@/ui/Stat';
import { TradeRow } from '@/features/journal/TradeRow';
import { useSummaries } from '@/data/queries';
import { PAPER_STARTING_BALANCE, useJournal, useTrades } from '@/store/journal';
import { useSettings } from '@/store/settings';

/**
 * Paper trading.
 *
 * A simulated account with a fixed starting balance, so an idea can be tested
 * at a realistic size without money at stake. Open positions are marked to
 * market from the same provider the rest of the app uses, which is why the
 * demo-data badge matters here as much as anywhere.
 *
 * No orders are placed. No wallet is connected. Nothing here moves money.
 */
export default function PaperTradingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const refreshInterval = useSettings((s) => s.refreshIntervalSec) * 1_000;

  const trades = useTrades('paper');
  const remove = useJournal((s) => s.remove);
  const clearMode = useJournal((s) => s.clearMode);
  const paperBalance = useJournal((s) => s.paperBalance);

  const openTrades = useMemo(() => trades.filter((t) => t.status === 'open'), [trades]);
  const stats = useMemo(() => computeJournalStats(trades), [trades]);
  const balance = paperBalance();

  const openAddresses = useMemo(
    () => Array.from(new Set(openTrades.filter((t) => isSolanaAddress(t.tokenAddress)).map((t) => t.tokenAddress))),
    [openTrades],
  );
  const summaries = useSummaries(openAddresses, refreshInterval);

  const priceFor = useCallback(
    (address: string) =>
      summaries.data?.data.find((s) => s.ref.address === address)?.market.priceUsd ?? null,
    [summaries.data?.data],
  );

  /**
   * Mark-to-market value of open positions. Positions without a live price
   * contribute at cost rather than being dropped, and are counted so the UI can
   * say how much of the figure is unpriced.
   */
  const marked = useMemo(() => {
    let value = 0;
    let unrealised = 0;
    let unpriced = 0;
    for (const trade of openTrades) {
      const price = priceFor(trade.tokenAddress);
      if (price == null || price <= 0 || trade.entryPrice <= 0) {
        value += trade.sizeUsd;
        unpriced += 1;
        continue;
      }
      const units = trade.sizeUsd / trade.entryPrice;
      const current = units * price;
      value += current;
      unrealised += current - trade.sizeUsd;
    }
    return { value, unrealised, unpriced };
  }, [openTrades, priceFor]);

  const equity = balance.cash + marked.value;
  const totalReturnPct = ((equity - PAPER_STARTING_BALANCE) / PAPER_STARTING_BALANCE) * 100;

  const renderItem = useCallback(
    ({ item }: { item: JournalTrade }) => (
      <TradeRow trade={item} livePrice={priceFor(item.tokenAddress)} onRemove={() => remove(item.id)} />
    ),
    [priceFor, remove],
  );

  return (
    <Screen>
      <PushedHeader
        title="Paper trading"
        subtitle="Simulated positions"
        right={summaries.data ? <OriginBadge origin={summaries.data.meta.origin} /> : undefined}
      />

      <FlatList
        data={openTrades}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + space['4xl'] }]}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={Separator}
        refreshing={summaries.isRefetching}
        onRefresh={openAddresses.length > 0 ? () => void summaries.refetch() : undefined}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <View style={styles.banner}>
              <Text variant="labelSemi" color={palette.warning}>
                PAPER TRADING
              </Text>
              <Text variant="caption" tone="secondary" style={styles.bannerText}>
                Simulated only. No real transactions, no wallet, no money at risk.
              </Text>
            </View>

            <Card elevated>
              <Text variant="overline" tone="tertiary">
                Account equity
              </Text>
              <Text variant="display" tabular style={styles.equity}>
                {formatUsd(equity)}
              </Text>
              <Text variant="bodyMedium" tabular color={deltaColor(totalReturnPct)}>
                {formatPct(totalReturnPct)} from {formatUsd(PAPER_STARTING_BALANCE)}
              </Text>

              <View style={styles.divider} />

              <StatRow>
                <Stat label="Cash" value={formatUsd(balance.cash)} />
                <Stat label="In positions" value={formatUsd(marked.value)} />
                <Stat
                  label="Unrealised"
                  value={
                    openTrades.length === 0
                      ? NO_DATA
                      : `${marked.unrealised >= 0 ? '+' : '−'}${formatUsd(Math.abs(marked.unrealised))}`
                  }
                  color={openTrades.length === 0 ? undefined : deltaColor(marked.unrealised)}
                />
              </StatRow>

              <View style={styles.statsGap}>
                <StatRow>
                  <Stat
                    label="Realised"
                    value={`${balance.realised >= 0 ? '+' : '−'}${formatUsd(Math.abs(balance.realised))}`}
                    color={deltaColor(balance.realised)}
                  />
                  <Stat
                    label="Win rate"
                    value={stats.winRatePct == null ? NO_DATA : `${stats.winRatePct}%`}
                    caption={stats.closedTrades > 0 ? `${stats.closedTrades} closed` : undefined}
                  />
                  <Stat label="Open" value={String(openTrades.length)} />
                </StatRow>
              </View>

              {marked.unpriced > 0 ? (
                <Text variant="caption" tone="tertiary" style={styles.note}>
                  {marked.unpriced} position{marked.unpriced === 1 ? '' : 's'} could not be priced and{' '}
                  {marked.unpriced === 1 ? 'is' : 'are'} counted at cost. Add a mint address to track a
                  position live.
                </Text>
              ) : null}

              {balance.cash < 0 ? (
                <Text variant="caption" color={palette.warning} style={styles.note}>
                  You have deployed more than the starting balance. The simulator allows it so you can
                  see the effect, but a real account would not.
                </Text>
              ) : null}
            </Card>

            <View style={styles.actions}>
              <Button
                label="Open position"
                onPress={() => router.push('/tools/trade?mode=paper')}
                style={styles.action}
              />
              <Button
                label="History"
                variant="secondary"
                onPress={() => router.push('/tools/journal')}
                style={styles.action}
                accessibilityHint="Opens the journal, filtered to paper trades"
              />
            </View>

            {openTrades.length > 0 ? (
              <View style={styles.listHead}>
                <Text variant="h3">Open positions</Text>
                <Badge label={`${openTrades.length}`} tone="neutral" size="sm" />
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            emoji="📝"
            title="No open positions"
            message={
              stats.closedTrades > 0
                ? `You have closed ${stats.closedTrades} paper trade${stats.closedTrades === 1 ? '' : 's'}. Open another to keep testing, or review the record in the journal.`
                : 'Open a simulated position to test an idea at a realistic size, with nothing at risk.'
            }
            actionLabel="Open position"
            onAction={() => router.push('/tools/trade?mode=paper')}
          />
        }
        ListFooterComponent={
          trades.length > 0 ? (
            <View style={styles.footer}>
              <Button
                label="Reset paper account"
                variant="ghost"
                size="sm"
                onPress={() => clearMode('paper')}
                accessibilityHint="Deletes every paper trade and restores the starting balance"
              />
              <Text variant="caption" tone="tertiary" center style={styles.footerNote}>
                Paper results measure your process, not your profits. Simulated fills ignore slippage and
                fees, which are the two things that hurt most in a thin pool.
              </Text>
            </View>
          ) : null
        }
      />
    </Screen>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: space.xl,
    paddingTop: space.sm,
    flexGrow: 1,
  },
  separator: {
    height: space.sm,
  },
  headerBlock: {
    gap: space.lg,
    marginBottom: space.lg,
  },
  banner: {
    backgroundColor: palette.warningDim,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.warning,
    padding: space.md,
    gap: 4,
  },
  bannerText: {
    lineHeight: 15,
  },
  equity: {
    marginTop: 2,
    marginBottom: 4,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: palette.border,
    marginVertical: space.lg,
  },
  statsGap: {
    marginTop: space.lg,
  },
  note: {
    marginTop: space.lg,
    lineHeight: 16,
  },
  actions: {
    flexDirection: 'row',
    gap: space.sm,
  },
  action: {
    flex: 1,
  },
  listHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.sm,
  },
  footer: {
    marginTop: space['2xl'],
    alignItems: 'center',
    gap: space.md,
  },
  footerNote: {
    paddingHorizontal: space.lg,
    lineHeight: 16,
  },
});
