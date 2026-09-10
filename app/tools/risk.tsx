import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import { calculateRisk } from '@/core/risk';
import { sanitizeDecimal, toInputText, toNumber } from '@/core/input';
import { formatPctPlain, formatPrice, formatUsd, NO_DATA } from '@/core/format';
import { palette, radius, space } from '@/theme';
import { Screen, PushedHeader } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { Card } from '@/ui/Card';
import { Badge } from '@/ui/Badge';
import { Stepper, TextField } from '@/ui/Field';
import { Stat, StatRow } from '@/ui/Stat';
import { useSettings } from '@/store/settings';

/**
 * Position sizing calculator.
 *
 * Fixed-fractional risk: you decide what a loss may cost, and the distance to
 * the stop decides how large the position can be. The result deliberately leads
 * with the loss rather than the profit — the loss is the number that is under
 * the user's control.
 */
export default function RiskCalculatorScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ symbol?: string; price?: string }>();

  const portfolioDefault = useSettings((s) => s.portfolioUsd);
  const riskDefault = useSettings((s) => s.defaultRiskPct);
  const setPortfolio = useSettings((s) => s.setPortfolio);

  const symbol = typeof params.symbol === 'string' && params.symbol.length > 0 ? params.symbol : null;

  const [portfolio, setPortfolioText] = useState(() => toInputText(portfolioDefault));
  const [riskPct, setRiskPct] = useState(riskDefault);
  const [entry, setEntry] = useState(() =>
    typeof params.price === 'string' ? sanitizeDecimal(params.price) : '',
  );
  const [stop, setStop] = useState('');
  const [target, setTarget] = useState('');

  const result = useMemo(
    () =>
      calculateRisk({
        portfolioUsd: toNumber(portfolio),
        riskPct,
        entryPrice: toNumber(entry),
        stopPrice: toNumber(stop),
        targetPrice: toNumber(target) > 0 ? toNumber(target) : null,
      }),
    [entry, portfolio, riskPct, stop, target],
  );

  return (
    <Screen>
      <PushedHeader
        title="Risk calculator"
        subtitle={symbol ? `Sizing a position in ${symbol}` : 'How much to buy, given what a loss may cost'}
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top + 60}
      >
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space['4xl'] }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <Card>
            <TextField
              label="Portfolio balance"
              value={portfolio}
              onChangeText={(text) => {
                const next = sanitizeDecimal(text);
                setPortfolioText(next);
                // Remember it, so the next calculation and the paper account
                // start from the same figure.
                setPortfolio(toNumber(next));
              }}
              keyboardType="decimal-pad"
              prefix="$"
              placeholder="5000"
            />

            <View style={styles.gap}>
              <Stepper
                label="Risk per trade"
                value={riskPct}
                onChange={setRiskPct}
                min={0.5}
                max={20}
                step={0.5}
                format={(v) => `${v}%`}
              />
              <Text variant="caption" tone="tertiary" style={styles.hint}>
                {toNumber(portfolio) > 0
                  ? `You are choosing to risk ${formatUsd(toNumber(portfolio) * (riskPct / 100))} on this idea.`
                  : 'Enter a balance to see what this percentage costs.'}
              </Text>
            </View>
          </Card>

          <Card style={styles.card}>
            <TextField
              label="Entry price"
              value={entry}
              onChangeText={(text) => setEntry(sanitizeDecimal(text))}
              keyboardType="decimal-pad"
              prefix="$"
              placeholder="0.0000124"
            />
            <View style={styles.gap}>
              <TextField
                label="Stop price"
                value={stop}
                onChangeText={(text) => setStop(sanitizeDecimal(text))}
                keyboardType="decimal-pad"
                prefix="$"
                placeholder="0.0000098"
                hint="Where the idea is wrong and you exit."
              />
            </View>
            <View style={styles.gap}>
              <TextField
                label="Target price (optional)"
                value={target}
                onChangeText={(text) => setTarget(sanitizeDecimal(text))}
                keyboardType="decimal-pad"
                prefix="$"
                placeholder="0.0000210"
                hint="Adds the reward leg and a risk/reward ratio."
              />
            </View>
          </Card>

          {result.ok ? (
            <Animated.View entering={FadeIn.duration(200)}>
              <Card style={styles.result} elevated>
                <View style={styles.resultHead}>
                  <Text variant="overline" tone="tertiary">
                    Suggested position
                  </Text>
                  <Badge
                    label={result.direction === 'long' ? 'Long setup' : 'Short setup'}
                    tone={result.direction === 'long' ? 'positive' : 'warning'}
                    size="sm"
                  />
                </View>

                <Text variant="display" tabular style={styles.bigNumber}>
                  {formatUsd(result.positionSizeUsd)}
                </Text>
                <Text variant="caption" tone="tertiary">
                  {formatPctPlain(result.portfolioExposurePct)} of your balance
                  {symbol ? ` · ${formatUnits(result.positionUnits)} ${symbol}` : ''}
                </Text>

                <View style={styles.divider} />

                <StatRow>
                  <Stat label="You risk" value={formatUsd(result.riskAmountUsd)} />
                  <Stat
                    label="If stopped out"
                    value={`−${formatUsd(result.potentialLossUsd)}`}
                    color={palette.negative}
                  />
                  <Stat label="Stop distance" value={formatPctPlain(result.stopDistancePct)} />
                </StatRow>

                <View style={styles.gap}>
                  <StatRow>
                    <Stat
                      label="If target hit"
                      value={
                        result.potentialProfitUsd == null
                          ? NO_DATA
                          : `${result.potentialProfitUsd >= 0 ? '+' : '−'}${formatUsd(Math.abs(result.potentialProfitUsd))}`
                      }
                      color={
                        result.potentialProfitUsd == null
                          ? undefined
                          : result.potentialProfitUsd >= 0
                            ? palette.positive
                            : palette.negative
                      }
                    />
                    <Stat
                      label="Risk / reward"
                      value={result.riskRewardRatio == null ? NO_DATA : `1 : ${result.riskRewardRatio}`}
                    />
                    <Stat label="Units" value={formatUnits(result.positionUnits)} />
                  </StatRow>
                </View>

                {result.warnings.length > 0 ? (
                  <View style={styles.warnings}>
                    {result.warnings.map((warning) => (
                      <View key={warning} style={styles.warning}>
                        <Text variant="label" color={palette.warning} accessibilityElementsHidden>
                          ⚠︎
                        </Text>
                        <Text variant="caption" tone="secondary" style={styles.warningText}>
                          {warning}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </Card>
            </Animated.View>
          ) : (
            <Card style={styles.result}>
              <Text variant="overline" tone="tertiary">
                Suggested position
              </Text>
              <Text variant="body" tone="secondary" style={styles.pending}>
                {result.error}
              </Text>
            </Card>
          )}

          <Text variant="caption" tone="tertiary" style={styles.disclaimer}>
            This is an educational sizing tool. It describes what a predefined loss would cost at a given
            position size — it says nothing about whether a trade will work, and it does not account for
            slippage, fees, or a stop that cannot be filled in a thin pool.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

/** Token units span many orders of magnitude, so compact them like volume. */
function formatUnits(units: number): string {
  if (!Number.isFinite(units) || units <= 0) return NO_DATA;
  if (units >= 1e9) return `${(units / 1e9).toFixed(2)}B`;
  if (units >= 1e6) return `${(units / 1e6).toFixed(2)}M`;
  if (units >= 1e3) return `${(units / 1e3).toFixed(2)}K`;
  if (units >= 1) return units.toFixed(2);
  return formatPrice(units).replace('$', '');
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    paddingHorizontal: space.xl,
    paddingTop: space.sm,
  },
  card: {
    marginTop: space.lg,
  },
  gap: {
    marginTop: space.lg,
  },
  hint: {
    marginTop: space.sm,
    lineHeight: 15,
  },
  result: {
    marginTop: space.xl,
  },
  resultHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    marginBottom: space.md,
  },
  bigNumber: {
    marginBottom: 4,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: palette.border,
    marginVertical: space.lg,
  },
  pending: {
    marginTop: space.md,
    lineHeight: 20,
  },
  warnings: {
    marginTop: space.lg,
    paddingTop: space.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.border,
    gap: space.md,
  },
  warning: {
    flexDirection: 'row',
    gap: space.sm,
    backgroundColor: palette.warningDim,
    borderRadius: radius.sm,
    padding: space.md,
  },
  warningText: {
    flex: 1,
    lineHeight: 16,
  },
  disclaimer: {
    marginTop: space.xl,
    lineHeight: 16,
  },
});
