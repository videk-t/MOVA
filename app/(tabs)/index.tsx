import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { palette, space } from '@/theme';
import { Screen, useTabBarPadding } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { Section } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { OriginBadge } from '@/ui/Badge';
import { EmptyState, ErrorState } from '@/ui/States';
import { TokenListSkeleton, CardSkeleton } from '@/ui/Skeleton';
import { Segmented } from '@/ui/Segmented';
import { MarketPulse } from '@/features/home/MarketPulse';
import { TrendingCard, TRENDING_CARD_WIDTH } from '@/features/tokens/TrendingCard';
import { TokenRow } from '@/features/tokens/TokenRow';
import { AlertRow } from '@/features/alerts/AlertRow';
import { MovaWordmark } from '@/features/brand/Wordmark';
import { useMarketOverview, useRefreshAll, useTopMovers, useTrending, useUnusualVolume } from '@/data/queries';
import { useAlerts } from '@/store/alerts';
import { useSettings } from '@/store/settings';

type MoversTab = 'movers' | 'unusual';

/**
 * Home answers one question: what is happening in the memecoin market right
 * now. Market state first, then what is moving, then what MOVA has flagged —
 * broad to specific, so the screen is useful whether you read one line or all
 * of it.
 */
export default function HomeScreen() {
  const router = useRouter();
  const bottomPadding = useTabBarPadding();
  const refreshInterval = useSettings((s) => s.refreshIntervalSec) * 1_000;

  const overview = useMarketOverview(refreshInterval);
  const trending = useTrending(refreshInterval);
  const movers = useTopMovers();
  const unusual = useUnusualVolume();

  const [moversTab, setMoversTab] = useState<MoversTab>('movers');
  const [refreshing, setRefreshing] = useState(false);
  const refreshAll = useRefreshAll();

  const events = useAlerts((s) => s.events);
  const recentAlerts = events.slice(0, 3);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshAll();
    } finally {
      setRefreshing(false);
    }
  }, [refreshAll]);

  const origin = overview.data?.meta.origin ?? trending.data?.meta.origin ?? null;
  const secondary = moversTab === 'movers' ? movers : unusual;

  return (
    <Screen withTabBar>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottomPadding }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={palette.textSecondary}
            colors={[palette.brand]}
            progressBackgroundColor={palette.surface}
          />
        }
      >
        <View style={styles.header}>
          <View>
            <MovaWordmark size={22} />
            <Text variant="caption" tone="tertiary" style={styles.tagline}>
              Know the meme before you trade it.
            </Text>
          </View>
          {origin ? <OriginBadge origin={origin} /> : null}
        </View>

        {overview.isError ? (
          <ErrorState
            title="Market data is unavailable"
            message="MOVA could not reach the data provider. Everything else still works."
            onRetry={() => void overview.refetch()}
            style={styles.blockGap}
          />
        ) : (
          <MarketPulse overview={overview.data?.data} loading={overview.isLoading} />
        )}

        <Animated.View entering={FadeInDown.delay(60).duration(300)} style={styles.sectionGap}>
          <Section
            title="Trending now"
            subtitle="Highest turnover against pool size"
            action={
              <Button label="Discover" size="sm" variant="ghost" onPress={() => router.push('/discover')} />
            }
          >
            {trending.isLoading ? (
              <View style={styles.railSkeleton}>
                <CardSkeleton height={186} />
              </View>
            ) : trending.isError ? (
              <ErrorState compact onRetry={() => void trending.refetch()} />
            ) : trending.data && trending.data.data.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.rail}
                snapToInterval={TRENDING_CARD_WIDTH + space.md}
                decelerationRate="fast"
              >
                {trending.data.data.map((summary, i) => (
                  <TrendingCard key={summary.ref.address} summary={summary} rank={i + 1} />
                ))}
              </ScrollView>
            ) : (
              <EmptyState
                compact
                emoji="🌱"
                title="Nothing trending"
                message="No token currently shows unusual turnover against its pool."
              />
            )}
          </Section>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(120).duration(300)}>
          <Section
            title="Movers"
            subtitle={
              moversTab === 'movers' ? 'Largest 24h moves' : 'Volume far out of line with pool depth'
            }
          >
            <Segmented
              options={[
                { value: 'movers', label: 'Biggest movers' },
                { value: 'unusual', label: 'Unusual volume' },
              ]}
              value={moversTab}
              onChange={setMoversTab}
              accessibilityLabel="Movers list type"
              style={styles.segmented}
            />

            {secondary.isLoading ? (
              <TokenListSkeleton count={4} />
            ) : secondary.isError ? (
              <ErrorState compact onRetry={() => void secondary.refetch()} />
            ) : secondary.data && secondary.data.data.length > 0 ? (
              <View style={styles.list}>
                {secondary.data.data.slice(0, 6).map((summary) => (
                  <TokenRow
                    key={summary.ref.address}
                    summary={summary}
                    window={moversTab === 'movers' ? '24h' : '1h'}
                  />
                ))}
              </View>
            ) : (
              <EmptyState
                compact
                emoji="😴"
                title="Quiet right now"
                message={
                  moversTab === 'movers'
                    ? 'Nothing has made a significant move in the last 24 hours.'
                    : 'No token is trading at unusual volume against its pool.'
                }
              />
            )}
          </Section>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(180).duration(300)}>
          <Section
            title="Recent alerts"
            subtitle={recentAlerts.length > 0 ? 'From your alert rules' : undefined}
            action={
              events.length > 0 ? (
                <Button label="See all" size="sm" variant="ghost" onPress={() => router.push('/alerts')} />
              ) : undefined
            }
          >
            {recentAlerts.length > 0 ? (
              <View style={styles.list}>
                {recentAlerts.map((event) => (
                  <AlertRow key={event.id} event={event} compact />
                ))}
              </View>
            ) : (
              <EmptyState
                compact
                emoji="🔔"
                title="No alerts yet"
                message="MOVA checks your watchlist in the background. Add a token or a rule and alerts will appear here."
                actionLabel="Set up alerts"
                onAction={() => router.push('/alerts')}
              />
            )}
          </Section>
        </Animated.View>

        <View style={styles.tools}>
          <Text variant="overline" tone="tertiary" style={styles.toolsLabel}>
            Tools
          </Text>
          <View style={styles.toolButtons}>
            <Button
              label="Risk calculator"
              variant="secondary"
              size="sm"
              onPress={() => router.push('/tools/risk')}
              style={styles.toolButton}
            />
            <Button
              label="Journal"
              variant="secondary"
              size="sm"
              onPress={() => router.push('/tools/journal')}
              style={styles.toolButton}
            />
            <Button
              label="Paper trading"
              variant="secondary"
              size="sm"
              onPress={() => router.push('/tools/paper')}
              style={styles.toolButton}
            />
          </View>
        </View>

        <Text variant="caption" tone="tertiary" center style={styles.footer}>
          MOVA provides research and analytics. Trading is performed on external platforms.
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: space.xl,
    paddingTop: space.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: space.xl,
    gap: space.md,
  },
  tagline: {
    marginTop: 4,
  },
  blockGap: {
    marginBottom: space.lg,
  },
  sectionGap: {
    marginTop: space['2xl'],
  },
  rail: {
    gap: space.md,
    paddingRight: space.xl,
  },
  railSkeleton: {
    paddingRight: space.xl,
  },
  segmented: {
    marginBottom: space.md,
  },
  list: {
    gap: space.sm,
  },
  tools: {
    marginBottom: space.xl,
  },
  toolsLabel: {
    marginBottom: space.md,
    paddingHorizontal: space.xs,
  },
  toolButtons: {
    flexDirection: 'row',
    gap: space.sm,
  },
  toolButton: {
    flex: 1,
  },
  footer: {
    marginTop: space.sm,
    marginBottom: space.lg,
    paddingHorizontal: space.lg,
    lineHeight: 16,
  },
});
