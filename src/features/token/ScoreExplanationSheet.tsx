import { forwardRef } from 'react';
import { StyleSheet, View } from 'react-native';
import type { ScoreComponent } from '@/core/scoring';
import { SCORE_META } from '@/core/scoring';
import { palette, radius, scoreBand, scoreColor, space } from '@/theme';
import { Sheet, type SheetRef } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { ScoreRing } from '@/ui/ScoreRing';

/**
 * The explanation behind one score component.
 *
 * A score nobody can interrogate is just an opinion with a number attached.
 * This sheet shows what the component measures, what it found, and how much it
 * contributes to the total — in the order a reader actually needs them.
 */
export const ScoreExplanationSheet = forwardRef<SheetRef, { component: ScoreComponent | null }>(
  function ScoreExplanationSheet({ component }, ref) {
    if (!component) {
      return <Sheet ref={ref} snapPoints={['50%']} title="Score detail" />;
    }

    const meta = SCORE_META[component.key];
    const color = component.score == null ? palette.textTertiary : scoreColor(component.score);

    return (
      <Sheet ref={ref} snapPoints={['72%']}>
        <View style={styles.header}>
          <ScoreRing score={component.score} size={104} strokeWidth={8} showBand={false} />
          <View style={styles.headerText}>
            <Text variant="overline" tone="tertiary">
              {component.icon} {meta.label}
            </Text>
            <Text variant="h2" color={color}>
              {component.score == null ? 'Data unavailable' : scoreBand(component.score)}
            </Text>
            <Text variant="caption" tone="tertiary">
              {Math.round(component.weight * 100)}% of the total MOVA score
            </Text>
          </View>
        </View>

        <View style={styles.block}>
          <Text variant="labelSemi" tone="secondary">
            What this measures
          </Text>
          <Text variant="body" tone="secondary" style={styles.paragraph}>
            {meta.blurb}
          </Text>
        </View>

        <View style={styles.block}>
          <Text variant="labelSemi" tone="secondary">
            What MOVA found
          </Text>
          <Text variant="body" style={styles.summary}>
            {component.summary}
          </Text>
        </View>

        <View style={styles.block}>
          <Text variant="labelSemi" tone="secondary">
            Signals behind this score
          </Text>
          <View style={styles.reasons}>
            {component.reasons.map((reason, index) => (
              <View key={`${index}-${reason.slice(0, 24)}`} style={styles.reason}>
                <View style={[styles.bullet, { backgroundColor: color }]} />
                <Text variant="body" tone="secondary" style={styles.reasonText}>
                  {reason}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.coverage}>
          <Text variant="caption" tone="tertiary" style={styles.coverageText}>
            {component.coverage >= 0.99
              ? 'Every signal in this component had data behind it.'
              : `${Math.round(component.coverage * 100)}% of this component's signals had data. The rest were excluded rather than counted as zero, so a missing signal does not lower the score.`}
          </Text>
        </View>
      </Sheet>
    );
  },
);

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    marginBottom: space['2xl'],
  },
  headerText: {
    flex: 1,
    gap: 3,
  },
  block: {
    gap: space.sm,
    marginBottom: space.xl,
  },
  paragraph: {
    lineHeight: 21,
  },
  summary: {
    lineHeight: 22,
  },
  reasons: {
    gap: space.md,
  },
  reason: {
    flexDirection: 'row',
    gap: space.md,
    alignItems: 'flex-start',
  },
  bullet: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginTop: 8,
  },
  reasonText: {
    flex: 1,
    lineHeight: 20,
  },
  coverage: {
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: palette.bgElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  coverageText: {
    lineHeight: 16,
  },
});
