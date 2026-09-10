import { forwardRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import type { TokenRef } from '@/core/types';
import { shortenAddress } from '@/core/format';
import { palette, radius, space } from '@/theme';
import { Sheet, type SheetRef } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { commit, success } from '@/ui/haptics';
import { openVenue, VENUES } from '@/data/venues';

/**
 * Trade-out.
 *
 * MOVA is the research layer and stops at the point of execution. This sheet
 * hands the token address to a platform the user already trades on — nothing
 * here signs, holds, or transfers anything, and the copy states that plainly
 * rather than burying it.
 */
export const TradeOutSheet = forwardRef<SheetRef, { token: TokenRef }>(function TradeOutSheet({ token }, ref) {
  const [copied, setCopied] = useState(false);

  const executes = VENUES.filter((v) => v.executes);
  const research = VENUES.filter((v) => !v.executes);

  return (
    <Sheet
      ref={ref}
      title={`Trade ${token.symbol}`}
      subtitle="MOVA provides research and analytics. Trading is performed on external platforms."
      snapPoints={['76%']}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Copy token address ${token.address}`}
        onPress={async () => {
          await Clipboard.setStringAsync(token.address);
          success();
          setCopied(true);
          setTimeout(() => setCopied(false), 1_800);
        }}
        style={styles.addressRow}
      >
        <View style={styles.addressText}>
          <Text variant="caption" tone="tertiary">
            Token address
          </Text>
          <Text variant="bodyMedium" tabular numberOfLines={1}>
            {shortenAddress(token.address, 8, 8)}
          </Text>
        </View>
        <Text variant="labelSemi" tone={copied ? 'positive' : 'brand'}>
          {copied ? 'Copied' : 'Copy'}
        </Text>
      </Pressable>

      <Text variant="labelSemi" tone="secondary" style={styles.groupLabel}>
        Execute on
      </Text>
      <View style={styles.grid}>
        {executes.map((venue) => (
          <VenueTile
            key={venue.id}
            emoji={venue.emoji}
            name={venue.name}
            description={venue.description}
            onPress={() => {
              commit();
              void openVenue(venue, token.address);
            }}
          />
        ))}
      </View>

      <Text variant="labelSemi" tone="secondary" style={styles.groupLabel}>
        Verify and research
      </Text>
      <View style={styles.grid}>
        {research.map((venue) => (
          <VenueTile
            key={venue.id}
            emoji={venue.emoji}
            name={venue.name}
            description={venue.description}
            onPress={() => {
              commit();
              void openVenue(venue, token.address);
            }}
          />
        ))}
      </View>

      <View style={styles.disclaimer}>
        <Text variant="caption" tone="secondary" style={styles.disclaimerText}>
          MOVA does not execute trades, hold funds, or connect to your wallet. These links open the platform in a
          browser with the token address filled in. Check the address on the destination page before trading —
          tokens are frequently cloned under the same ticker.
        </Text>
      </View>
    </Sheet>
  );
});

function VenueTile({
  emoji,
  name,
  description,
  onPress,
}: {
  emoji: string;
  name: string;
  description: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Open ${name}. ${description}`}
      accessibilityHint="Opens an external platform in a browser"
      onPress={onPress}
      style={styles.tile}
    >
      <Text variant="h3" accessibilityElementsHidden>
        {emoji}
      </Text>
      <Text variant="bodyMedium">{name}</Text>
      <Text variant="caption" tone="tertiary" numberOfLines={2} style={styles.tileDescription}>
        {description}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.md,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    marginBottom: space.xl,
  },
  addressText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  groupLabel: {
    marginBottom: space.md,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.md,
    marginBottom: space.xl,
  },
  tile: {
    width: '47%',
    flexGrow: 1,
    padding: space.lg,
    borderRadius: radius.md,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    gap: 4,
  },
  tileDescription: {
    lineHeight: 15,
  },
  disclaimer: {
    padding: space.lg,
    borderRadius: radius.md,
    backgroundColor: palette.bgElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  disclaimerText: {
    lineHeight: 17,
  },
});
