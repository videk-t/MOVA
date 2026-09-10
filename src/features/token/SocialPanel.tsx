import { StyleSheet, View } from 'react-native';
import type { SocialAuthenticity, SocialSignal } from '@/core/types';
import { formatCompactNumber, formatPct, NO_DATA } from '@/core/format';
import { isNum } from '@/core/math';
import { palette, radius, space } from '@/theme';
import { Card } from '@/ui/Card';
import { Text } from '@/ui/Text';
import { Button } from '@/ui/Button';
import { Stat, StatRow } from '@/ui/Stat';
import { EmptyState } from '@/ui/States';
import { openUrl } from '@/data/venues';

const AUTHENTICITY: Record<SocialAuthenticity, { label: string; color: string; background: string; blurb: string }> = {
  organic: {
    label: 'Looks organic',
    color: palette.positive,
    background: palette.positiveDim,
    blurb: 'Posts come from a broad set of accounts with varied phrasing and timing.',
  },
  mixed: {
    label: 'Mixed',
    color: palette.warning,
    background: palette.warningDim,
    blurb: 'Some genuine discussion alongside a noticeable amount of repetitive posting.',
  },
  coordinated: {
    label: 'Likely coordinated',
    color: palette.negative,
    background: palette.negativeDim,
    blurb: 'Posting patterns cluster in time and wording in a way that rarely happens naturally.',
  },
  unknown: {
    label: 'Not assessed',
    color: palette.textTertiary,
    background: palette.neutralDim,
    blurb: 'There was not enough social data to judge how organic the attention is.',
  },
};

/**
 * Social signal.
 *
 * Attention is reported as a measurement with an explicit confidence, never as
 * a verdict. Bot detection is a heuristic over posting patterns, so the wording
 * throughout says "looks like" rather than "is".
 */
export function SocialPanel({ social }: { social: SocialSignal }) {
  const hasData = isNum(social.mentions24h) || isNum(social.uniqueAuthors24h);
  const links = [
    { label: 'Website', url: social.links.website },
    { label: 'X', url: social.links.twitter },
    { label: 'Telegram', url: social.links.telegram },
  ].filter((l): l is { label: string; url: string } => l.url != null);

  if (!hasData) {
    return (
      <Card>
        <EmptyState
          compact
          emoji="📱"
          title="No social coverage"
          message="The current provider has no mention data for this token. That is common for very new or very small tokens, and is not itself a negative signal."
        />
        {links.length > 0 ? (
          <View style={styles.links}>
            {links.map((link) => (
              <Button
                key={link.label}
                label={link.label}
                variant="secondary"
                size="sm"
                onPress={() => void openUrl(link.url)}
              />
            ))}
          </View>
        ) : null}
      </Card>
    );
  }

  const verdict = AUTHENTICITY[social.authenticity];

  return (
    <Card style={styles.card}>
      <View style={[styles.verdict, { backgroundColor: verdict.background }]}>
        <Text variant="labelSemi" color={verdict.color}>
          {verdict.label}
        </Text>
        <Text variant="caption" tone="secondary" style={styles.verdictBlurb}>
          {verdict.blurb}
        </Text>
      </View>

      <StatRow>
        <Stat label="Mentions 24h" value={formatCompactNumber(social.mentions24h)} />
        <Stat
          label="Growth"
          value={formatPct(social.mentionsGrowthPct, 0)}
          color={
            social.mentionsGrowthPct == null
              ? undefined
              : social.mentionsGrowthPct > 0
                ? palette.positive
                : palette.negative
          }
        />
        <Stat label="Accounts" value={formatCompactNumber(social.uniqueAuthors24h)} />
      </StatRow>

      <StatRow>
        <Stat
          label="Automated-looking"
          value={social.botLikelihoodPct == null ? NO_DATA : `${Math.round(social.botLikelihoodPct)}%`}
          color={
            social.botLikelihoodPct == null
              ? undefined
              : social.botLikelihoodPct >= 45
                ? palette.negative
                : social.botLikelihoodPct >= 25
                  ? palette.warning
                  : palette.positive
          }
          caption="of sampled posts"
        />
        <Stat
          label="Larger accounts"
          value={social.kolMentions24h == null ? NO_DATA : String(social.kolMentions24h)}
          caption="mentions in 24h"
        />
      </StatRow>

      {links.length > 0 ? (
        <View style={styles.links}>
          {links.map((link) => (
            <Button
              key={link.label}
              label={link.label}
              variant="secondary"
              size="sm"
              onPress={() => void openUrl(link.url)}
              accessibilityHint="Opens in an in-app browser"
            />
          ))}
        </View>
      ) : (
        <Text variant="caption" tone="tertiary">
          No project links published in the token metadata.
        </Text>
      )}

      <Text variant="caption" tone="tertiary" style={styles.note}>
        Bot classification is a pattern heuristic, not a verified fact. High attention describes interest, not
        the quality of what people are interested in.
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space.lg,
  },
  verdict: {
    padding: space.md,
    borderRadius: radius.md,
    gap: 3,
  },
  verdictBlurb: {
    lineHeight: 16,
  },
  links: {
    flexDirection: 'row',
    gap: space.sm,
    flexWrap: 'wrap',
  },
  note: {
    lineHeight: 15,
  },
});
