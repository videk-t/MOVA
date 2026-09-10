import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import type { AlertCondition, AlertScope, ThresholdSpec, ThresholdUnit } from '@/core/alert-rules';
import { buildCondition, CONDITION_SPECS, conditionSpec, describeRule } from '@/core/alert-rules';
import { formatUsdCompact } from '@/core/format';
import { palette, radius, space } from '@/theme';
import { Screen, PushedHeader } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { Badge } from '@/ui/Badge';
import { Segmented } from '@/ui/Segmented';
import { Stepper } from '@/ui/Field';
import { useAlerts } from '@/store/alerts';
import { success } from '@/ui/haptics';

type ScopeChoice = 'watchlist' | 'all' | 'token';
type Window = '5m' | '1h' | '24h';

/**
 * Rule builder.
 *
 * Reached either from Alerts (no params) or from a token page, which passes the
 * address and symbol so the rule can be scoped to that one token. The live
 * summary line at the bottom is the same `describeRule` the list renders, so
 * what you read while building is exactly what you get afterwards.
 */
export default function NewAlertRuleScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ address?: string; symbol?: string }>();
  const addRule = useAlerts((s) => s.addRule);

  const tokenAddress = typeof params.address === 'string' ? params.address : null;
  const tokenSymbol = typeof params.symbol === 'string' && params.symbol.length > 0 ? params.symbol : 'this token';

  const [scopeChoice, setScopeChoice] = useState<ScopeChoice>(tokenAddress ? 'token' : 'watchlist');
  const [kind, setKind] = useState<AlertCondition['kind']>('score_moves');
  const [value, setValue] = useState(() => conditionSpec('score_moves')?.threshold?.default ?? 10);
  const [window, setWindow] = useState<Window>('1h');
  const [cooldown, setCooldown] = useState(30);

  const spec = conditionSpec(kind);

  const selectKind = useCallback((next: AlertCondition['kind']) => {
    setKind(next);
    setValue(conditionSpec(next)?.threshold?.default ?? 0);
  }, []);

  const scope: AlertScope = useMemo(() => {
    if (scopeChoice === 'token' && tokenAddress) {
      return { type: 'token', address: tokenAddress, symbol: tokenSymbol };
    }
    return scopeChoice === 'all' ? { type: 'all' } : { type: 'watchlist' };
  }, [scopeChoice, tokenAddress, tokenSymbol]);

  const condition = useMemo(() => buildCondition(kind, value, window), [kind, value, window]);

  // Preview the rule exactly as the list will describe it, using a throwaway
  // rule object rather than a second formatting path that could drift.
  const preview = useMemo(
    () =>
      describeRule({
        id: 'preview',
        label: '',
        scope,
        condition,
        enabled: true,
        createdAt: 0,
        lastTriggeredAt: null,
        cooldownMs: cooldown * 60_000,
      }),
    [condition, cooldown, scope],
  );

  const save = useCallback(() => {
    addRule({ scope, condition, cooldownMinutes: cooldown });
    success();
    if (router.canGoBack()) router.back();
    else router.replace('/alerts');
  }, [addRule, condition, cooldown, router, scope]);

  return (
    <Screen>
      <PushedHeader title="New alert rule" subtitle="Choose what to watch and when to hear about it" />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text variant="overline" tone="tertiary" style={styles.sectionLabel}>
          Applies to
        </Text>
        <Segmented
          options={
            tokenAddress
              ? [
                  { value: 'token' as ScopeChoice, label: tokenSymbol },
                  { value: 'watchlist' as ScopeChoice, label: 'Watchlist' },
                  { value: 'all' as ScopeChoice, label: 'All tokens' },
                ]
              : [
                  { value: 'watchlist' as ScopeChoice, label: 'Watchlist' },
                  { value: 'all' as ScopeChoice, label: 'All tokens' },
                ]
          }
          value={scopeChoice}
          onChange={setScopeChoice}
          accessibilityLabel="Rule scope"
        />
        <Text variant="caption" tone="tertiary" style={styles.hint}>
          {scopeChoice === 'all'
            ? 'Evaluated against a sample of trending tokens, not the whole chain.'
            : scopeChoice === 'watchlist'
              ? 'Applies to every token you have saved, including ones you add later.'
              : `Applies to ${tokenSymbol} only.`}
        </Text>

        <Text variant="overline" tone="tertiary" style={styles.sectionLabel}>
          Condition
        </Text>
        <View style={styles.conditions}>
          {CONDITION_SPECS.map((option) => {
            const active = option.kind === kind;
            return (
              <Pressable
                key={option.kind}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={option.label}
                accessibilityHint={option.description}
                onPress={() => selectKind(option.kind)}
                style={[styles.condition, active && styles.conditionActive]}
              >
                <Text variant="labelSemi" tone={active ? 'brand' : 'secondary'}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {spec ? (
          <Animated.View entering={FadeIn.duration(180)} key={kind}>
            <Card style={styles.detailCard}>
              <Text variant="body" tone="secondary" style={styles.description}>
                {spec.description}
              </Text>

              {spec.threshold ? <ThresholdStepper spec={spec.threshold} value={value} onChange={setValue} /> : null}

              {spec.hasWindow ? (
                <View style={styles.stepper}>
                  <Text variant="label" tone="secondary" style={styles.windowLabel}>
                    Window
                  </Text>
                  <Segmented
                    options={[
                      { value: '5m' as Window, label: '5 minutes' },
                      { value: '1h' as Window, label: '1 hour' },
                      { value: '24h' as Window, label: '24 hours' },
                    ]}
                    value={window}
                    onChange={setWindow}
                    accessibilityLabel="Price change window"
                  />
                </View>
              ) : null}
            </Card>
          </Animated.View>
        ) : null}

        <Text variant="overline" tone="tertiary" style={styles.sectionLabel}>
          Cooldown
        </Text>
        <Card>
          <Stepper
            label="Minimum gap between firings"
            value={cooldown}
            onChange={setCooldown}
            min={5}
            max={240}
            step={5}
            format={(v) => (v >= 60 ? `${(v / 60).toFixed(v % 60 === 0 ? 0 : 1)}h` : `${v}m`)}
          />
          <Text variant="caption" tone="tertiary" style={styles.hint}>
            Stops one volatile token from filling the feed with the same alert.
          </Text>
        </Card>

        <Card style={styles.previewCard}>
          <Badge label="Preview" tone="brand" size="sm" />
          <Text variant="bodyMedium" style={styles.previewText}>
            {preview}
          </Text>
        </Card>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.lg }]}>
        <Button label="Create rule" fullWidth size="lg" onPress={save} />
      </View>
    </Screen>
  );
}

function ThresholdStepper({
  spec,
  value,
  onChange,
}: {
  spec: ThresholdSpec;
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <Stepper
      label="Threshold"
      value={value}
      onChange={onChange}
      min={spec.min}
      max={spec.max}
      step={spec.step}
      format={(v) => formatThreshold(v, spec.unit)}
      style={styles.stepper}
    />
  );
}

function formatThreshold(value: number, unit: ThresholdUnit): string {
  switch (unit) {
    case 'percent':
      return `${value}%`;
    case 'multiple':
      return `${value}×`;
    case 'usd':
      return formatUsdCompact(value);
    default:
      return `${value} pts`;
  }
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: space.xl,
    paddingTop: space.sm,
  },
  sectionLabel: {
    marginTop: space.xl,
    marginBottom: space.md,
    paddingHorizontal: space.xs,
  },
  hint: {
    marginTop: space.sm,
    paddingHorizontal: space.xs,
    lineHeight: 15,
  },
  conditions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  condition: {
    paddingHorizontal: space.md,
    paddingVertical: 9,
    borderRadius: radius.pill,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  conditionActive: {
    backgroundColor: palette.brandDim,
    borderColor: palette.brand,
  },
  detailCard: {
    marginTop: space.lg,
  },
  description: {
    lineHeight: 20,
  },
  stepper: {
    marginTop: space.lg,
  },
  windowLabel: {
    marginBottom: space.sm,
  },
  previewCard: {
    marginTop: space['2xl'],
    gap: space.md,
  },
  previewText: {
    lineHeight: 20,
  },
  footer: {
    paddingHorizontal: space.xl,
    paddingTop: space.md,
    backgroundColor: palette.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.border,
  },
});
