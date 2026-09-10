import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { formatRelativeTime } from '@/core/format';
import { palette, radius, space } from '@/theme';
import { Card } from '@/ui/Card';
import { Text } from '@/ui/Text';
import { Skeleton } from '@/ui/Skeleton';
import type { AiAnalysis, AiTone } from '@/data/providers/types';

const TONE: Record<AiTone, { color: string; background: string; label: string; glyph: string }> = {
  positive: { color: palette.positive, background: palette.positiveDim, label: 'Positive', glyph: '+' },
  neutral: { color: palette.info, background: palette.infoDim, label: 'Neutral', glyph: '·' },
  warning: { color: palette.warning, background: palette.warningDim, label: 'Warning', glyph: '!' },
};

/**
 * MOVA Analysis.
 *
 * Reads the data and says what it means. Every claim traces to a field that was
 * actually present, and anything the providers could not supply is listed
 * explicitly rather than quietly omitted — a reader needs to know the
 * difference between "this checked out" and "this was never checked".
 */
export function AnalysisCard({
  analysis,
  loading,
  origin,
}: {
  analysis?: AiAnalysis;
  loading: boolean;
  origin?: 'live' | 'mock';
}) {
  if (loading || !analysis) {
    return (
      <Card style={styles.card}>
        <Text variant="overline" tone="tertiary">
          MOVA analysis
        </Text>
        <Skeleton width="85%" height={18} />
        <Skeleton width="100%" height={58} radius={radius.md} />
        <Skeleton width="100%" height={58} radius={radius.md} />
      </Card>
    );
  }

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text variant="overline" tone="tertiary">
          MOVA analysis
        </Text>
        <Text variant="caption" tone="tertiary">
          {formatRelativeTime(analysis.generatedAt)}
        </Text>
      </View>

      <Text variant="h3" style={styles.headline}>
        {analysis.headline}
      </Text>

      <View style={styles.sections}>
        {analysis.sections.map((section, index) => {
          const tone = TONE[section.tone];
          return (
            <Animated.View
              key={`${section.title}-${index}`}
              entering={FadeIn.delay(index * 60).duration(240)}
              style={[styles.section, { borderLeftColor: tone.color }]}
            >
              <View style={styles.sectionHead}>
                <View style={[styles.toneChip, { backgroundColor: tone.background }]}>
                  <Text variant="caption" color={tone.color}>
                    {tone.label}
                  </Text>
                </View>
                <Text variant="labelSemi" style={styles.sectionTitle} numberOfLines={2}>
                  {section.title}
                </Text>
              </View>
              <Text variant="body" tone="secondary" style={styles.sectionBody}>
                {section.body}
              </Text>
            </Animated.View>
          );
        })}
      </View>

      {analysis.dataGaps.length > 0 ? (
        <View style={styles.gaps}>
          <Text variant="labelSemi" tone="tertiary">
            Not included — data unavailable
          </Text>
          <Text variant="caption" tone="tertiary" style={styles.gapList}>
            {analysis.dataGaps.join(' · ')}
          </Text>
          <Text variant="caption" tone="tertiary" style={styles.gapNote}>
            These signals were missing from the provider, so the analysis above does not account for them.
          </Text>
        </View>
      ) : null}

      <Text variant="caption" tone="tertiary" style={styles.disclaimer}>
        This describes what the data shows. It is not advice, and it does not predict what the price will do
        next.{origin === 'mock' ? ' Generated from demo data.' : ''}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headline: {
    lineHeight: 24,
  },
  sections: {
    gap: space.md,
  },
  section: {
    borderLeftWidth: 2,
    paddingLeft: space.md,
    gap: 6,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  toneChip: {
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  sectionTitle: {
    flex: 1,
  },
  sectionBody: {
    lineHeight: 20,
  },
  gaps: {
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: palette.bgElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    gap: 4,
  },
  gapList: {
    lineHeight: 16,
  },
  gapNote: {
    marginTop: 2,
    lineHeight: 15,
  },
  disclaimer: {
    lineHeight: 15,
  },
});
