import * as WebBrowser from 'expo-web-browser';
import { isSolanaAddress } from '@/core/normalize';
import type { TradeVenue } from '@/store/settings';

/**
 * Trade-out links.
 *
 * MOVA does not execute trades, hold funds, custody keys or sign transactions.
 * These links hand the token address to a platform the user already uses, and
 * that is the entire extent of the integration.
 *
 * The address is validated and URL-encoded before it is ever interpolated —
 * token addresses reach us from third-party APIs and are not to be trusted with
 * URL construction.
 */

export interface Venue {
  id: TradeVenue;
  name: string;
  description: string;
  emoji: string;
  /** Whether the venue supports actually placing an order. */
  executes: boolean;
  buildUrl: (address: string) => string;
}

export const VENUES: Venue[] = [
  {
    id: 'gmgn',
    name: 'GMGN',
    description: 'Fast memecoin execution with a built-in wallet.',
    emoji: '⚡',
    executes: true,
    buildUrl: (a) => `https://gmgn.ai/sol/token/${encodeURIComponent(a)}`,
  },
  {
    id: 'fomo',
    name: 'FOMO',
    description: 'Social-first trading and token discovery.',
    emoji: '🔥',
    executes: true,
    buildUrl: (a) => `https://fomo.biz/token/${encodeURIComponent(a)}`,
  },
  {
    id: 'jupiter',
    name: 'Jupiter',
    description: 'Solana aggregator routing for best execution.',
    emoji: '🪐',
    executes: true,
    buildUrl: (a) => `https://jup.ag/swap/SOL-${encodeURIComponent(a)}`,
  },
  {
    id: 'dexscreener',
    name: 'DexScreener',
    description: 'Charts, pairs and pool history.',
    emoji: '📊',
    executes: false,
    buildUrl: (a) => `https://dexscreener.com/solana/${encodeURIComponent(a)}`,
  },
  {
    id: 'birdeye',
    name: 'Birdeye',
    description: 'Market data, holders and trade history.',
    emoji: '🦅',
    executes: false,
    buildUrl: (a) => `https://birdeye.so/token/${encodeURIComponent(a)}?chain=solana`,
  },
  {
    id: 'solscan',
    name: 'Solscan',
    description: 'On-chain explorer — verify the mint yourself.',
    emoji: '🔍',
    executes: false,
    buildUrl: (a) => `https://solscan.io/token/${encodeURIComponent(a)}`,
  },
];

export function venueById(id: TradeVenue): Venue | undefined {
  return VENUES.find((v) => v.id === id);
}

/** Returns false when the address is not a plausible mint, without opening anything. */
export async function openVenue(venue: Venue, address: string): Promise<boolean> {
  if (!isSolanaAddress(address)) return false;
  try {
    await WebBrowser.openBrowserAsync(venue.buildUrl(address), {
      // In-app browser keeps the user in MOVA and does not expose the session
      // to an external app.
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
      toolbarColor: '#07080C',
      controlsColor: '#8B77FF',
    });
    return true;
  } catch {
    return false;
  }
}

export async function openUrl(url: string): Promise<boolean> {
  // Only http(s) — links arriving from token metadata are untrusted.
  if (!/^https?:\/\//i.test(url)) return false;
  try {
    await WebBrowser.openBrowserAsync(url, {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
      toolbarColor: '#07080C',
      controlsColor: '#8B77FF',
    });
    return true;
  } catch {
    return false;
  }
}
