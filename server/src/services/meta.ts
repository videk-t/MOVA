import type { DataMeta } from '@/core/types';

/**
 * Response metadata.
 *
 * `sources` and `missing` are not decoration. MOVA's contract with the user is
 * that it never presents an absent measurement as a real one, and `missing` is
 * how the server says which fields it could not obtain — the app renders those
 * as "Data unavailable" and the score model drops them from its weighting
 * rather than scoring them as zero.
 */
export function meta(sources: string[], missing: string[] = []): DataMeta {
  return {
    origin: 'live',
    fetchedAt: Date.now(),
    sources: [...new Set(sources)].slice(0, 8),
    missing: missing.length > 0 ? [...new Set(missing)].slice(0, 24) : undefined,
  };
}

/** Wrap a payload in the envelope the app's HTTP provider expects. */
export function envelope<T>(data: T, sources: string[], missing: string[] = []) {
  return { data, meta: meta(sources, missing) };
}

/**
 * Fields no keyless deployment can populate.
 *
 * Listed explicitly so the gap is visible in every response rather than
 * inferred from a screen full of dashes. Adding a vendor key removes entries
 * from this list; it does not change any other code.
 */
export const KEYLESS_GAPS = [
  'holders',
  'devHoldingPct',
  'devSoldPct',
  'insiderPct',
  'bundledPct',
  'sniperPct',
  'sellsSucceeding',
  'lpBurnedPct',
  'smartMoney',
  'socialMetrics',
] as const;
