import { StyleSheet, View } from 'react-native';
import type { Holder, TokenSecurity } from '@/core/types';
import { formatPctPlain, formatUsdCompact, NO_DATA, shortenAddress } from '@/core/format';
import { isNum } from '@/core/math';
import { palette, radius, space } from '@/theme';
import { Card } from '@/ui/Card';
import { Text } from '@/ui/Text';
import { CheckRow } from '@/ui/Stat';
import { Skeleton } from '@/ui/Skeleton';

/**
 * Safety panel.
 *
 * Three outcomes per check, not two: pass, fail, and "the provider could not
 * tell us". Collapsing the third into a fail would make every thinly-covered
 * token look malicious; collapsing it into a pass would be dangerous.
 */
export function SafetyPanel({
  security,
  holders,
  holdersLoading,
}: {
  security: TokenSecurity;
  holders: Holder[];
  holdersLoading: boolean;
}) {
  const lpStatus =
    isNum(security.lpBurnedPct) ? security.lpBurnedPct >= 90 : security.lpLocked;
  const lpDetail = isNum(security.lpBurnedPct)
    ? `${formatPctPlain(security.lpBurnedPct, 0)} burned`
    : security.lpLocked == null
      ? 'Unknown'
      : security.lpLocked
        ? 'Locked'
        : 'Unlocked';

  // Concentration is graded rather than pass/fail — 23% is neither clean nor a
  // red flag, and forcing it into a tick would lose that.
  const top10 = security.top10HolderPct;
  const top10Status = top10 == null ? null : top10 <= 25;
  const top10Color =
    top10 == null ? undefined : top10 <= 25 ? palette.positive : top10 <= 40 ? palette.warning : palette.negative;
  const top10Icon = top10 == null ? undefined : top10 <= 25 ? '✓' : top10 <= 40 ? '!' : '✕';

  const devPct = security.devHoldingPct;
  const devStatus = devPct == null ? null : devPct <= 5 && (security.devSoldPct ?? 0) === 0;
  const devDetail =
    devPct == null
      ? 'Unknown'
      : (security.devSoldPct ?? 0) > 0
        ? `Sold ${formatPctPlain(security.devSoldPct, 1)}`
        : `Holds ${formatPctPlain(devPct, 1)}`;

  const liqTrend = security.liquidityChange24hPct;

  return (
    <Card style={styles.card}>
      {security.sellsSucceeding === false ? (
        <View style={styles.honeypot}>
          <Text variant="labelSemi" color={palette.negative}>
            ⚠︎ Sells are failing
          </Text>
          <Text variant="caption" tone="secondary" style={styles.honeypotBody}>
            Transactions selling this token are not completing. This is the defining behaviour of a honeypot:
            funds put in should be treated as unrecoverable.
          </Text>
        </View>
      ) : null}

      <View style={styles.checks}>
        <CheckRow
          label="Mint authority"
          status={security.mintAuthorityRevoked}
          detail={
            security.mintAuthorityRevoked == null
              ? 'Unknown'
              : security.mintAuthorityRevoked
                ? 'Revoked'
                : 'Active'
          }
        />
        <Divider />
        <CheckRow
          label="Freeze authority"
          status={security.freezeAuthorityRevoked}
          detail={
            security.freezeAuthorityRevoked == null
              ? 'Unknown'
              : security.freezeAuthorityRevoked
                ? 'Revoked'
                : 'Active'
          }
        />
        <Divider />
        <CheckRow label="Liquidity pool" status={lpStatus} detail={lpDetail} />
        <Divider />
        <CheckRow
          label="Top 10 holders"
          status={top10Status}
          detail={top10 == null ? 'Unknown' : formatPctPlain(top10, 1)}
          overrideIcon={top10Icon}
          overrideColor={top10Color}
        />
        <Divider />
        <CheckRow label="Deployer wallet" status={devStatus} detail={devDetail} />
        <Divider />
        <CheckRow
          label="Sells succeeding"
          status={security.sellsSucceeding}
          detail={
            security.sellsSucceeding == null
              ? 'Not verified'
              : security.sellsSucceeding
                ? 'Confirmed'
                : 'Failing'
          }
        />
        <Divider />
        <CheckRow
          label="Liquidity 24h"
          status={liqTrend == null ? null : liqTrend > -15}
          detail={liqTrend == null ? 'Unknown' : `${liqTrend > 0 ? '+' : ''}${liqTrend.toFixed(1)}%`}
          overrideColor={
            liqTrend == null ? undefined : liqTrend >= 0 ? palette.positive : liqTrend > -20 ? palette.warning : palette.negative
          }
          overrideIcon={liqTrend == null ? undefined : liqTrend >= 0 ? '✓' : liqTrend > -20 ? '!' : '✕'}
        />
      </View>

      <LaunchCohorts security={security} />

      <View style={styles.holders}>
        <Text variant="labelSemi" tone="secondary" style={styles.holdersTitle}>
          Largest holders
        </Text>
        {holdersLoading ? (
          <View style={styles.holderList}>
            <Skeleton height={16} />
            <Skeleton height={16} />
            <Skeleton height={16} />
          </View>
        ) : holders.length === 0 ? (
          <Text variant="caption" tone="tertiary">
            Data unavailable — the provider does not expose holder distribution for this token.
          </Text>
        ) : (
          <View style={styles.holderList}>
            {holders.slice(0, 6).map((holder, index) => (
              <View key={holder.address} style={styles.holderRow}>
                <Text variant="caption" tone="tertiary" tabular style={styles.holderRank}>
                  {index + 1}
                </Text>
                <Text variant="caption" tone="secondary" style={styles.holderAddress} numberOfLines={1}>
                  {holder.label ?? shortenAddress(holder.address, 5, 4)}
                </Text>
                <View style={styles.holderBarTrack}>
                  <View
                    style={[
                      styles.holderBarFill,
                      {
                        width: `${Math.min(100, holder.pct * 2.5)}%`,
                        backgroundColor: holder.isContract ? palette.info : palette.brand,
                      },
                    ]}
                  />
                </View>
                <Text variant="caption" tabular tone="secondary" style={styles.holderPct}>
                  {formatPctPlain(holder.pct, 1)}
                </Text>
                <Text variant="caption" tone="tertiary" tabular style={styles.holderValue}>
                  {formatUsdCompact(holder.valueUsd)}
                </Text>
              </View>
            ))}
            <Text variant="caption" tone="tertiary" style={styles.holderNote}>
              Pool addresses are marked in blue and are not a concentration risk.
            </Text>
          </View>
        )}
      </View>
    </Card>
  );
}

/**
 * Launch-time cohorts. These only matter in combination, so they are grouped
 * rather than listed as three unrelated checks.
 */
function LaunchCohorts({ security }: { security: TokenSecurity }) {
  const rows: { label: string; value: number | null; caution: number }[] = [
    { label: 'Bundled at launch', value: security.bundledPct, caution: 15 },
    { label: 'Sniper wallets', value: security.sniperPct, caution: 12 },
    { label: 'Insider-linked', value: security.insiderPct, caution: 12 },
  ];

  if (rows.every((r) => r.value == null)) {
    return (
      <View style={styles.cohorts}>
        <Text variant="labelSemi" tone="secondary">
          Launch distribution
        </Text>
        <Text variant="caption" tone="tertiary">
          Data unavailable for this token.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.cohorts}>
      <Text variant="labelSemi" tone="secondary">
        Launch distribution
      </Text>
      <View style={styles.cohortRow}>
        {rows.map((row) => {
          const color =
            row.value == null
              ? palette.textTertiary
              : row.value >= row.caution * 2
                ? palette.negative
                : row.value >= row.caution
                  ? palette.warning
                  : palette.positive;
          return (
            <View key={row.label} style={styles.cohort}>
              <Text variant="h3" tabular color={color}>
                {row.value == null ? NO_DATA : formatPctPlain(row.value, 0)}
              </Text>
              <Text variant="caption" tone="tertiary" numberOfLines={2}>
                {row.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  card: {
    gap: space.lg,
  },
  honeypot: {
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: palette.negativeDim,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.negative,
    gap: 4,
  },
  honeypotBody: {
    lineHeight: 17,
  },
  checks: {
    marginVertical: -space.sm,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: palette.border,
  },
  cohorts: {
    gap: space.sm,
  },
  cohortRow: {
    flexDirection: 'row',
    gap: space.md,
  },
  cohort: {
    flex: 1,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: palette.bgElevated,
    gap: 2,
  },
  holders: {
    gap: space.sm,
  },
  holdersTitle: {
    marginBottom: 2,
  },
  holderList: {
    gap: space.sm,
  },
  holderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  holderRank: {
    width: 12,
  },
  holderAddress: {
    width: 78,
  },
  holderBarTrack: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    backgroundColor: palette.surfaceHigh,
    overflow: 'hidden',
  },
  holderBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  holderPct: {
    width: 42,
    textAlign: 'right',
  },
  holderValue: {
    width: 52,
    textAlign: 'right',
  },
  holderNote: {
    marginTop: 2,
    lineHeight: 15,
  },
});
