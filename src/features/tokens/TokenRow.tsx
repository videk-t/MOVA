import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { TokenSummary } from '@/core/types';
import { formatPct, formatPrice, formatUsdCompact } from '@/core/format';
import { deltaColor, palette, radius, riskColor, scoreColor, space } from '@/theme';
import { PressableCard } from '@/ui/Card';
import { Text } from '@/ui/Text';
import { TokenLogo } from '@/ui/TokenLogo';
import { Sparkline } from '@/ui/Sparkline';
import { useWatchlist } from '@/store/watchlist';
import { commit } from '@/ui/haptics';

export interface TokenRowProps {
  summary: TokenSummary;
  /** Which change window the row emphasises. */
  window?: '1h' | '24h';
  /** Adds a right-hand accessory instead of the score dot. */
  right?: React.ReactNode;
  onPress?: () => void;
}

/**
 * The standard token row, shared by Home, Discover, Watchlist and search.
 *
 * Tap opens the token; long-press adds or removes it from the watchlist, so a
 * list can be triaged without leaving it.
 */
function TokenRowBase({ summary, window = '1h', right, onPress }: TokenRowProps) {
  const router = useRouter();
  const toggle = useWatchlist((s) => s.toggle);
  const watched = useWatchlist((s) => s.entries.some((e) => e.address === summary.ref.address));

  const change = window === '1h' ? summary.market.change1h : summary.market.change24h;
  const changeColor = deltaColor(change);

  return (
    <PressableCard
      padded={false}
      style={styles.card}
      accessibilityLabel={buildLabel(summary, change, window, watched)}
      accessibilityHint="Opens the full token analysis. Long press to add or remove from your watchlist."
      onPress={onPress ?? (() => router.push(`/token/${summary.ref.address}`))}
      onLongPress={() => {
        commit();
        toggle(summary.ref, summary.score);
      }}
    >
      <View style={styles.row}>
        <View>
          <TokenLogo uri={summary.ref.logoUri} symbol={summary.ref.symbol} size={42} />
          {watched ? <View style={styles.watchDot} /> : null}
        </View>

        <View style={styles.identity}>
          <View style={styles.symbolRow}>
            <Text variant="bodyMedium" numberOfLines={1} style={styles.symbol}>
              {summary.ref.symbol}
            </Text>
            <View style={[styles.riskDot, { backgroundColor: riskColor[summary.risk] }]} />
          </View>
          <Text variant="caption" tone="tertiary" numberOfLines={1}>
            {formatUsdCompact(summary.market.marketCapUsd)} cap
          </Text>
        </View>

        <Sparkline values={summary.spark} width={44} height={24} gradientId={`row-${summary.ref.address}`} />

        <View style={styles.numbers}>
          <Text variant="bodyMedium" tabular numberOfLines={1}>
            {formatPrice(summary.market.priceUsd)}
          </Text>
          <Text variant="caption" tabular color={changeColor} numberOfLines={1}>
            {formatPct(change)}
          </Text>
        </View>

        {right ?? (
          <View style={styles.scoreChip}>
            <Text
              variant="labelSemi"
              tabular
              color={summary.score == null ? palette.textTertiary : scoreColor(summary.score)}
            >
              {summary.score == null ? '—' : Math.round(summary.score)}
            </Text>
          </View>
        )}
      </View>
    </PressableCard>
  );
}

function buildLabel(
  summary: TokenSummary,
  change: number | null,
  window: '1h' | '24h',
  watched: boolean,
): string {
  const parts = [
    summary.ref.symbol,
    summary.ref.name,
    `price ${formatPrice(summary.market.priceUsd)}`,
    `${window} change ${formatPct(change)}`,
    summary.score == null ? 'no MOVA score' : `MOVA score ${Math.round(summary.score)}`,
    `${summary.risk} risk`,
  ];
  if (watched) parts.push('on your watchlist');
  return parts.join(', ');
}

export const TokenRow = memo(TokenRowBase);

const styles = StyleSheet.create({
  card: {
    paddingVertical: space.md,
    paddingHorizontal: space.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    // Tight gaps: on a 375pt screen this row carries six columns, and the
    // ticker is the one that must never be the thing that gets squeezed.
    gap: space.sm,
  },
  identity: {
    flex: 1,
    minWidth: 0,
  },
  symbolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  symbol: {
    flexShrink: 1,
  },
  riskDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  numbers: {
    alignItems: 'flex-end',
    minWidth: 72,
    // Capped so an unusually large price cannot expand into the ticker's space.
    maxWidth: 96,
    flexShrink: 0,
  },
  scoreChip: {
    minWidth: 34,
    height: 30,
    paddingHorizontal: space.sm,
    borderRadius: radius.sm,
    backgroundColor: palette.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  watchDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: palette.brandBright,
    borderWidth: 2,
    borderColor: palette.surface,
  },
});
