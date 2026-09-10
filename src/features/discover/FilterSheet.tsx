import { forwardRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { RiskLevel } from '@/core/types';
import { formatUsdCompact } from '@/core/format';
import { palette, radius, riskColor, riskDim, space } from '@/theme';
import { Sheet, type SheetRef } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { Button } from '@/ui/Button';
import { ToggleRow } from '@/ui/Field';
import { select } from '@/ui/haptics';
import type { DiscoverFilters, Range, SortKey } from '@/data/providers/types';
import { DEFAULT_FILTERS } from '@/data/providers/types';

/**
 * Advanced filters.
 *
 * Kept behind a sheet on purpose: the presets on the Discover screen cover the
 * common questions, and putting eleven range controls on the main surface would
 * make the screen unusable for everyone who does not need them.
 *
 * Ranges are chosen from labelled buckets rather than free-typed numbers —
 * "under $100K" is a decision a user can make; "$97,431" is not.
 */

interface Bucket {
  label: string;
  range: Range;
}

const MARKET_CAP: Bucket[] = [
  { label: 'Any', range: { min: null, max: null } },
  { label: 'Under $100K', range: { min: null, max: 100_000 } },
  { label: '$100K–$1M', range: { min: 100_000, max: 1_000_000 } },
  { label: '$1M–$10M', range: { min: 1_000_000, max: 10_000_000 } },
  { label: 'Over $10M', range: { min: 10_000_000, max: null } },
];

const LIQUIDITY: Bucket[] = [
  { label: 'Any', range: { min: null, max: null } },
  { label: 'Over $10K', range: { min: 10_000, max: null } },
  { label: 'Over $50K', range: { min: 50_000, max: null } },
  { label: 'Over $250K', range: { min: 250_000, max: null } },
];

const AGE: Bucket[] = [
  { label: 'Any', range: { min: null, max: null } },
  { label: 'Under 1h', range: { min: null, max: 1 } },
  { label: 'Under 24h', range: { min: null, max: 24 } },
  { label: '1–7 days', range: { min: 24, max: 168 } },
  { label: 'Over 7 days', range: { min: 168, max: null } },
];

const VOLUME: Bucket[] = [
  { label: 'Any', range: { min: null, max: null } },
  { label: 'Over $50K', range: { min: 50_000, max: null } },
  { label: 'Over $500K', range: { min: 500_000, max: null } },
  { label: 'Over $2M', range: { min: 2_000_000, max: null } },
];

const VOL_TO_LIQ: Bucket[] = [
  { label: 'Any', range: { min: null, max: null } },
  { label: 'Over 1x', range: { min: 1, max: null } },
  { label: 'Over 3x', range: { min: 3, max: null } },
  { label: 'Over 10x', range: { min: 10, max: null } },
];

const HOLDERS: Bucket[] = [
  { label: 'Any', range: { min: null, max: null } },
  { label: 'Over 100', range: { min: 100, max: null } },
  { label: 'Over 1,000', range: { min: 1_000, max: null } },
  { label: 'Over 10,000', range: { min: 10_000, max: null } },
];

const TXNS: Bucket[] = [
  { label: 'Any', range: { min: null, max: null } },
  { label: 'Over 100', range: { min: 100, max: null } },
  { label: 'Over 1,000', range: { min: 1_000, max: null } },
  { label: 'Over 10,000', range: { min: 10_000, max: null } },
];

const BUY_RATIO: Bucket[] = [
  { label: 'Any', range: { min: null, max: null } },
  { label: 'Buyers ahead', range: { min: 0.55, max: null } },
  { label: 'Strongly buying', range: { min: 0.7, max: null } },
  { label: 'Sellers ahead', range: { min: null, max: 0.45 } },
];

const MOMENTUM: Bucket[] = [
  { label: 'Any', range: { min: null, max: null } },
  { label: 'Over 50', range: { min: 50, max: null } },
  { label: 'Over 70', range: { min: 70, max: null } },
  { label: 'Over 85', range: { min: 85, max: null } },
];

const SCORE: Bucket[] = [
  { label: 'Any', range: { min: null, max: null } },
  { label: 'Over 50', range: { min: 50, max: null } },
  { label: 'Over 70', range: { min: 70, max: null } },
  { label: 'Over 85', range: { min: 85, max: null } },
];

const RISKS: RiskLevel[] = ['low', 'moderate', 'elevated', 'high'];

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'score', label: 'MOVA score' },
  { value: 'volume24h', label: '24h volume' },
  { value: 'marketCap', label: 'Market cap' },
  { value: 'liquidity', label: 'Liquidity' },
  { value: 'change1h', label: '1h change' },
  { value: 'change24h', label: '24h change' },
  { value: 'holders', label: 'Holders' },
  { value: 'age', label: 'Newest' },
];

export interface FilterSheetProps {
  filters: DiscoverFilters;
  sort: SortKey;
  onApply: (filters: DiscoverFilters, sort: SortKey) => void;
  onClose?: () => void;
}

export const FilterSheet = forwardRef<SheetRef, FilterSheetProps>(function FilterSheet(
  { filters, sort, onApply, onClose },
  ref,
) {
  // Edits are staged locally and only committed on Apply, so a half-configured
  // filter never re-runs the query on every tap.
  const [draft, setDraft] = useState<DiscoverFilters>(filters);
  const [draftSort, setDraftSort] = useState<SortKey>(sort);

  const patch = (next: Partial<DiscoverFilters>) => setDraft((current) => ({ ...current, ...next }));

  return (
    <Sheet
      ref={ref}
      title="Advanced filters"
      subtitle="Narrow the list down to the market structure you are looking for."
      snapPoints={['88%']}
      onClose={onClose}
    >
      <BucketGroup
        label="Market cap"
        buckets={MARKET_CAP}
        value={draft.marketCapUsd}
        onChange={(marketCapUsd) => patch({ marketCapUsd })}
      />
      <BucketGroup
        label="Liquidity"
        buckets={LIQUIDITY}
        value={draft.liquidityUsd}
        onChange={(liquidityUsd) => patch({ liquidityUsd })}
      />
      <BucketGroup label="Token age" buckets={AGE} value={draft.ageHours} onChange={(ageHours) => patch({ ageHours })} />
      <BucketGroup
        label="24h volume"
        buckets={VOLUME}
        value={draft.volume24hUsd}
        onChange={(volume24hUsd) => patch({ volume24hUsd })}
      />
      <BucketGroup
        label="Volume ÷ liquidity"
        buckets={VOL_TO_LIQ}
        value={draft.volumeToLiquidity}
        onChange={(volumeToLiquidity) => patch({ volumeToLiquidity })}
        hint="How many times the pool turns over in a day. High values mean frantic trading."
      />
      <BucketGroup label="Holders" buckets={HOLDERS} value={draft.holders} onChange={(holders) => patch({ holders })} />
      <BucketGroup
        label="24h transactions"
        buckets={TXNS}
        value={draft.txns24h}
        onChange={(txns24h) => patch({ txns24h })}
      />
      <BucketGroup
        label="Buy / sell balance"
        buckets={BUY_RATIO}
        value={draft.buyRatio}
        onChange={(buyRatio) => patch({ buyRatio })}
      />
      <BucketGroup
        label="Momentum score"
        buckets={MOMENTUM}
        value={draft.momentum}
        onChange={(momentum) => patch({ momentum })}
      />
      <BucketGroup
        label="MOVA score"
        buckets={SCORE}
        value={draft.movaScore}
        onChange={(movaScore) => patch({ movaScore })}
      />

      <View style={styles.group}>
        <Text variant="label" tone="secondary">
          Risk level
        </Text>
        <View style={styles.options}>
          {RISKS.map((risk) => {
            const active = draft.riskLevels.includes(risk);
            return (
              <Pressable
                key={risk}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: active }}
                accessibilityLabel={`${risk} risk`}
                onPress={() => {
                  select();
                  patch({
                    riskLevels: active
                      ? draft.riskLevels.filter((r) => r !== risk)
                      : [...draft.riskLevels, risk],
                  });
                }}
                style={[
                  styles.option,
                  active && { backgroundColor: riskDim[risk], borderColor: riskColor[risk] },
                ]}
              >
                <Text variant="labelSemi" color={active ? riskColor[risk] : palette.textSecondary}>
                  {risk[0]!.toUpperCase() + risk.slice(1)}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text variant="caption" tone="tertiary">
          Leave all unselected to include every risk level.
        </Text>
      </View>

      <View style={styles.group}>
        <Text variant="label" tone="secondary">
          Sort by
        </Text>
        <View style={styles.options}>
          {SORT_OPTIONS.map((option) => {
            const active = draftSort === option.value;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={option.label}
                onPress={() => {
                  select();
                  setDraftSort(option.value);
                }}
                style={[styles.option, active && styles.optionActive]}
              >
                <Text variant="labelSemi" tone={active ? 'brand' : 'secondary'}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.toggles}>
        <ToggleRow
          label="Mint authority revoked"
          description="Only tokens whose supply can no longer be increased."
          value={draft.requireMintRevoked}
          onChange={(requireMintRevoked) => patch({ requireMintRevoked })}
        />
        <ToggleRow
          label="Freeze authority revoked"
          description="Only tokens whose accounts cannot be frozen."
          value={draft.requireFreezeRevoked}
          onChange={(requireFreezeRevoked) => patch({ requireFreezeRevoked })}
        />
        <ToggleRow
          label="Hide suspected honeypots"
          description="Excludes tokens where sell transactions have been observed to fail."
          value={draft.excludeHoneypots}
          onChange={(excludeHoneypots) => patch({ excludeHoneypots })}
        />
      </View>

      <View style={styles.actions}>
        <Button
          label="Reset"
          variant="secondary"
          onPress={() => {
            setDraft({ ...DEFAULT_FILTERS, search: draft.search });
            setDraftSort('score');
          }}
          style={styles.actionButton}
        />
        <Button
          label="Apply filters"
          onPress={() => onApply(draft, draftSort)}
          style={styles.actionButton}
        />
      </View>
    </Sheet>
  );
});

function BucketGroup({
  label,
  buckets,
  value,
  onChange,
  hint,
}: {
  label: string;
  buckets: Bucket[];
  value: Range;
  onChange: (range: Range) => void;
  hint?: string;
}) {
  const activeIndex = buckets.findIndex((b) => b.range.min === value.min && b.range.max === value.max);

  return (
    <View style={styles.group}>
      <Text variant="label" tone="secondary">
        {label}
      </Text>
      <View style={styles.options}>
        {buckets.map((bucket, index) => {
          const active = index === activeIndex;
          return (
            <Pressable
              key={bucket.label}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${label}: ${bucket.label}`}
              onPress={() => {
                select();
                onChange(bucket.range);
              }}
              style={[styles.option, active && styles.optionActive]}
            >
              <Text variant="labelSemi" tone={active ? 'brand' : 'secondary'}>
                {bucket.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {hint ? (
        <Text variant="caption" tone="tertiary">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/** Human summary of the active filters, shown on the Discover header. */
export function describeFilters(filters: DiscoverFilters): string[] {
  const parts: string[] = [];
  const range = (label: string, r: Range, fmt: (v: number) => string) => {
    if (r.min == null && r.max == null) return;
    if (r.min != null && r.max != null) parts.push(`${label} ${fmt(r.min)}–${fmt(r.max)}`);
    else if (r.min != null) parts.push(`${label} over ${fmt(r.min)}`);
    else if (r.max != null) parts.push(`${label} under ${fmt(r.max)}`);
  };

  range('Cap', filters.marketCapUsd, formatUsdCompact);
  range('Liq', filters.liquidityUsd, formatUsdCompact);
  range('Age', filters.ageHours, (v) => (v >= 24 ? `${Math.round(v / 24)}d` : `${v}h`));
  range('Vol', filters.volume24hUsd, formatUsdCompact);
  range('Vol/Liq', filters.volumeToLiquidity, (v) => `${v}x`);
  range('Holders', filters.holders, (v) => v.toLocaleString('en-US'));
  range('Txns', filters.txns24h, (v) => v.toLocaleString('en-US'));
  range('Buys', filters.buyRatio, (v) => `${Math.round(v * 100)}%`);
  range('Momentum', filters.momentum, (v) => String(v));
  range('Score', filters.movaScore, (v) => String(v));

  if (filters.riskLevels.length > 0) parts.push(`Risk: ${filters.riskLevels.join(', ')}`);
  if (filters.requireMintRevoked) parts.push('Mint revoked');
  if (filters.requireFreezeRevoked) parts.push('Freeze revoked');

  return parts;
}

/** Number of filters differing from the defaults, for the badge on the button. */
export function countActiveFilters(filters: DiscoverFilters): number {
  return describeFilters(filters).length;
}

const styles = StyleSheet.create({
  group: {
    gap: space.sm,
    marginBottom: space.xl,
  },
  options: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  option: {
    paddingHorizontal: space.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  optionActive: {
    backgroundColor: palette.brandDim,
    borderColor: palette.brand,
  },
  toggles: {
    marginBottom: space.xl,
  },
  actions: {
    flexDirection: 'row',
    gap: space.md,
  },
  actionButton: {
    flex: 1,
  },
});
