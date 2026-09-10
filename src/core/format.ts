import { isNum } from './math';

export const NO_DATA = '—';

/**
 * Compact USD for market caps, volume and liquidity: $1.24M, $856K, $12.4B.
 * Returns {@link NO_DATA} for anything non-finite so the UI never prints NaN.
 */
export function formatUsdCompact(value: number | null | undefined): string {
  if (!isNum(value)) return NO_DATA;
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1e12) return `${sign}$${trim(abs / 1e12)}T`;
  if (abs >= 1e9) return `${sign}$${trim(abs / 1e9)}B`;
  if (abs >= 1e6) return `${sign}$${trim(abs / 1e6)}M`;
  if (abs >= 1e3) return `${sign}$${trim(abs / 1e3)}K`;
  return `${sign}$${abs.toFixed(abs < 10 ? 2 : 0)}`;
}

function trim(v: number): string {
  if (v >= 100) return v.toFixed(0);
  if (v >= 10) return v.toFixed(1);
  return v.toFixed(2);
}

/**
 * Prices for memecoins span many orders of magnitude, so significant digits
 * matter more than a fixed decimal count. Sub-cent values use subscript-style
 * zero compression: $0.0₅4821.
 */
export function formatPrice(value: number | null | undefined): string {
  if (!isNum(value)) return NO_DATA;
  if (value === 0) return '$0';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';

  // Above a million, full notation ($2,649,730.53) is 13 characters and will
  // crush a list row. Significant digits matter more than exactness here.
  if (abs >= 1e6) return formatUsdCompact(value);
  if (abs >= 1000) return `${sign}$${abs.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  if (abs >= 1) return `${sign}$${abs.toFixed(3)}`;
  if (abs >= 0.001) return `${sign}$${abs.toFixed(5)}`;

  // Count leading zeros after the decimal point.
  const exp = Math.floor(Math.log10(abs));
  const leadingZeros = Math.abs(exp) - 1;
  const digits = Math.round(abs * 10 ** (leadingZeros + 4)) / 1;
  return `${sign}$0.0${toSubscript(leadingZeros)}${String(digits).padStart(4, '0').slice(0, 4)}`;
}

const SUBSCRIPTS = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'];

function toSubscript(n: number): string {
  return String(n)
    .split('')
    .map((d) => SUBSCRIPTS[Number(d)] ?? d)
    .join('');
}

/** Signed percentage: +47.2%, -8.4%. */
export function formatPct(value: number | null | undefined, dp = 1): string {
  if (!isNum(value)) return NO_DATA;
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(dp)}%`;
}

/** Unsigned percentage for shares of supply etc. */
export function formatPctPlain(value: number | null | undefined, dp = 1): string {
  if (!isNum(value)) return NO_DATA;
  return `${value.toFixed(dp)}%`;
}

export function formatNumber(value: number | null | undefined): string {
  if (!isNum(value)) return NO_DATA;
  return Math.round(value).toLocaleString('en-US');
}

export function formatCompactNumber(value: number | null | undefined): string {
  if (!isNum(value)) return NO_DATA;
  const abs = Math.abs(value);
  if (abs >= 1e6) return `${trim(abs / 1e6)}M`;
  if (abs >= 1e3) return `${trim(abs / 1e3)}K`;
  return String(Math.round(value));
}

/** Full-precision USD with cents, for money the user typed. */
export function formatUsd(value: number | null | undefined): string {
  if (!isNum(value)) return NO_DATA;
  const sign = value < 0 ? '-' : '';
  return `${sign}$${Math.abs(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** "4m ago", "3h ago", "2d ago". */
export function formatRelativeTime(at: number | null | undefined, now: number = Date.now()): string {
  if (!isNum(at)) return NO_DATA;
  const diff = Math.max(0, now - at);
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

/** "3h", "2d 4h" — used for token age. */
export function formatAge(hours: number | null | undefined): string {
  if (!isNum(hours) || hours < 0) return NO_DATA;
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
  if (hours < 24) return `${Math.floor(hours)}h`;
  const days = Math.floor(hours / 24);
  const rem = Math.floor(hours % 24);
  if (days < 10 && rem > 0) return `${days}d ${rem}h`;
  return `${days}d`;
}

/** Middle-truncated wallet or mint address: 7xKX…9fRt. */
export function shortenAddress(address: string | null | undefined, lead = 4, tail = 4): string {
  if (typeof address !== 'string' || address.length === 0) return NO_DATA;
  if (address.length <= lead + tail + 1) return address;
  return `${address.slice(0, lead)}…${address.slice(-tail)}`;
}

/** Score for display: an integer, or "—" when the model withheld it. */
export function formatScore(score: number | null | undefined): string {
  if (!isNum(score)) return NO_DATA;
  return String(Math.round(score));
}
