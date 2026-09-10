import { useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import {
  buildWatchlistRows,
  watchlistStats,
  WATCHLIST_SORTS,
  WATCHLIST_SORT_LABELS,
  type WatchlistRow as RowData,
} from '@/core/watchlist';
import { formatPct, formatScore, NO_DATA } from '@/core/format';
import { deltaColor, palette, scoreColor, space } from '@/theme';
import { Screen, useTabBarPadding } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { OriginBadge } from '@/ui/Badge';
import { ChipRow } from '@/ui/Segmented';
import { EmptyState, ErrorState } from '@/ui/States';
import { TokenListSkeleton } from '@/ui/Skeleton';
import { Stat, StatRow } from '@/ui/Stat';
import { WatchlistRow } from '@/features/watchlist/WatchlistRow';
import { useSummaries } from '@/data/queries';
import { useWatchlist } from '@/store/watchlist';
import { useAlerts } from '@/store/alerts';
import { useSettings } from '@/store/settings';
import { MAX_COMPARE, useCompare } from '@/store/compare';
import { commit } from '@/ui/haptics';

/**
 * Watchlist.
 *
 * Saved tokens are fetched in one batched request rather than one per row, and
 * the screen leads with what changed since the user saved them — score drift is
 * the reason to keep a list at all.
 */
export default function WatchlistScreen() {
  const router = useRouter();
  const bottomPadding = useTabBarPadding();
  const refreshInterval = useSettings((s) => s.refreshIntervalSec) * 1_000;

  const entries = useWatchlist((s) => s.entries);
  const sort = useWatchlist((s) => s.sort);
  const setSort = useWatchlist((s) => s.setSort);
  const remove = useWatchlist((s) => s.remove);

  const rules = useAlerts((s) => s.rules);
  const alertsEnabled = useAlerts((s) => s.enabled);

  const addresses = useMemo(() => entries.map((e) => e.address), [entries]);
  const summaries = useSummaries(addresses, refreshInterval);

  const rows = useMemo(
    () => buildWatchlistRows(entries, summaries.data?.data, sort),
    [entries, summaries.data?.data, sort],
  );
  const stats = useMemo(() => watchlistStats(rows), [rows]);
  const origin = summaries.data?.meta.origin ?? null;

  /**
   * Alert coverage per token. Watchlist-wide and global rules apply to every
   * row, so they are counted once rather than scanned per row.
   */
  const coverage = useMemo(() => {
    let broad = 0;
    const perToken = new Map<string, number>();
    if (alertsEnabled) {
      for (const rule of rules) {
        if (!rule.enabled) continue;
        if (rule.scope.type === 'token') {
          perToken.set(rule.scope.address, (perToken.get(rule.scope.address) ?? 0) + 1);
        } else {
          broad += 1;
        }
      }
    }
    return { broad, perToken };
  }, [rules, alertsEnabled]);

  const alertCountFor = useCallback(
    (address: string) => coverage.broad + (coverage.perToken.get(address) ?? 0),
    [coverage],
  );

  const clearCompare = useCompare((s) => s.clear);
  const toggleCompare = useCompare((s) => s.toggle);

  /**
   * Seed Compare from the current sort order. Refs come from the saved entry
   * rather than the summary, so this still works before prices land.
   */
  const compareTop = useCallback(() => {
    commit();
    clearCompare();
    for (const row of rows.slice(0, MAX_COMPARE)) {
      toggleCompare({
        address: row.entry.address,
        symbol: row.entry.symbol,
        name: row.entry.name,
        logoUri: row.entry.logoUri,
        chain: 'solana',
      });
    }
    router.push('/compare');
  }, [clearCompare, rows, router, toggleCompare]);

  const comparable = Math.min(rows.length, MAX_COMPARE);

  const renderItem = useCallback(
    ({ item }: { item: RowData }) => (
      <WatchlistRow
        row={item}
        alertCount={alertCountFor(item.entry.address)}
        onRemove={() => remove(item.entry.address)}
      />
    ),
    [alertCountFor, remove],
  );

  if (entries.length === 0) {
    return (
      <Screen withTabBar>
        <View style={styles.header}>
          <Text variant="h1">Watchlist</Text>
        </View>
        <View style={styles.emptyWrap}>
          <EmptyState
            emoji="⭐"
            title="Nothing saved yet"
            message="Tokens you save appear here with their MOVA score, how it has drifted since you added them, and which alerts are watching."
            actionLabel="Find tokens"
            onAction={() => router.push('/discover')}
          />
          <Text variant="caption" tone="tertiary" center style={styles.hint}>
            Tip: long-press any token row to save it.
          </Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen withTabBar>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text variant="h1">Watchlist</Text>
          {origin ? <OriginBadge origin={origin} /> : null}
        </View>

        <Card style={styles.summary}>
          <StatRow>
            <Stat label="Tracked" value={String(stats.tracked)} />
            <Stat
              label="Average score"
              value={formatScore(stats.avgScore)}
              color={stats.avgScore == null ? undefined : scoreColor(stats.avgScore)}
              caption={stats.scored < stats.tracked ? `${stats.scored} of ${stats.tracked} scored` : undefined}
            />
            <Stat
              label="24h"
              value={
                stats.gainers + stats.losers === 0 ? NO_DATA : `${stats.gainers}↑  ${stats.losers}↓`
              }
            />
          </StatRow>

          {stats.best?.summary ? (
            <View style={styles.leader}>
              <Text variant="caption" tone="tertiary">
                {/* "Best" is misleading when every saved token is down. */}
                {(stats.best.summary.market.change24h ?? 0) > 0 ? 'Best today' : 'Holding up best'}
              </Text>
              <Text variant="labelSemi" numberOfLines={1} style={styles.leaderSymbol}>
                {stats.best.entry.symbol}
              </Text>
              <Text variant="labelSemi" tabular color={deltaColor(stats.best.summary.market.change24h)}>
                {formatPct(stats.best.summary.market.change24h)}
              </Text>
            </View>
          ) : null}
        </Card>

        <ChipRow
          options={WATCHLIST_SORTS.map((key) => ({ value: key, label: WATCHLIST_SORT_LABELS[key] }))}
          value={sort}
          onChange={setSort}
          style={styles.chips}
          contentStyle={styles.chipsContent}
        />
      </View>

      {summaries.isLoading ? (
        <View style={styles.loading}>
          <TokenListSkeleton count={Math.min(entries.length, 6)} />
        </View>
      ) : summaries.isError ? (
        <View style={styles.loading}>
          <ErrorState
            title="Could not refresh your watchlist"
            message="Your saved tokens are safe — MOVA just could not reach the data provider for current prices."
            detail={summaries.error instanceof Error ? summaries.error.message : undefined}
            onRetry={() => void summaries.refetch()}
          />
        </View>
      ) : (
        <Animated.FlatList
          data={rows}
          keyExtractor={(item) => item.entry.address}
          renderItem={renderItem}
          itemLayoutAnimation={LinearTransition.duration(220)}
          contentContainerStyle={[styles.list, { paddingBottom: bottomPadding }]}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={Separator}
          initialNumToRender={8}
          maxToRenderPerBatch={6}
          windowSize={9}
          refreshing={summaries.isRefetching}
          onRefresh={() => void summaries.refetch()}
          ListFooterComponent={
            <Animated.View entering={FadeIn.duration(240)} style={styles.footer}>
              <Button
                label={`Compare top ${comparable}`}
                variant="secondary"
                size="sm"
                disabled={rows.length < 2}
                onPress={compareTop}
                accessibilityHint={`Opens a side-by-side comparison of the first ${comparable} tokens in this order`}
              />
              <Text variant="caption" tone="tertiary" center style={styles.footerNote}>
                Swipe a row left to remove it.
              </Text>
            </Animated.View>
          }
        />
      )}
    </Screen>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  header: {
    paddingTop: space.sm,
    gap: space.lg,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.xl,
    gap: space.md,
  },
  summary: {
    marginHorizontal: space.xl,
  },
  leader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.lg,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.border,
  },
  leaderSymbol: {
    flex: 1,
  },
  chips: {
    marginHorizontal: -space.xl,
  },
  chipsContent: {
    paddingHorizontal: space.xl,
  },
  loading: {
    flex: 1,
    paddingHorizontal: space.xl,
    paddingTop: space.lg,
  },
  list: {
    paddingHorizontal: space.xl,
    paddingTop: space.lg,
    flexGrow: 1,
  },
  separator: {
    height: space.sm,
  },
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: space['4xl'],
  },
  hint: {
    marginTop: space.lg,
  },
  footer: {
    alignItems: 'center',
    paddingTop: space['2xl'],
    gap: space.md,
  },
  footerNote: {
    paddingHorizontal: space.xl,
  },
});
