import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import type { MarketOverview } from '@/core/types';
import { formatPct, formatUsdCompact, NO_DATA } from '@/core/format';
import { deltaColor, palette, radius, space } from '@/theme';
import { Card } from '@/ui/Card';
import { Text } from '@/ui/Text';
import { Skeleton } from '@/ui/Skeleton';
import { Stat, StatRow } from '@/ui/Stat';

/**
 * The market header on Home.
 *
 * Answers "what is happening right now" in one glance: SOL, how broad the move
 * is, and whether the sector is risk-on or bleeding.
 */
export function MarketPulse({ overview, loading }: { overview?: MarketOverview; loading: boolean }) {
  if (loading || !overview) {
    return (
      <Card style={styles.card}>
        <Skeleton width="38%" height={12} />
        <Skeleton width="62%" height={30} style={styles.skeletonGap} />
        <Skeleton width="100%" height={8} radius={4} style={styles.skeletonGap} />
        <View style={styles.statsRow}>
          <Skeleton width="28%" height={30} />
          <Skeleton width="28%" height={30} />
          <Skeleton width="28%" height={30} />
        </View>
      </Card>
    );
  }

  const sentiment = overview.sentiment;
  const tone = sentimentTone(sentiment);

  return (
    <Animated.View entering={FadeIn.duration(260)}>
      <Card style={styles.card}>
        <View style={styles.header}>
          <View>
            <Text variant="overline" tone="tertiary">
              Meme market
            </Text>
            <View style={styles.solRow}>
              <Text variant="h2" tabular>
                SOL {overview.solPriceUsd == null ? NO_DATA : `$${overview.solPriceUsd.toFixed(2)}`}
              </Text>
              <Text variant="labelSemi" tabular color={deltaColor(overview.solChange24h)}>
                {formatPct(overview.solChange24h)}
              </Text>
            </View>
          </View>
          <View style={[styles.sentimentPill, { backgroundColor: tone.background }]}>
            <Text variant="labelSemi" color={tone.color}>
              {tone.label}
            </Text>
          </View>
        </View>

        <SentimentMeter value={sentiment} />

        <StatRow style={styles.statsRow}>
          <Stat
            label="Advancing"
            value={overview.advancersPct == null ? NO_DATA : `${Math.round(overview.advancersPct)}%`}
            color={overview.advancersPct == null ? undefined : deltaColor(overview.advancersPct - 50)}
          />
          <Stat label="24h volume" value={formatUsdCompact(overview.totalVolume24hUsd)} />
          <Stat
            label="New tokens"
            value={overview.newTokens24h == null ? NO_DATA : overview.newTokens24h.toLocaleString('en-US')}
            caption="last 24h"
          />
        </StatRow>
      </Card>
    </Animated.View>
  );
}

/**
 * Sentiment as a position on a bar rather than a number, because the exact
 * value carries no more meaning than the region it sits in.
 */
function SentimentMeter({ value }: { value: number | null }) {
  if (value == null) {
    return (
      <View style={styles.meterBlock}>
        <View style={styles.meterTrack} />
        <Text variant="caption" tone="tertiary">
          Sentiment data unavailable
        </Text>
      </View>
    );
  }

  const clamped = Math.max(0, Math.min(100, value));

  return (
    <View style={styles.meterBlock}>
      <View style={styles.meterTrack}>
        <View style={[styles.meterFill, { width: `${clamped}%`, backgroundColor: sentimentTone(value).color }]} />
        <View style={[styles.meterMarker, { left: `${clamped}%` }]} />
      </View>
      <View style={styles.meterLabels}>
        <Text variant="caption" tone="tertiary">
          Fear
        </Text>
        <Text variant="caption" tone="tertiary">
          Neutral
        </Text>
        <Text variant="caption" tone="tertiary">
          Greed
        </Text>
      </View>
    </View>
  );
}

function sentimentTone(value: number | null): { label: string; color: string; background: string } {
  if (value == null) return { label: 'No data', color: palette.textTertiary, background: palette.neutralDim };
  if (value >= 72) return { label: 'Risk-on', color: palette.positive, background: palette.positiveDim };
  if (value >= 55) return { label: 'Constructive', color: '#5BD6C0', background: 'rgba(91, 214, 192, 0.14)' };
  if (value >= 40) return { label: 'Mixed', color: palette.warning, background: palette.warningDim };
  return { label: 'Risk-off', color: palette.negative, background: palette.negativeDim };
}

const styles = StyleSheet.create({
  card: {
    gap: space.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space.md,
  },
  solRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space.sm,
    marginTop: 2,
  },
  sentimentPill: {
    paddingHorizontal: space.md,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  meterBlock: {
    gap: space.sm,
  },
  meterTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: palette.surfaceHigh,
    overflow: 'visible',
    justifyContent: 'center',
  },
  meterFill: {
    height: 6,
    borderRadius: 3,
  },
  meterMarker: {
    position: 'absolute',
    width: 3,
    height: 14,
    borderRadius: 2,
    backgroundColor: palette.text,
    marginLeft: -1.5,
  },
  meterLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statsRow: {
    marginTop: space.xs,
  },
  skeletonGap: {
    marginTop: space.md,
  },
});
