import { useCallback, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { TradeMode } from '@/core/journal-stats';
import { tradePnl, tradePnlPct } from '@/core/journal-stats';
import { sanitizeDecimal, toNumber } from '@/core/input';
import { isSolanaAddress } from '@/core/normalize';
import { formatPct, formatPrice, formatUsd, NO_DATA } from '@/core/format';
import { deltaColor, palette, space } from '@/theme';
import { Screen, PushedHeader } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { Badge } from '@/ui/Badge';
import { Segmented } from '@/ui/Segmented';
import { TextField } from '@/ui/Field';
import { Stat, StatRow } from '@/ui/Stat';
import { EmptyState } from '@/ui/States';
import { TokenLogo } from '@/ui/TokenLogo';
import { useJournal } from '@/store/journal';
import { success, error as errorHaptic } from '@/ui/haptics';

const SETUPS = ['Breakout', 'Dip buy', 'Momentum', 'Reversal', 'Narrative', 'Other'];

/**
 * Record or close a journal entry.
 *
 * One route covers both, because closing is the same act of writing down what
 * happened — and doing it on a full screen rather than a sheet keeps the
 * multi-line reasoning fields comfortable to type into.
 *
 * Every figure here is entered by hand. MOVA has no connection to a wallet or
 * an exchange and cannot read a real position.
 */
export default function TradeFormScreen() {
  const params = useLocalSearchParams<{
    mode?: string;
    address?: string;
    symbol?: string;
    price?: string;
    score?: string;
    close?: string;
  }>();

  const closeId = typeof params.close === 'string' && params.close.length > 0 ? params.close : null;

  return closeId ? <CloseTrade id={closeId} /> : <NewTrade params={params} />;
}

// ---------------------------------------------------------------------------
// Opening
// ---------------------------------------------------------------------------

function NewTrade({
  params,
}: {
  params: { mode?: string; address?: string; symbol?: string; price?: string; score?: string };
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const open = useJournal((s) => s.open);

  const [mode, setMode] = useState<TradeMode>(params.mode === 'real' ? 'real' : 'paper');
  const [symbol, setSymbol] = useState(typeof params.symbol === 'string' ? params.symbol : '');
  const [address, setAddress] = useState(isSolanaAddress(params.address) ? params.address : '');
  const [size, setSize] = useState('');
  const [entry, setEntry] = useState(() =>
    typeof params.price === 'string' ? sanitizeDecimal(params.price) : '',
  );
  const [setup, setSetup] = useState(SETUPS[0]!);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const scoreAtEntry = useMemo(() => {
    const parsed = toNumber(typeof params.score === 'string' ? params.score : '', Number.NaN);
    return Number.isFinite(parsed) ? parsed : null;
  }, [params.score]);

  const sizeUsd = toNumber(size);
  const entryPrice = toNumber(entry);

  const errors = {
    symbol: symbol.trim().length === 0 ? 'Enter a ticker.' : null,
    size: sizeUsd <= 0 ? 'Enter a position size above zero.' : null,
    entry: entryPrice <= 0 ? 'Enter an entry price above zero.' : null,
  };
  const valid = !errors.symbol && !errors.size && !errors.entry;

  const save = useCallback(() => {
    setSubmitted(true);
    if (!valid) {
      errorHaptic();
      return;
    }

    open({
      ref: {
        // A manually recorded trade need not have a mint address. Namespacing
        // the fallback keeps it from ever being mistaken for a real one.
        address: isSolanaAddress(address) ? address : `local:${symbol.trim().toUpperCase()}`,
        symbol: symbol.trim().toUpperCase().slice(0, 16),
        name: symbol.trim().toUpperCase().slice(0, 16),
        logoUri: null,
        chain: 'solana',
      },
      mode,
      sizeUsd,
      entryPrice,
      setup,
      entryReason: reason,
      notes,
      scoreAtEntry,
    });

    success();
    if (router.canGoBack()) router.back();
    else router.replace(mode === 'paper' ? '/tools/paper' : '/tools/journal');
  }, [address, entryPrice, mode, notes, open, reason, router, scoreAtEntry, setup, sizeUsd, symbol, valid]);

  return (
    <Screen>
      <PushedHeader
        title="Record a trade"
        subtitle={mode === 'paper' ? 'Simulated — no real money' : 'Manually recorded'}
        right={mode === 'paper' ? <Badge label="PAPER" tone="warning" size="sm" /> : undefined}
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top + 60}
      >
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <Segmented
            options={[
              { value: 'paper' as TradeMode, label: '📝  Paper' },
              { value: 'real' as TradeMode, label: '💵  Real' },
            ]}
            value={mode}
            onChange={setMode}
            accessibilityLabel="Trade type"
          />
          <Text variant="caption" tone="tertiary" style={styles.hint}>
            {mode === 'paper'
              ? 'Simulated trades are kept apart from your real record, so they never flatter your statistics.'
              : 'A real trade you placed elsewhere. MOVA only stores what you type — it cannot see your wallet.'}
          </Text>

          <Card style={styles.card}>
            <TextField
              label="Ticker"
              value={symbol}
              onChangeText={setSymbol}
              placeholder="ABC"
              maxLength={16}
              autoFocus={symbol.length === 0}
              error={submitted ? errors.symbol : null}
            />
            <View style={styles.gap}>
              <TextField
                label="Mint address (optional)"
                value={address}
                onChangeText={setAddress}
                placeholder="Paste to track live prices"
                hint={
                  address.length > 0 && !isSolanaAddress(address)
                    ? 'That does not look like a Solana mint address. The trade will still be saved.'
                    : 'Needed for live price tracking on open positions.'
                }
                maxLength={64}
              />
            </View>
          </Card>

          <Card style={styles.card}>
            <TextField
              label="Position size"
              value={size}
              onChangeText={(text) => setSize(sanitizeDecimal(text))}
              keyboardType="decimal-pad"
              prefix="$"
              placeholder="250"
              error={submitted ? errors.size : null}
            />
            <View style={styles.gap}>
              <TextField
                label="Entry price"
                value={entry}
                onChangeText={(text) => setEntry(sanitizeDecimal(text))}
                keyboardType="decimal-pad"
                prefix="$"
                placeholder="0.0000124"
                error={submitted ? errors.entry : null}
                hint={
                  sizeUsd > 0 && entryPrice > 0
                    ? `That is ${(sizeUsd / entryPrice).toLocaleString('en-US', { maximumFractionDigits: 2 })} tokens.`
                    : undefined
                }
              />
            </View>
          </Card>

          <Text variant="overline" tone="tertiary" style={styles.sectionLabel}>
            Setup
          </Text>
          <View style={styles.setups}>
            {SETUPS.map((option) => (
              <Button
                key={option}
                label={option}
                variant={option === setup ? 'primary' : 'secondary'}
                size="sm"
                onPress={() => setSetup(option)}
                style={styles.setupButton}
              />
            ))}
          </View>

          <Card style={styles.card}>
            <TextField
              label="Why are you entering?"
              value={reason}
              onChangeText={setReason}
              placeholder="What the data showed, and what would prove you wrong."
              multiline
              maxLength={1000}
              hint="The most useful field in the journal when you review this later."
            />
            <View style={styles.gap}>
              <TextField
                label="Notes (optional)"
                value={notes}
                onChangeText={setNotes}
                placeholder="Anything else worth remembering."
                multiline
                maxLength={2000}
              />
            </View>
          </Card>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + space.lg }]}>
          <Button
            label={mode === 'paper' ? 'Open paper position' : 'Save trade'}
            fullWidth
            size="lg"
            onPress={save}
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Closing
// ---------------------------------------------------------------------------

function CloseTrade({ id }: { id: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const trade = useJournal((s) => s.trades.find((t) => t.id === id) ?? null);
  const close = useJournal((s) => s.close);

  const [exit, setExit] = useState('');
  const [reason, setReason] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const exitPrice = toNumber(exit);

  // Preview the result using the same maths that will record it, so the number
  // shown while typing is the number that gets stored.
  const preview = useMemo(() => {
    if (!trade || exitPrice <= 0) return null;
    // `closedAt` plays no part in the P/L maths, so it is filled with the open
    // time rather than a clock read — reading the clock during render is impure
    // and would make this memo non-deterministic.
    const hypothetical = { ...trade, status: 'closed' as const, exitPrice, closedAt: trade.openedAt };
    return { pnl: tradePnl(hypothetical), pct: tradePnlPct(hypothetical) };
  }, [exitPrice, trade]);

  const confirm = useCallback(() => {
    setSubmitted(true);
    if (!trade || exitPrice <= 0) {
      errorHaptic();
      return;
    }
    close(trade.id, exitPrice, reason);
    success();
    if (router.canGoBack()) router.back();
    else router.replace(trade.mode === 'paper' ? '/tools/paper' : '/tools/journal');
  }, [close, exitPrice, reason, router, trade]);

  if (!trade) {
    return (
      <Screen>
        <PushedHeader title="Close position" />
        <EmptyState
          emoji="🔎"
          title="Entry not found"
          message="This trade is no longer in your journal. It may have been deleted."
          actionLabel="Back to journal"
          onAction={() => router.replace('/tools/journal')}
        />
      </Screen>
    );
  }

  if (trade.status === 'closed') {
    return (
      <Screen>
        <PushedHeader title="Close position" />
        <EmptyState
          emoji="✅"
          title="Already closed"
          message={`${trade.tokenSymbol} was closed at ${formatPrice(trade.exitPrice)}.`}
          actionLabel="Back to journal"
          onAction={() => router.replace(trade.mode === 'paper' ? '/tools/paper' : '/tools/journal')}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <PushedHeader
        title={`Close ${trade.tokenSymbol}`}
        subtitle={trade.mode === 'paper' ? 'Simulated — no real money' : 'Manually recorded'}
        right={trade.mode === 'paper' ? <Badge label="PAPER" tone="warning" size="sm" /> : undefined}
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top + 60}
      >
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <Card>
            <View style={styles.positionHead}>
              <TokenLogo uri={trade.tokenLogo} symbol={trade.tokenSymbol} size={38} />
              <View style={styles.flex}>
                <Text variant="bodyMedium">{trade.tokenSymbol}</Text>
                <Text variant="caption" tone="tertiary">
                  {trade.setup}
                </Text>
              </View>
            </View>
            <View style={styles.gap}>
              <StatRow>
                <Stat label="Size" value={formatUsd(trade.sizeUsd)} />
                <Stat label="Entry" value={formatPrice(trade.entryPrice)} />
                <Stat
                  label="Score at entry"
                  value={trade.scoreAtEntry == null ? NO_DATA : String(Math.round(trade.scoreAtEntry))}
                />
              </StatRow>
            </View>
          </Card>

          <Card style={styles.card}>
            <TextField
              label="Exit price"
              value={exit}
              onChangeText={(text) => setExit(sanitizeDecimal(text))}
              keyboardType="decimal-pad"
              prefix="$"
              placeholder="0.0000210"
              autoFocus
              error={submitted && exitPrice <= 0 ? 'Enter an exit price above zero.' : null}
            />
            <View style={styles.gap}>
              <TextField
                label="Why are you exiting?"
                value={reason}
                onChangeText={setReason}
                placeholder="Target hit, thesis broke, stop triggered…"
                multiline
                maxLength={1000}
              />
            </View>
          </Card>

          {preview?.pnl != null ? (
            <Card style={styles.card} elevated>
              <Text variant="overline" tone="tertiary">
                Result
              </Text>
              <Text
                variant="display"
                tabular
                color={deltaColor(preview.pnl)}
                style={styles.previewNumber}
              >
                {preview.pnl >= 0 ? '+' : '−'}
                {formatUsd(Math.abs(preview.pnl))}
              </Text>
              <Text variant="bodyMedium" tabular color={deltaColor(preview.pct)}>
                {formatPct(preview.pct)} on the position
              </Text>
            </Card>
          ) : null}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + space.lg }]}>
          <Button label="Close position" fullWidth size="lg" onPress={confirm} />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
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
    paddingHorizontal: space.xs,
    lineHeight: 15,
  },
  sectionLabel: {
    marginTop: space.xl,
    marginBottom: space.md,
    paddingHorizontal: space.xs,
  },
  setups: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  setupButton: {
    flexGrow: 1,
  },
  positionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  previewNumber: {
    marginTop: space.sm,
    marginBottom: 2,
  },
  footer: {
    paddingHorizontal: space.xl,
    paddingTop: space.md,
    backgroundColor: palette.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.border,
  },
});
