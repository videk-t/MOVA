import { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { AlertEvent } from '@/core/types';
import type { AlertRule } from '@/core/alert-rules';
import { space } from '@/theme';
import { Screen, useTabBarPadding } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { Badge } from '@/ui/Badge';
import { Segmented } from '@/ui/Segmented';
import { ToggleRow } from '@/ui/Field';
import { EmptyState } from '@/ui/States';
import { AlertRow } from '@/features/alerts/AlertRow';
import { RuleRow } from '@/features/alerts/RuleRow';
import { useAlerts } from '@/store/alerts';
import { useWatchlist } from '@/store/watchlist';
import { commit } from '@/ui/haptics';

type Tab = 'feed' | 'rules';

/**
 * Alerts.
 *
 * Two halves of one idea: what has fired, and what is armed. They share a
 * screen because the first question after reading an alert is usually whether
 * to change the rule that produced it.
 */
export default function AlertsScreen() {
  const router = useRouter();
  const bottomPadding = useTabBarPadding();
  const [tab, setTab] = useState<Tab>('feed');

  const events = useAlerts((s) => s.events);
  const rules = useAlerts((s) => s.rules);
  const enabled = useAlerts((s) => s.enabled);
  const setEnabled = useAlerts((s) => s.setEnabled);
  const markAllRead = useAlerts((s) => s.markAllRead);
  const clearEvents = useAlerts((s) => s.clearEvents);
  const toggleRule = useAlerts((s) => s.toggleRule);
  const removeRule = useAlerts((s) => s.removeRule);

  const watchedCount = useWatchlist((s) => s.entries.length);

  const unread = useMemo(() => events.reduce((n, e) => n + (e.read ? 0 : 1), 0), [events]);
  const activeRules = useMemo(() => rules.filter((r) => r.enabled).length, [rules]);

  const renderEvent = useCallback(({ item }: { item: AlertEvent }) => <AlertRow event={item} />, []);

  const renderRule = useCallback(
    ({ item }: { item: AlertRule }) => (
      <RuleRow rule={item} onToggle={() => toggleRule(item.id)} onRemove={() => removeRule(item.id)} />
    ),
    [removeRule, toggleRule],
  );

  return (
    <Screen withTabBar>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text variant="h1">Alerts</Text>
          {unread > 0 ? <Badge label={`${unread} new`} tone="brand" /> : null}
        </View>

        <Segmented
          options={[
            { value: 'feed', label: events.length > 0 ? `Feed · ${events.length}` : 'Feed' },
            { value: 'rules', label: `Rules · ${activeRules}` },
          ]}
          value={tab}
          onChange={setTab}
          accessibilityLabel="Alerts view"
          style={styles.segmented}
        />
      </View>

      {tab === 'feed' ? (
        <FlatList
          data={events}
          keyExtractor={(item) => item.id}
          renderItem={renderEvent}
          contentContainerStyle={[styles.list, { paddingBottom: bottomPadding }]}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={Separator}
          initialNumToRender={10}
          maxToRenderPerBatch={8}
          windowSize={9}
          ListHeaderComponent={
            events.length > 0 ? (
              <View style={styles.feedActions}>
                <Button
                  label="Mark all read"
                  variant="ghost"
                  size="sm"
                  disabled={unread === 0}
                  onPress={markAllRead}
                />
                <Button
                  label="Clear"
                  variant="ghost"
                  size="sm"
                  onPress={() => {
                    commit();
                    clearEvents();
                  }}
                  accessibilityHint="Removes every alert from this feed"
                />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              emoji="🔔"
              title={enabled ? 'Nothing has fired yet' : 'Alerts are switched off'}
              message={
                !enabled
                  ? 'Your rules are kept, but MOVA is not evaluating them. Turn alerts back on in the Rules tab.'
                  : watchedCount === 0
                    ? 'MOVA checks your watchlist in the background. Save a token and matching alerts will land here.'
                    : `MOVA is checking ${watchedCount} saved token${watchedCount === 1 ? '' : 's'} against ${activeRules} active rule${activeRules === 1 ? '' : 's'}. Nothing has crossed a threshold yet.`
              }
              actionLabel={watchedCount === 0 ? 'Find tokens' : 'Review rules'}
              onAction={() => (watchedCount === 0 ? router.push('/discover') : setTab('rules'))}
            />
          }
        />
      ) : (
        <FlatList
          data={rules}
          keyExtractor={(item) => item.id}
          renderItem={renderRule}
          contentContainerStyle={[styles.list, { paddingBottom: bottomPadding }]}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={Separator}
          ListHeaderComponent={
            <View style={styles.rulesHeader}>
              <Card>
                <ToggleRow
                  label="Alerts enabled"
                  description="Evaluated on this device roughly every 45 seconds while MOVA is open. Rules are kept when this is off."
                  value={enabled}
                  onChange={setEnabled}
                />
              </Card>

              <Button
                label="New alert rule"
                fullWidth
                onPress={() => router.push('/alerts/new')}
                accessibilityHint="Opens the rule builder"
              />

              {rules.length > 0 ? (
                <Text variant="caption" tone="tertiary" style={styles.rulesHint}>
                  Swipe a rule left to delete it.
                </Text>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            <EmptyState
              emoji="⚙️"
              title="No rules yet"
              message="A rule describes the change you want to hear about — a score move, a liquidity drop, a whale buy — and which tokens it applies to."
              actionLabel="Create your first rule"
              onAction={() => router.push('/alerts/new')}
            />
          }
          ListFooterComponent={
            <Text variant="caption" tone="tertiary" center style={styles.footer}>
              Alerts describe what the data did. They are not trading signals, and MOVA does not act on
              them.
            </Text>
          }
        />
      )}
    </Screen>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  header: {
    paddingTop: space.sm,
    paddingHorizontal: space.xl,
    gap: space.lg,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  segmented: {
    marginBottom: space.xs,
  },
  list: {
    paddingHorizontal: space.xl,
    paddingTop: space.md,
    flexGrow: 1,
  },
  separator: {
    height: space.sm,
  },
  feedActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: space.sm,
    marginBottom: space.sm,
  },
  rulesHeader: {
    gap: space.lg,
    marginBottom: space.lg,
  },
  rulesHint: {
    paddingHorizontal: space.xs,
  },
  footer: {
    marginTop: space['2xl'],
    paddingHorizontal: space.lg,
    lineHeight: 16,
  },
});
