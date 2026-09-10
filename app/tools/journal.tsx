import { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { JournalTrade, TradeMode } from '@/core/journal-stats';
import { computeJournalStats } from '@/core/journal-stats';
import { isSolanaAddress } from '@/core/normalize';
import { formatUsd, NO_DATA } from '@/core/format';
import { deltaColor, palette, space } from '@/theme';
import { Screen, PushedHeader } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { Badge } from '@/ui/Badge';
import { Segmented } from '@/ui/Segmented';
import { EmptyState } from '@/ui/States';
import { Stat, StatRow } from '@/ui/Stat';
import { EquityCurve } from '@/features/journal/EquityCurve';
import { TradeRow } from '@/features/journal/TradeRow';
import { useSummaries } from '@/data/queries';
import { useJournal, useTrades } from '@/store/journal';
import { useSettings } from '@/store/settings';

/**
 * Trade journal.
 *
 * Paper and real records are separated everywhere, because a win rate that
 * quietly blends simulated trades into real ones is worse than no statistics at
 * all. Every figure here was typed in by the user — MOVA reads no wallet.
 */
export default function JournalScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<TradeMode>('real');

  const trades = useTrades(mode);
  const remove = useJournal((s) => s.remove);
  const refreshInterval = useSettings((s) => s.refreshIntervalSec) * 1_000;

  const stats = useMemo(() => computeJournalStats(trades), [trades]);

  // Live prices only for open positions that carry a real mint address.
  const openAddresses = useMemo(
    () =>
      Array.from(
        new Set(
          trades
            .filter((t) => t.status === 'open' && isSolanaAddress(t.tokenAddress))
            .map((t) => t.tokenAddress),
        ),
      ),
    [trades],
  );
  const summaries = useSummaries(openAddresses, refreshInterval);

  const priceFor = useCallback(
    (address: string) =>
      summaries.data?.data.find((s) => s.ref.address === address)?.market.priceUsd ?? null,
    [summaries.data?.data],
  );

  const renderItem = useCallback(
    ({ item }: { item: JournalTrade }) => (
      <TradeRow trade={item} livePrice={priceFor(item.tokenAddress)} onRemove={() => remove(item.id)} />
    ),
    [priceFor, remove],
  );

  return (
    <Screen>
      <PushedHeader
        title="Journal"
        subtitle="What you did, and why"
        right={<Badge label={mode === 'paper' ? 'PAPER' : 'REAL'} tone={mode === 'paper' ? 'warning' : 'neutral'} size="sm" />}
      />

      <View style={styles.header}>
        <Segmented
          options={[
            { value: 'real' as TradeMode, label: '💵  Real trades' },
            { value: 'paper' as TradeMode, label: '📝  Paper trades' },
          ]}
          value={mode}
          onChange={setMode}
          accessibilityLabel="Journal record type"
        />
      </View>

      <FlatList
        data={trades}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + space['4xl'] }]}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={Separator}
        initialNumToRender={8}
        maxToRenderPerBatch={6}
        windowSize={9}
        ListHeaderComponent={
          trades.length > 0 ? (
            <View style={styles.statsBlock}>
              <Card>
                <View style={styles.pnlHead}>
                  <View>
                    <Text variant="overline" tone="tertiary">
                      Realised P/L
                    </Text>
                    <Text
                      variant="h1"
                      tabular
                      color={deltaColor(stats.totalPnlUsd)}
                      style={styles.pnlValue}
                    >
                      {stats.totalPnlUsd >= 0 ? '+' : '−'}
                      {formatUsd(Math.abs(stats.totalPnlUsd))}
                    </Text>
                  </View>
                  <View style={styles.counts}>
                    <Badge label={`${stats.closedTrades} closed`} tone="neutral" size="sm" />
                    {stats.openTrades > 0 ? (
                      <Badge label={`${stats.openTrades} open`} tone="info" size="sm" />
                    ) : null}
                  </View>
                </View>

                <View style={styles.curve}>
                  <EquityCurve values={stats.equityCurve} />
                </View>
              </Card>

              <Card style={styles.statsCard}>
                <StatRow>
                  <Stat
                    label="Win rate"
                    value={stats.winRatePct == null ? NO_DATA : `${stats.winRatePct}%`}
                    caption={stats.closedTrades > 0 ? `${stats.wins}W · ${stats.losses}L` : undefined}
                  />
                  <Stat
                    label="Profit factor"
                    value={stats.profitFactor == null ? NO_DATA : String(stats.profitFactor)}
                    caption={stats.profitFactor == null && stats.closedTrades > 0 ? 'No losses yet' : undefined}
                  />
                  <Stat
                    label="Expectancy"
                    value={stats.expectancyUsd == null ? NO_DATA : formatUsd(stats.expectancyUsd)}
                    caption="per trade"
                  />
                </StatRow>

                <View style={styles.statsGap}>
                  <StatRow>
                    <Stat
                      label="Average win"
                      value={stats.averageWinUsd == null ? NO_DATA : formatUsd(stats.averageWinUsd)}
                      color={stats.averageWinUsd == null ? undefined : palette.positive}
                    />
                    <Stat
                      label="Average loss"
                      value={stats.averageLossUsd == null ? NO_DATA : `−${formatUsd(stats.averageLossUsd)}`}
                      color={stats.averageLossUsd == null ? undefined : palette.negative}
                    />
                    <Stat
                      label="Max drawdown"
                      value={stats.maxDrawdownUsd > 0 ? `−${formatUsd(stats.maxDrawdownUsd)}` : NO_DATA}
                      color={stats.maxDrawdownUsd > 0 ? palette.negative : undefined}
                    />
                  </StatRow>
                </View>

                {stats.closedTrades === 0 ? (
                  <Text variant="caption" tone="tertiary" style={styles.statsNote}>
                    Statistics appear once you close a position. Open trades are counted but never marked
                    to market here — unrealised P/L is not a result.
                  </Text>
                ) : null}
              </Card>

              <Button
                label={mode === 'paper' ? 'Open a paper position' : 'Record a trade'}
                fullWidth
                onPress={() => router.push(`/tools/trade?mode=${mode}`)}
              />

              <Text variant="caption" tone="tertiary" style={styles.swipeHint}>
                Tap an open position to close it. Swipe any entry left to delete it.
              </Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <EmptyState
            emoji={mode === 'paper' ? '📝' : '📓'}
            title={mode === 'paper' ? 'No paper trades yet' : 'Nothing recorded yet'}
            message={
              mode === 'paper'
                ? 'Simulate a position to test an idea without money at stake. Paper results are kept separate from your real record.'
                : 'Write down the trades you place elsewhere — size, price, and above all why. The reasoning is what makes a journal worth keeping.'
            }
            actionLabel={mode === 'paper' ? 'Open a paper position' : 'Record a trade'}
            onAction={() => router.push(`/tools/trade?mode=${mode}`)}
          />
        }
        ListFooterComponent={
          trades.length > 0 ? (
            <Text variant="caption" tone="tertiary" center style={styles.footer}>
              {mode === 'paper'
                ? 'Paper trades are simulated. No orders are placed and no money moves.'
                : 'MOVA stores only what you type. It has no connection to any wallet or exchange.'}
            </Text>
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
  header: {
    paddingHorizontal: space.xl,
    paddingBottom: space.md,
  },
  list: {
    paddingHorizontal: space.xl,
    paddingTop: space.sm,
    flexGrow: 1,
  },
  separator: {
    height: space.sm,
  },
  statsBlock: {
    gap: space.lg,
    marginBottom: space.lg,
  },
  pnlHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space.md,
  },
  pnlValue: {
    marginTop: 2,
  },
  counts: {
    alignItems: 'flex-end',
    gap: space.sm,
  },
  curve: {
    marginTop: space.lg,
  },
  statsCard: {
    gap: 0,
  },
  statsGap: {
    marginTop: space.lg,
  },
  statsNote: {
    marginTop: space.lg,
    lineHeight: 16,
  },
  swipeHint: {
    paddingHorizontal: space.xs,
    lineHeight: 15,
  },
  footer: {
    marginTop: space['2xl'],
    paddingHorizontal: space.lg,
    lineHeight: 16,
  },
});
