import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { TokenRef } from '@/core/types';
import { type MovaScore, type ScoreKey, SCORE_META } from '@/core/scoring';
import { formatPct, formatScore, formatUsdCompact, NO_DATA } from '@/core/format';
import { deltaColor, palette, radius, riskColor, riskLabel, scoreColor, space } from '@/theme';
import { Screen, PushedHeader } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { Button } from '@/ui/Button';
import { OriginBadge } from '@/ui/Badge';
import { EmptyState, ErrorState } from '@/ui/States';
import { CardSkeleton } from '@/ui/Skeleton';
import { TokenLogo } from '@/ui/TokenLogo';
import { useTokenDetails } from '@/data/queries';
import { useCompare } from '@/store/compare';
import { tap } from '@/ui/haptics';

const COLUMN_WIDTH = 92;
const LABEL_WIDTH = 116;

const SCORE_ROWS: ScoreKey[] = ['safety', 'liquidity', 'momentum', 'smartMoney', 'social'];

interface Column {
  ref: TokenRef;
  score: MovaScore | null;
  marketCapUsd: number | null;
  liquidityUsd: number | null;
  change24h: number | null;
}

/**
 * Compare.
 *
 * A matrix rather than stacked cards: the entire point is reading across a row
 * to see which token is stronger on one dimension. The best value in each row
 * is marked, but nothing here ranks the tokens overall — a token can lead on
 * momentum and still be the riskiest column on the screen.
 */
export default function CompareScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const selected = useCompare((s) => s.selected);
  const removeToken = useCompare((s) => s.remove);
  const clear = useCompare((s) => s.clear);

  const addresses = useMemo(() => selected.map((t) => t.address), [selected]);
  const details = useTokenDetails(addresses);

  const columns = useMemo<Column[]>(() => {
    const byAddress = new Map(details.items.map((item) => [item.detail.ref.address, item]));
    return selected.map((ref) => {
      const item = byAddress.get(ref.address);
      return {
        // Prefer freshly fetched metadata, but keep the column if the fetch failed.
        ref: item?.detail.ref ?? ref,
        score: item?.score ?? null,
        marketCapUsd: item?.detail.market.marketCapUsd ?? null,
        liquidityUsd: item?.detail.market.liquidityUsd ?? null,
        change24h: item?.detail.market.change24h ?? null,
      };
    });
  }, [details.items, selected]);

  if (selected.length === 0) {
    return (
      <Screen>
        <PushedHeader title="Compare" />
        <EmptyState
          emoji="⚖️"
          title="Nothing selected"
          message="Pick up to four tokens and MOVA will lay their scores side by side, so you can see where they actually differ."
          actionLabel="Browse tokens"
          onAction={() => router.push('/discover')}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <PushedHeader
        title="Compare"
        subtitle={`${selected.length} token${selected.length === 1 ? '' : 's'}`}
        right={
          <>
            {details.origin ? <OriginBadge origin={details.origin} /> : null}
            <Button label="Clear" variant="ghost" size="sm" onPress={clear} />
          </>
        }
      />

      {details.isLoading ? (
        <View style={styles.loading}>
          <CardSkeleton height={420} />
        </View>
      ) : details.isError && details.items.length === 0 ? (
        <View style={styles.loading}>
          <ErrorState
            title="Could not load these tokens"
            message="MOVA could not reach the data provider for the tokens you selected."
          />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space['3xl'] }]}
          showsVerticalScrollIndicator={false}
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.matrix}
          >
            <View>
              <HeaderRow columns={columns} onRemove={removeToken} />

              <View style={styles.section}>
                <SectionLabel text="MOVA score" />
                <MatrixRow
                  label="Overall"
                  emphasis
                  values={columns.map((c) => c.score?.total ?? null)}
                  render={(value) => (
                    <Text
                      variant="h3"
                      tabular
                      color={value == null ? palette.textTertiary : scoreColor(value)}
                    >
                      {formatScore(value)}
                    </Text>
                  )}
                />
                <MatrixRow
                  label="Confidence"
                  values={columns.map((c) => (c.score ? Math.round(c.score.confidence * 100) : null))}
                  render={(value) => (
                    <Text variant="label" tabular tone={value == null ? 'tertiary' : 'secondary'}>
                      {value == null ? NO_DATA : `${value}%`}
                    </Text>
                  )}
                  higherIsBetter={false}
                />
              </View>

              <View style={styles.section}>
                <SectionLabel text="Components" />
                {SCORE_ROWS.map((key) => (
                  <MatrixRow
                    key={key}
                    label={`${SCORE_META[key].icon}  ${SCORE_META[key].label}`}
                    values={columns.map((c) => c.score?.components.find((x) => x.key === key)?.score ?? null)}
                    render={(value) => (
                      <Text
                        variant="bodyMedium"
                        tabular
                        color={value == null ? palette.textTertiary : scoreColor(value)}
                      >
                        {formatScore(value)}
                      </Text>
                    )}
                  />
                ))}
              </View>

              <View style={styles.section}>
                <SectionLabel text="Market" />
                <MatrixRow
                  label="Market cap"
                  values={columns.map((c) => c.marketCapUsd)}
                  render={(value) => (
                    <Text variant="label" tabular tone={value == null ? 'tertiary' : 'primary'}>
                      {formatUsdCompact(value)}
                    </Text>
                  )}
                  markBest={false}
                />
                <MatrixRow
                  label="Liquidity"
                  values={columns.map((c) => c.liquidityUsd)}
                  render={(value) => (
                    <Text variant="label" tabular tone={value == null ? 'tertiary' : 'primary'}>
                      {formatUsdCompact(value)}
                    </Text>
                  )}
                />
                <MatrixRow
                  label="24h change"
                  values={columns.map((c) => c.change24h)}
                  render={(value) => (
                    <Text variant="label" tabular color={deltaColor(value)}>
                      {formatPct(value)}
                    </Text>
                  )}
                />
                <MatrixRow
                  label="Risk"
                  values={columns.map(() => null)}
                  markBest={false}
                  renderCell={(index) => {
                    const risk = columns[index]?.score?.risk;
                    if (!risk) {
                      return (
                        <Text variant="caption" tone="tertiary">
                          {NO_DATA}
                        </Text>
                      );
                    }
                    return (
                      <View style={[styles.riskPill, { backgroundColor: `${riskColor[risk]}22` }]}>
                        <Text variant="caption" color={riskColor[risk]} numberOfLines={1}>
                          {riskLabel[risk].replace(' risk', '')}
                        </Text>
                      </View>
                    );
                  }}
                />
              </View>
            </View>
          </ScrollView>

          <Text variant="caption" tone="tertiary" style={styles.note}>
            A highlighted cell is the strongest value in that row among the tokens shown. It is not a
            recommendation, and a token can lead one row while carrying the most risk overall.
          </Text>
        </ScrollView>
      )}
    </Screen>
  );
}

function HeaderRow({ columns, onRemove }: { columns: Column[]; onRemove: (address: string) => void }) {
  return (
    <View style={styles.headerRow}>
      <View style={styles.labelCell} />
      {columns.map((column) => (
        <View key={column.ref.address} style={styles.headerCell}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remove ${column.ref.symbol} from the comparison`}
            hitSlop={8}
            onPress={() => {
              tap();
              onRemove(column.ref.address);
            }}
            style={styles.remove}
          >
            <Text variant="caption" tone="tertiary">
              ✕
            </Text>
          </Pressable>
          <TokenLogo uri={column.ref.logoUri} symbol={column.ref.symbol} size={34} />
          <Text variant="labelSemi" numberOfLines={1} style={styles.headerSymbol}>
            {column.ref.symbol}
          </Text>
        </View>
      ))}
    </View>
  );
}

function SectionLabel({ text }: { text: string }) {
  return (
    <Text variant="overline" tone="tertiary" style={styles.sectionLabel}>
      {text}
    </Text>
  );
}

interface MatrixRowProps {
  label: string;
  values: (number | null)[];
  render?: (value: number | null) => React.ReactNode;
  /** Full control over a cell, for content that is not a single number. */
  renderCell?: (index: number) => React.ReactNode;
  emphasis?: boolean;
  markBest?: boolean;
  higherIsBetter?: boolean;
}

function MatrixRow({
  label,
  values,
  render,
  renderCell,
  emphasis = false,
  markBest = true,
  higherIsBetter = true,
}: MatrixRowProps) {
  const best = useMemo(() => {
    if (!markBest) return null;
    const present = values.filter((v): v is number => v != null);
    if (present.length < 2) return null;
    const target = higherIsBetter ? Math.max(...present) : Math.min(...present);
    // A row where everything ties has no winner worth marking.
    return present.every((v) => v === target) ? null : target;
  }, [higherIsBetter, markBest, values]);

  return (
    <View style={[styles.row, emphasis && styles.rowEmphasis]}>
      <View style={styles.labelCell}>
        <Text variant="label" tone="secondary" numberOfLines={2}>
          {label}
        </Text>
      </View>
      {values.map((value, index) => {
        const isBest = best != null && value === best;
        return (
          <View key={index} style={[styles.cell, isBest && styles.cellBest]}>
            {renderCell ? renderCell(index) : render ? render(value) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    paddingHorizontal: space.xl,
    paddingTop: space.lg,
  },
  content: {
    paddingBottom: space['3xl'],
  },
  matrix: {
    paddingHorizontal: space.xl,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: space.lg,
  },
  headerCell: {
    width: COLUMN_WIDTH,
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.xs,
  },
  headerSymbol: {
    maxWidth: COLUMN_WIDTH - space.sm,
  },
  remove: {
    alignSelf: 'flex-end',
    marginRight: space.xs,
    marginBottom: -space.xs,
  },
  section: {
    marginBottom: space.xl,
  },
  sectionLabel: {
    marginBottom: space.sm,
    paddingLeft: space.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.border,
  },
  rowEmphasis: {
    backgroundColor: palette.surface,
    borderRadius: radius.sm,
    borderTopWidth: 0,
    minHeight: 56,
  },
  labelCell: {
    width: LABEL_WIDTH,
    paddingRight: space.sm,
    paddingVertical: space.sm,
  },
  cell: {
    width: COLUMN_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space.sm,
    borderRadius: radius.sm,
  },
  cellBest: {
    backgroundColor: palette.brandDim,
  },
  riskPill: {
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  note: {
    marginTop: space.lg,
    paddingHorizontal: space.xl,
    lineHeight: 16,
  },
});
