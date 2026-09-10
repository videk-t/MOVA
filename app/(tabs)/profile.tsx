import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { palette, space } from '@/theme';
import { Screen, useTabBarPadding } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { Card, Section } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { Badge, OriginBadge } from '@/ui/Badge';
import { Stepper, TextField, ToggleRow } from '@/ui/Field';
import { MovaWordmark } from '@/features/brand/Wordmark';
import { VENUES } from '@/data/venues';
import { useClearCache, useRefreshAll } from '@/data/queries';
import {
  getConfiguredMode,
  getProviders,
  isProviderOverridden,
  mockProviders,
  setProviderOverride,
} from '@/data/providers';
import { useSettings } from '@/store/settings';
import { useWatchlist } from '@/store/watchlist';
import { useAlerts } from '@/store/alerts';
import { useJournal } from '@/store/journal';
import { commit } from '@/ui/haptics';

/**
 * Profile.
 *
 * MOVA has no account requirement, so this is a preferences screen rather than
 * an identity one. The data-source panel is deliberately prominent: a user must
 * always be able to find out whether the numbers they are reading are real.
 */
export default function ProfileScreen() {
  const router = useRouter();
  const bottomPadding = useTabBarPadding();
  const refreshAll = useRefreshAll();
  const clearCache = useClearCache();

  const settings = useSettings();
  const watchedCount = useWatchlist((s) => s.entries.length);
  const clearWatchlist = useWatchlist((s) => s.clear);
  const ruleCount = useAlerts((s) => s.rules.length);
  const clearEvents = useAlerts((s) => s.clearEvents);
  const tradeCount = useJournal((s) => s.trades.length);

  const configuredMode = getConfiguredMode();
  const [forcedDemo, setForcedDemo] = useState(() => isProviderOverridden());
  const providerName = getProviders().name;
  const origin = getProviders().origin;

  const toggleDemo = useCallback(
    (next: boolean) => {
      setProviderOverride(next ? mockProviders : null);
      setForcedDemo(next);
      // Data from the previous source must not linger on screen after a switch.
      clearCache();
      void refreshAll();
    },
    [clearCache, refreshAll],
  );

  return (
    <Screen withTabBar>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottomPadding }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <MovaWordmark size={20} />
          <Text variant="caption" tone="tertiary" style={styles.tagline}>
            Meme Opportunity &amp; Value Analytics
          </Text>
        </View>

        <Section title="Data source" subtitle="Where the numbers on every screen come from">
          <Card>
            <View style={styles.sourceRow}>
              <View style={styles.sourceText}>
                <Text variant="bodyMedium">{providerName}</Text>
                <Text variant="caption" tone="tertiary" style={styles.sourceHint}>
                  {origin === 'live'
                    ? 'Served through the MOVA backend, which holds the upstream API keys.'
                    : 'Generated locally so MOVA is fully usable without any API credentials. Demo numbers are realistic but not real.'}
                </Text>
              </View>
              <OriginBadge origin={origin} />
            </View>

            {configuredMode === 'live' ? (
              <ToggleRow
                label="Use demo data"
                description="Switch to the local generator without changing your configuration."
                value={forcedDemo}
                onChange={toggleDemo}
                style={styles.sourceToggle}
              />
            ) : (
              <Text variant="caption" tone="tertiary" style={styles.sourceToggle}>
                Set EXPO_PUBLIC_DATA_MODE=live and EXPO_PUBLIC_API_URL to point MOVA at a live backend.
              </Text>
            )}
          </Card>
        </Section>

        <Section title="Display name" subtitle="Stored on this device only — MOVA has no accounts">
          <Card>
            <TextField
              label="Name"
              value={settings.displayName}
              onChangeText={settings.setDisplayName}
              placeholder="Optional"
              maxLength={40}
            />
          </Card>
        </Section>

        <Section title="Live data" subtitle="How often open screens refresh themselves">
          <Card>
            <Stepper
              label="Auto-refresh"
              value={settings.refreshIntervalSec}
              onChange={settings.setRefreshInterval}
              min={0}
              max={300}
              step={15}
              format={(v) => (v === 0 ? 'Off' : v >= 60 ? `${v / 60} min` : `${v}s`)}
            />
            <Text variant="caption" tone="tertiary" style={styles.hint}>
              Lower values cost more requests. Pull to refresh works at any setting.
            </Text>
          </Card>
        </Section>

        <Section title="Feel">
          <Card>
            <ToggleRow
              label="Haptics"
              description="Physical feedback when something you did takes effect."
              value={settings.hapticsEnabled}
              onChange={settings.setHaptics}
            />
            <View style={styles.divider} />
            <ToggleRow
              label="Reduce motion"
              description="Shortens or removes transitions and chart animations."
              value={settings.reduceMotion}
              onChange={settings.setReduceMotion}
            />
          </Card>
        </Section>

        <Section title="Preferred venue" subtitle="Shown first when you open Trade on from a token">
          <View style={styles.venues}>
            {VENUES.map((venue) => {
              const active = venue.id === settings.preferredVenue;
              return (
                <Button
                  key={venue.id}
                  label={`${venue.emoji}  ${venue.name}`}
                  variant={active ? 'primary' : 'secondary'}
                  size="sm"
                  onPress={() => settings.setPreferredVenue(venue.id)}
                  style={styles.venueButton}
                />
              );
            })}
          </View>
        </Section>

        <Section title="Risk defaults" subtitle="Starting values for the position calculator">
          <Card>
            <TextField
              label="Portfolio size (USD)"
              value={String(settings.portfolioUsd)}
              onChangeText={(text) => settings.setPortfolio(Number(text.replace(/[^0-9.]/g, '')) || 0)}
              keyboardType="decimal-pad"
              prefix="$"
            />
            <View style={styles.divider} />
            <Stepper
              label="Risk per trade"
              value={settings.defaultRiskPct}
              onChange={settings.setDefaultRisk}
              min={0.5}
              max={10}
              step={0.5}
              format={(v) => `${v}%`}
            />
          </Card>
        </Section>

        <Section title="Tools">
          <View style={styles.tools}>
            <ToolButton label="Risk calculator" onPress={() => router.push('/tools/risk')} />
            <ToolButton
              label={`Journal${tradeCount > 0 ? ` · ${tradeCount}` : ''}`}
              onPress={() => router.push('/tools/journal')}
            />
            <ToolButton label="Paper trading" onPress={() => router.push('/tools/paper')} />
          </View>
        </Section>

        <Section title="Your data" subtitle="Everything MOVA stores lives on this device">
          <Card>
            <View style={styles.counts}>
              <Badge label={`${watchedCount} watched`} tone="neutral" />
              <Badge label={`${ruleCount} alert rules`} tone="neutral" />
              <Badge label={`${tradeCount} journal entries`} tone="neutral" />
            </View>
            <View style={styles.dataActions}>
              <Button
                label="Clear alert feed"
                variant="secondary"
                size="sm"
                onPress={() => {
                  commit();
                  clearEvents();
                }}
                style={styles.dataButton}
              />
              <Button
                label="Clear watchlist"
                variant="danger"
                size="sm"
                disabled={watchedCount === 0}
                onPress={() => {
                  commit();
                  clearWatchlist();
                }}
                style={styles.dataButton}
              />
            </View>
          </Card>
        </Section>

        <Card style={styles.about}>
          <Text variant="h3">What MOVA is</Text>
          <Text variant="body" tone="secondary" style={styles.aboutBody}>
            MOVA is a research and analytics layer for Solana memecoins. It helps you find tokens,
            understand what the on-chain and social data is saying, and check the structural risks before
            you act.
          </Text>
          <Text variant="h3" style={styles.aboutHeading}>
            What MOVA is not
          </Text>
          <Text variant="body" tone="secondary" style={styles.aboutBody}>
            MOVA does not execute trades, hold funds, custody wallets or sign transactions. It will never
            ask for a seed phrase, a private key or an exchange password. Trading happens on the platform
            you choose.
          </Text>
          <Text variant="body" tone="secondary" style={styles.aboutBody}>
            Nothing in MOVA is financial advice, and no score is a prediction. Memecoins can lose their
            entire value quickly.
          </Text>
          <Text variant="caption" tone="tertiary" style={styles.version}>
            MOVA 1.0.0 · demo build
          </Text>
        </Card>

        <Button
          label="Reset preferences"
          variant="ghost"
          size="sm"
          onPress={() => {
            commit();
            settings.reset();
          }}
          style={styles.reset}
        />
      </ScrollView>
    </Screen>
  );
}

function ToolButton({ label, onPress }: { label: string; onPress: () => void }) {
  return <Button label={label} variant="secondary" size="md" onPress={onPress} style={styles.toolButton} />;
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: space.xl,
    paddingTop: space.sm,
  },
  header: {
    marginBottom: space['2xl'],
  },
  tagline: {
    marginTop: 4,
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space.md,
  },
  sourceText: {
    flex: 1,
  },
  sourceHint: {
    marginTop: 4,
    lineHeight: 15,
  },
  sourceToggle: {
    marginTop: space.md,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.border,
  },
  hint: {
    marginTop: space.md,
    lineHeight: 15,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: palette.border,
    marginVertical: space.sm,
  },
  venues: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  venueButton: {
    flexGrow: 1,
  },
  tools: {
    gap: space.sm,
  },
  toolButton: {
    width: '100%',
  },
  counts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  dataActions: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.lg,
  },
  dataButton: {
    flex: 1,
  },
  about: {
    marginTop: space.sm,
  },
  aboutHeading: {
    marginTop: space.lg,
  },
  aboutBody: {
    marginTop: space.sm,
    lineHeight: 21,
  },
  version: {
    marginTop: space.lg,
  },
  reset: {
    marginTop: space.lg,
    alignSelf: 'center',
  },
});
