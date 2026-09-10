import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import type { ScoreComponent } from '@/core/scoring';
import type { Timeframe } from '@/core/types';
import {
  formatAge,
  formatCompactNumber,
  formatPct,
  formatPrice,
  formatUsdCompact,
  NO_DATA,
  shortenAddress,
} from '@/core/format';
import { tokenAgeHours } from '@/core/scoring';
import { ratio } from '@/core/math';
import { deltaColor, palette, radius, riskColor, riskDim, space } from '@/theme';
import { Screen, PushedHeader } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { Card, Section } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { Badge, OriginBadge, RiskBadge } from '@/ui/Badge';
import { Segmented } from '@/ui/Segmented';
import { ScoreRing } from '@/ui/ScoreRing';
import { ScoreBars } from '@/ui/ScoreBars';
import { PriceChart } from '@/ui/PriceChart';
import { Stat, StatGrid } from '@/ui/Stat';
import { CardSkeleton, Skeleton } from '@/ui/Skeleton';
import { ErrorState } from '@/ui/States';
import { TokenLogo } from '@/ui/TokenLogo';
import type { SheetRef } from '@/ui/Sheet';
import { commit } from '@/ui/haptics';
import { AnalysisCard } from '@/features/token/AnalysisCard';
import { SafetyPanel } from '@/features/token/SafetyPanel';
import { SmartMoneyPanel } from '@/features/token/SmartMoneyPanel';
import { SocialPanel } from '@/features/token/SocialPanel';
import { TradeOutSheet } from '@/features/token/TradeOutSheet';
import { ScoreExplanationSheet } from '@/features/token/ScoreExplanationSheet';
import { useAnalysis, useCandles, useMovaScore, useToken, useTopHolders } from '@/data/queries';
import { useWatchlist } from '@/store/watchlist';
import { useCompare } from '@/store/compare';
import { useSettings } from '@/store/settings';

const TIMEFRAMES: { value: Timeframe; label: string }[] = [
  { value: '5m', label: '5m' },
  { value: '15m', label: '15m' },
  { value: '1h', label: '1h' },
  { value: '4h', label: '4h' },
  { value: '1d', label: '1d' },
];

/**
 * Token detail.
 *
 * Ordered by what a reader needs first: what it is and what it costs, then the
 * score with its breakdown, then the chart, then the analysis, and finally the
 * evidence panels. Everything below the score is progressive detail — the
 * screen is useful if you stop reading at any point.
 */
export default function TokenDetailScreen() {
  const params = useLocalSearchParams<{ address: string }>();
  const address = typeof params.address === 'string' ? params.address : '';
  const router = useRouter();

  const refreshInterval = useSettings((s) => s.refreshIntervalSec) * 1_000;
  const [timeframe, setTimeframe] = useState<Timeframe>('1h');
  const [selectedComponent, setSelectedComponent] = useState<ScoreComponent | null>(null);

  const tradeSheet = useRef<SheetRef>(null);
  const scoreSheet = useRef<SheetRef>(null);

  const token = useToken(address, refreshInterval);
  const detail = token.data?.data;
  const score = useMovaScore(detail);
  const candles = useCandles(address, timeframe);
  const holders = useTopHolders(address);
  const analysis = useAnalysis(detail, score);

  const watched = useWatchlist((s) => s.entries.some((e) => e.address === address));
  const toggleWatch = useWatchlist((s) => s.toggle);
  const comparing = useCompare((s) => s.selected.some((t) => t.address === address));
  const toggleCompare = useCompare((s) => s.toggle);

  const openComponent = useCallback((component: ScoreComponent) => {
    setSelectedComponent(component);
    scoreSheet.current?.open();
  }, []);

  const metrics = useMemo(() => {
    if (!detail) return [];
    const m = detail.market;
    const hourTotal = (m.txns1h.buys ?? 0) + (m.txns1h.sells ?? 0);
    const buyShare = hourTotal > 0 ? ((m.txns1h.buys ?? 0) / hourTotal) * 100 : null;
    const vlr = ratio(m.volume24hUsd, m.liquidityUsd);

    return [
      { label: 'Market cap', value: formatUsdCompact(m.marketCapUsd) },
      { label: 'Liquidity', value: formatUsdCompact(m.liquidityUsd) },
      { label: '24h volume', value: formatUsdCompact(m.volume24hUsd) },
      { label: '1h volume', value: formatUsdCompact(m.volume1hUsd) },
      { label: 'Holders', value: formatCompactNumber(m.holders) },
      { label: 'Age', value: formatAge(tokenAgeHours(m)) },
      { label: 'Vol ÷ liq', value: vlr == null ? NO_DATA : `${vlr.toFixed(2)}x` },
      {
        label: 'Buys 1h',
        value: buyShare == null ? NO_DATA : `${Math.round(buyShare)}%`,
        color: buyShare == null ? undefined : deltaColor(buyShare - 50),
      },
      { label: '24h txns', value: formatCompactNumber((m.txns24h.buys ?? 0) + (m.txns24h.sells ?? 0)) },
      { label: 'FDV', value: formatUsdCompact(m.fdvUsd) },
      { label: 'DEX', value: m.dexId ?? NO_DATA },
      { label: '6h change', value: formatPct(m.change6h), color: deltaColor(m.change6h) },
    ];
  }, [detail]);

  if (token.isLoading) return <LoadingState />;

  if (token.isError || !token.data || !detail || !score) {
    return (
      <Screen>
        <PushedHeader title="Token" />
        <View style={styles.errorWrap}>
          <ErrorState
            title="Could not load this token"
            message="The provider did not return data for this address. It may not exist, or the source may be temporarily unavailable."
            detail={token.error instanceof Error ? token.error.message : undefined}
            onRetry={() => void token.refetch()}
          />
        </View>
      </Screen>
    );
  }

  const origin = token.data.meta.origin;
  const changes: { label: string; value: number | null }[] = [
    { label: '5m', value: detail.market.change5m },
    { label: '1h', value: detail.market.change1h },
    { label: '6h', value: detail.market.change6h },
    { label: '24h', value: detail.market.change24h },
  ];

  return (
    <Screen>
      <PushedHeader
        title={detail.ref.symbol}
        subtitle={shortenAddress(detail.ref.address, 6, 6)}
        right={
          <>
            <IconToggle
              active={comparing}
              label={comparing ? 'Remove from compare' : 'Add to compare'}
              glyph="⇄"
              onPress={() => {
                const result = toggleCompare(detail.ref);
                if (result.full) return;
                commit();
              }}
            />
            <IconToggle
              active={watched}
              label={watched ? 'Remove from watchlist' : 'Add to watchlist'}
              glyph={watched ? '★' : '☆'}
              onPress={() => {
                commit();
                toggleWatch(detail.ref, score.total);
              }}
            />
          </>
        }
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeIn.duration(240)}>
          <Card style={styles.hero}>
            <View style={styles.heroHead}>
              <TokenLogo uri={detail.ref.logoUri} symbol={detail.ref.symbol} size={52} />
              <View style={styles.heroIdentity}>
                <Text variant="h2" numberOfLines={1}>
                  {detail.ref.symbol}
                </Text>
                <Text variant="caption" tone="tertiary" numberOfLines={2}>
                  {detail.ref.name}
                </Text>
              </View>
              <OriginBadge origin={origin} />
            </View>

            <View style={styles.priceBlock}>
              <Text variant="display" tabular numberOfLines={1} adjustsFontSizeToFit>
                {formatPrice(detail.market.priceUsd)}
              </Text>
              <View style={styles.capRow}>
                <Text variant="bodyMedium" tone="secondary" tabular>
                  {formatUsdCompact(detail.market.marketCapUsd)} market cap
                </Text>
                <Text variant="bodyMedium" tabular color={deltaColor(detail.market.change24h)}>
                  {formatPct(detail.market.change24h)}
                </Text>
              </View>
            </View>

            <View style={styles.changeRow}>
              {changes.map((change) => (
                <View key={change.label} style={styles.changeCell}>
                  <Text variant="caption" tone="tertiary">
                    {change.label}
                  </Text>
                  <Text variant="labelSemi" tabular color={deltaColor(change.value)}>
                    {formatPct(change.value)}
                  </Text>
                </View>
              ))}
            </View>
          </Card>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(60).duration(300)} style={styles.sectionGap}>
          <Card style={styles.scoreCard}>
            <View style={styles.scoreHead}>
              <ScoreRing score={score.total} size={128} label="MOVA score" />
              <View style={styles.scoreMeta}>
                <RiskBadge risk={score.risk} size="md" />
                {score.total == null ? (
                  <Text variant="caption" tone="tertiary" style={styles.scoreNote}>
                    {score.unavailableReason}
                  </Text>
                ) : (
                  <Text variant="caption" tone="tertiary" style={styles.scoreNote}>
                    Based on {Math.round(score.confidence * 100)}% signal coverage. Tap any component to see what
                    produced it.
                  </Text>
                )}
                {score.risk === 'high' && score.total != null && score.total >= 60 ? (
                  <View style={[styles.riskCallout, { backgroundColor: riskDim.high }]}>
                    <Text variant="caption" color={riskColor.high} style={styles.riskCalloutText}>
                      A high score and high risk are not a contradiction. The score reflects all five components;
                      risk reflects only structure, depth and age.
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>

            <ScoreBars components={score.components} onSelect={openComponent} style={styles.scoreBars} />
          </Card>
        </Animated.View>

        <Section title="Price" style={styles.sectionGap}>
          <Card>
            <Segmented
              options={TIMEFRAMES}
              value={timeframe}
              onChange={setTimeframe}
              accessibilityLabel="Chart timeframe"
              style={styles.timeframes}
            />
            {candles.isLoading && !candles.data ? (
              <Skeleton width="100%" height={220} radius={radius.md} />
            ) : candles.isError ? (
              <ErrorState compact title="Chart unavailable" onRetry={() => void candles.refetch()} />
            ) : (
              <PriceChart candles={candles.data?.data ?? []} height={220} />
            )}
          </Card>
        </Section>

        <Section title="MOVA analysis" subtitle="What the data shows, and what it does not">
          <AnalysisCard analysis={analysis.data?.data} loading={analysis.isLoading} origin={origin} />
        </Section>

        <Section title="Safety" subtitle="Contract permissions, pool status and distribution">
          <SafetyPanel
            security={detail.security}
            holders={holders.data?.data ?? []}
            holdersLoading={holders.isLoading}
          />
        </Section>

        <Section title="Smart money" subtitle="What large wallets have been doing">
          <SmartMoneyPanel smartMoney={detail.smartMoney} />
        </Section>

        <Section title="Social" subtitle="Attention, and how organic it looks">
          <SocialPanel social={detail.social} />
        </Section>

        <Section title="Market data">
          <Card>
            <StatGrid>
              {metrics.map((metric) => (
                <View key={metric.label} style={styles.metricCell}>
                  <Stat label={metric.label} value={metric.value} color={metric.color} />
                </View>
              ))}
            </StatGrid>
          </Card>
        </Section>

        <Section title="Act on this">
          <View style={styles.actions}>
            <Button
              label={`Trade ${detail.ref.symbol}`}
              onPress={() => tradeSheet.current?.open()}
              fullWidth
              accessibilityHint="Opens a list of external platforms where this token can be traded"
            />
            <View style={styles.actionRow}>
              <Button
                label="Size a position"
                variant="secondary"
                onPress={() =>
                  router.push({
                    pathname: '/tools/risk',
                    params: {
                      symbol: detail.ref.symbol,
                      price: String(detail.market.priceUsd ?? ''),
                    },
                  })
                }
                style={styles.actionHalf}
              />
              <Button
                label="Paper trade"
                variant="secondary"
                onPress={() =>
                  router.push({
                    pathname: '/tools/trade',
                    params: {
                      mode: 'paper',
                      address: detail.ref.address,
                      symbol: detail.ref.symbol,
                      price: String(detail.market.priceUsd ?? ''),
                      score: score.total == null ? '' : String(score.total),
                    },
                  })
                }
                style={styles.actionHalf}
              />
            </View>
            <View style={styles.actionRow}>
              <Button
                label="Set an alert"
                variant="secondary"
                onPress={() =>
                  router.push({
                    pathname: '/alerts/new',
                    params: { address: detail.ref.address, symbol: detail.ref.symbol },
                  })
                }
                style={styles.actionHalf}
                accessibilityHint={`Creates an alert rule scoped to ${detail.ref.symbol}`}
              />
              <Button
                label={comparing ? 'In comparison' : 'Compare'}
                variant={comparing ? 'ghost' : 'secondary'}
                onPress={() => {
                  toggleCompare(detail.ref);
                  commit();
                }}
                style={styles.actionHalf}
              />
            </View>
          </View>
        </Section>

        <View style={styles.disclaimer}>
          <Badge label="Research only" tone="neutral" size="sm" />
          <Text variant="caption" tone="tertiary" style={styles.disclaimerText}>
            MOVA provides research and analytics. It does not execute trades, hold funds, or connect to a wallet.
            Scores describe measured conditions and are not predictions.
            {origin === 'mock' ? ' The figures on this screen come from demo data.' : ''}
          </Text>
        </View>
      </ScrollView>

      <TradeOutSheet ref={tradeSheet} token={detail.ref} />
      <ScoreExplanationSheet ref={scoreSheet} component={selectedComponent} />
    </Screen>
  );
}

function IconToggle({
  active,
  label,
  glyph,
  onPress,
}: {
  active: boolean;
  label: string;
  glyph: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      hitSlop={8}
      style={[styles.iconToggle, active && styles.iconToggleActive]}
    >
      <Text variant="bodyMedium" tone={active ? 'brand' : 'secondary'}>
        {glyph}
      </Text>
    </Pressable>
  );
}

function LoadingState() {
  return (
    <Screen>
      <PushedHeader title="Loading" />
      <View style={styles.content}>
        <CardSkeleton height={168} />
        <View style={styles.loadingGap}>
          <CardSkeleton height={280} />
        </View>
        <View style={styles.loadingGap}>
          <CardSkeleton height={260} />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: space.xl,
    paddingBottom: space['4xl'],
  },
  errorWrap: {
    paddingHorizontal: space.xl,
    paddingTop: space['3xl'],
  },
  loadingGap: {
    marginTop: space.lg,
  },
  hero: {
    gap: space.lg,
  },
  heroHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  heroIdentity: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  priceBlock: {
    gap: space.xs,
  },
  capRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: space.md,
  },
  changeRow: {
    flexDirection: 'row',
    borderRadius: radius.md,
    backgroundColor: palette.bgElevated,
    paddingVertical: space.md,
  },
  changeCell: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  sectionGap: {
    marginTop: space.lg,
  },
  scoreCard: {
    gap: space.xl,
  },
  scoreHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
  },
  scoreMeta: {
    flex: 1,
    gap: space.sm,
  },
  scoreNote: {
    lineHeight: 16,
  },
  riskCallout: {
    padding: space.sm,
    borderRadius: radius.sm,
  },
  riskCalloutText: {
    lineHeight: 15,
  },
  scoreBars: {
    marginTop: -space.xs,
  },
  timeframes: {
    marginBottom: space.lg,
  },
  metricCell: {
    width: '33.33%',
    paddingRight: space.md,
  },
  actions: {
    gap: space.sm,
  },
  actionRow: {
    flexDirection: 'row',
    gap: space.sm,
  },
  actionHalf: {
    flex: 1,
  },
  iconToggle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  iconToggleActive: {
    backgroundColor: palette.brandDim,
    borderColor: palette.brand,
  },
  disclaimer: {
    marginTop: space.lg,
    padding: space.lg,
    borderRadius: radius.md,
    backgroundColor: palette.bgElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    gap: space.sm,
  },
  disclaimerText: {
    lineHeight: 16,
  },
});
