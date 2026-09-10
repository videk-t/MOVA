import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { TokenSummary } from '@/core/types';
import { palette, radius, space, type as typeScale } from '@/theme';
import { Screen, useTabBarPadding } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { Button } from '@/ui/Button';
import { Badge, OriginBadge } from '@/ui/Badge';
import { ChipRow } from '@/ui/Segmented';
import { EmptyState, ErrorState } from '@/ui/States';
import { TokenListSkeleton } from '@/ui/Skeleton';
import type { SheetRef } from '@/ui/Sheet';
import { TokenRow } from '@/features/tokens/TokenRow';
import { countActiveFilters, describeFilters, FilterSheet } from '@/features/discover/FilterSheet';
import { flattenPages, useDiscover } from '@/data/queries';
import {
  DEFAULT_FILTERS,
  DISCOVER_PRESETS,
  type DiscoverFilters,
  type SortKey,
} from '@/data/providers/types';
import { useCompare } from '@/store/compare';
import { commit } from '@/ui/haptics';

const PAGE_SIZE = 20;

/**
 * Discover.
 *
 * Presets carry the common questions; the advanced sheet exists for everything
 * else. Search is debounced so typing does not fire a request per keystroke.
 */
export default function DiscoverScreen() {
  const router = useRouter();
  const bottomPadding = useTabBarPadding();
  const filterSheet = useRef<SheetRef>(null);

  const [presetId, setPresetId] = useState<string | null>('trending');
  const [filters, setFilters] = useState<DiscoverFilters>(() => applyPreset(DEFAULT_FILTERS, 'trending'));
  const [sort, setSort] = useState<SortKey>('volume24h');
  const [searchInput, setSearchInput] = useState('');

  const compareCount = useCompare((s) => s.selected.length);

  // Debounce the search term rather than the whole query, so changing a filter
  // still applies immediately.
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((current) => (current.search === searchInput ? current : { ...current, search: searchInput }));
    }, 280);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const query = useMemo(
    () => ({ filters, sort, direction: sort === 'age' ? ('asc' as const) : ('desc' as const), limit: PAGE_SIZE }),
    [filters, sort],
  );

  const discover = useDiscover(query);
  const items = useMemo(() => flattenPages(discover.data?.pages), [discover.data?.pages]);
  const origin = discover.data?.pages[0]?.meta.origin ?? null;
  const activeFilterCount = countActiveFilters(filters);
  const activeDescriptions = describeFilters(filters);

  const selectPreset = useCallback((id: string) => {
    const preset = DISCOVER_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    setPresetId(id);
    setFilters((current) => applyPreset({ ...DEFAULT_FILTERS, search: current.search }, id));
    setSort(preset.sort);
  }, []);

  const onEndReached = useCallback(() => {
    if (discover.hasNextPage && !discover.isFetchingNextPage) void discover.fetchNextPage();
  }, [discover]);

  const renderItem = useCallback(
    ({ item }: { item: TokenSummary }) => <TokenRow summary={item} window="1h" />,
    [],
  );

  const preset = DISCOVER_PRESETS.find((p) => p.id === presetId);

  return (
    <Screen withTabBar>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text variant="h1">Discover</Text>
          {origin ? <OriginBadge origin={origin} /> : null}
        </View>

        <View style={styles.searchRow}>
          <View style={styles.searchWrap}>
            <Text variant="body" tone="tertiary" style={styles.searchIcon}>
              ⌕
            </Text>
            <TextInput
              value={searchInput}
              onChangeText={setSearchInput}
              placeholder="Search ticker, name or address"
              placeholderTextColor={palette.textTertiary}
              style={styles.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              accessibilityLabel="Search tokens"
              selectionColor={palette.brandBright}
              maxLength={64}
            />
            {searchInput.length > 0 ? (
              <Text
                variant="body"
                tone="tertiary"
                onPress={() => setSearchInput('')}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
                style={styles.clear}
              >
                ✕
              </Text>
            ) : null}
          </View>

          <Button
            label={activeFilterCount > 0 ? `Filters · ${activeFilterCount}` : 'Filters'}
            variant={activeFilterCount > 0 ? 'primary' : 'secondary'}
            size="md"
            onPress={() => filterSheet.current?.open()}
            accessibilityHint="Opens advanced filtering options"
          />
        </View>

        <ChipRow
          options={DISCOVER_PRESETS.map((p) => ({ value: p.id, label: p.label, emoji: p.emoji }))}
          value={presetId}
          onChange={selectPreset}
          style={styles.chips}
          contentStyle={styles.chipsContent}
        />

        {preset ? (
          <Text variant="caption" tone="tertiary" style={styles.presetHint}>
            {preset.description}
          </Text>
        ) : null}

        {activeDescriptions.length > 0 ? (
          <View style={styles.activeFilters}>
            {activeDescriptions.slice(0, 4).map((description) => (
              <Badge key={description} label={description} tone="brand" size="sm" />
            ))}
            {activeDescriptions.length > 4 ? (
              <Badge label={`+${activeDescriptions.length - 4}`} tone="neutral" size="sm" />
            ) : null}
          </View>
        ) : null}
      </View>

      {discover.isLoading ? (
        <View style={styles.loading}>
          <TokenListSkeleton count={7} />
        </View>
      ) : discover.isError ? (
        <View style={styles.loading}>
          <ErrorState
            title="Could not load tokens"
            detail={discover.error instanceof Error ? discover.error.message : undefined}
            onRetry={() => void discover.refetch()}
          />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.ref.address}
          renderItem={renderItem}
          contentContainerStyle={[styles.list, { paddingBottom: bottomPadding }]}
          showsVerticalScrollIndicator={false}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.6}
          // Tuned so a long list stays smooth without blank frames on scroll.
          initialNumToRender={10}
          maxToRenderPerBatch={8}
          windowSize={9}
          removeClippedSubviews
          ItemSeparatorComponent={Separator}
          refreshing={discover.isRefetching && !discover.isFetchingNextPage}
          onRefresh={() => void discover.refetch()}
          ListEmptyComponent={
            <EmptyState
              emoji="🔍"
              title="Nothing matches"
              message={
                filters.search.trim().length > 0
                  ? `No token matches "${filters.search.trim()}" with the current filters.`
                  : 'No token passes every filter you have set. Try loosening one of them.'
              }
              actionLabel="Reset filters"
              onAction={() => {
                setFilters({ ...DEFAULT_FILTERS });
                setSearchInput('');
                setPresetId(null);
              }}
            />
          }
          ListFooterComponent={
            discover.isFetchingNextPage ? (
              <View style={styles.footer}>
                <ActivityIndicator color={palette.textTertiary} />
              </View>
            ) : items.length > 0 && !discover.hasNextPage ? (
              <Text variant="caption" tone="tertiary" center style={styles.footer}>
                {items.length} token{items.length === 1 ? '' : 's'} match your filters
              </Text>
            ) : null
          }
        />
      )}

      {compareCount > 0 ? (
        <View style={[styles.compareBar, { bottom: bottomPadding - space.md }]}>
          <Button
            label={`Compare ${compareCount} token${compareCount === 1 ? '' : 's'}`}
            onPress={() => {
              commit();
              router.push('/compare');
            }}
            fullWidth
          />
        </View>
      ) : null}

      <FilterSheet
        ref={filterSheet}
        filters={filters}
        sort={sort}
        onApply={(nextFilters, nextSort) => {
          setFilters(nextFilters);
          setSort(nextSort);
          setPresetId(null);
          filterSheet.current?.close();
        }}
      />
    </Screen>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

function applyPreset(base: DiscoverFilters, presetId: string): DiscoverFilters {
  const preset = DISCOVER_PRESETS.find((p) => p.id === presetId);
  if (!preset) return base;
  return { ...base, ...preset.filters };
}

const styles = StyleSheet.create({
  header: {
    paddingTop: space.sm,
    gap: space.md,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.xl,
    gap: space.md,
  },
  searchRow: {
    flexDirection: 'row',
    gap: space.sm,
    paddingHorizontal: space.xl,
  },
  searchWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    height: 46,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  searchIcon: {
    fontSize: 17,
  },
  searchInput: {
    flex: 1,
    color: palette.text,
    ...typeScale.bodyMedium,
    paddingVertical: 0,
  },
  clear: {
    paddingHorizontal: 4,
  },
  chips: {
    marginHorizontal: -space.xl,
  },
  chipsContent: {
    paddingHorizontal: space.xl,
  },
  presetHint: {
    paddingHorizontal: space.xl,
    marginTop: -space.xs,
  },
  activeFilters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: space.xl,
  },
  loading: {
    flex: 1,
    paddingHorizontal: space.xl,
    paddingTop: space.lg,
  },
  list: {
    paddingHorizontal: space.xl,
    paddingTop: space.lg,
    flexGrow: 1,
  },
  separator: {
    height: space.sm,
  },
  footer: {
    paddingVertical: space.xl,
  },
  compareBar: {
    position: 'absolute',
    left: space.xl,
    right: space.xl,
  },
});
