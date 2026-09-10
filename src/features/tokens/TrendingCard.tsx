import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { TokenSummary } from '@/core/types';
import { formatPct, formatPrice, formatUsdCompact } from '@/core/format';
import { deltaColor, palette, radius, scoreColor, scoreTint, space } from '@/theme';
import { PressableCard } from '@/ui/Card';
import { Text } from '@/ui/Text';
import { TokenLogo } from '@/ui/TokenLogo';
import { Sparkline } from '@/ui/Sparkline';
import { RiskBadge } from '@/ui/Badge';

export const TRENDING_CARD_WIDTH = 208;

/**
 * The rail card on Home.
 *
 * Larger than a list row and carries the sparkline at a readable size — this is
 * the browsing surface, so the shape of the move matters more than precision.
 */
function TrendingCardBase({ summary, rank }: { summary: TokenSummary; rank?: number }) {
  const router = useRouter();
  const change = summary.market.change1h;

  return (
    <PressableCard
      style={styles.card}
      accessibilityLabel={`${summary.ref.symbol}, ${formatUsdCompact(summary.market.marketCapUsd)} market cap, ${formatPct(change)} in the last hour, ${summary.score == null ? 'no score' : `MOVA score ${Math.round(summary.score)}`}`}
      onPress={() => router.push(`/token/${summary.ref.address}`)}
    >
      <View style={styles.head}>
        <TokenLogo uri={summary.ref.logoUri} symbol={summary.ref.symbol} size={36} />
        <View style={styles.headText}>
          <Text variant="bodyMedium" numberOfLines={1}>
            {summary.ref.symbol}
          </Text>
          <Text variant="caption" tone="tertiary" numberOfLines={1}>
            {summary.ref.name}
          </Text>
        </View>
        {rank != null ? (
          <View style={styles.rank}>
            <Text variant="caption" tone="tertiary" tabular>
              #{rank}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.priceRow}>
        <Text variant="h3" tabular numberOfLines={1} style={styles.price}>
          {formatPrice(summary.market.priceUsd)}
        </Text>
        <Text variant="labelSemi" tabular color={deltaColor(change)}>
          {formatPct(change)}
        </Text>
      </View>

      <Sparkline
        values={summary.spark}
        width={TRENDING_CARD_WIDTH - space.lg * 2}
        height={40}
        gradientId={`trend-${summary.ref.address}`}
        style={styles.spark}
      />

      <View style={styles.footer}>
        <View
          style={[
            styles.scorePill,
            { backgroundColor: summary.score == null ? palette.neutralDim : scoreTint(summary.score) },
          ]}
        >
          <Text
            variant="caption"
            tabular
            color={summary.score == null ? palette.textTertiary : scoreColor(summary.score)}
          >
            MOVA {summary.score == null ? '—' : Math.round(summary.score)}
          </Text>
        </View>
        <RiskBadge risk={summary.risk} />
      </View>

      <Text variant="caption" tone="tertiary" numberOfLines={1} style={styles.meta}>
        {formatUsdCompact(summary.market.marketCapUsd)} cap · {formatUsdCompact(summary.market.volume24hUsd)} vol
      </Text>
    </PressableCard>
  );
}

export const TrendingCard = memo(TrendingCardBase);

const styles = StyleSheet.create({
  card: {
    width: TRENDING_CARD_WIDTH,
    gap: space.md,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  headText: {
    flex: 1,
    minWidth: 0,
  },
  rank: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: palette.surfaceHigh,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  price: {
    flexShrink: 1,
  },
  spark: {
    marginVertical: -space.xs,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  scorePill: {
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  meta: {
    marginTop: -space.xs,
  },
});
