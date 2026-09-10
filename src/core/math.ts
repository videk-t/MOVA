/** Numeric helpers shared by the scoring and risk engines. All are total: they
 *  never throw and never return NaN for finite-or-nullish input. */

export function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  return Math.min(hi, Math.max(lo, v));
}

/** Map `v` from [lo, hi] onto [0, 100], clamped. `hi` may be below `lo` to invert. */
export function ramp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return 0;
  if (lo === hi) return v >= hi ? 100 : 0;
  const t = (v - lo) / (hi - lo);
  return clamp(t * 100, 0, 100);
}

/** Like {@link ramp} but on a log10 axis — right for money amounts spanning decades. */
export function logRamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v) || v <= 0) return 0;
  const safeLo = Math.max(lo, 1e-9);
  const safeHi = Math.max(hi, safeLo * 10);
  return ramp(Math.log10(v), Math.log10(safeLo), Math.log10(safeHi));
}

/**
 * Bell curve: 100 at `ideal`, falling to 0 at `lo` and `hi`.
 * Used where "too much" is as informative as "too little" (e.g. turnover).
 */
export function band(v: number, lo: number, ideal: number, hi: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v <= lo || v >= hi) return 0;
  return v < ideal ? ramp(v, lo, ideal) : ramp(v, hi, ideal);
}

/** Weighted mean over entries whose value is non-null; null if none qualify. */
export function weightedMean(
  parts: { value: number | null; weight: number }[],
): { value: number | null; coverage: number } {
  let sum = 0;
  let weight = 0;
  let total = 0;
  for (const p of parts) {
    if (p.weight <= 0 || !Number.isFinite(p.weight)) continue;
    total += p.weight;
    if (p.value == null || !Number.isFinite(p.value)) continue;
    sum += clamp(p.value, 0, 100) * p.weight;
    weight += p.weight;
  }
  if (weight <= 0 || total <= 0) return { value: null, coverage: 0 };
  return { value: sum / weight, coverage: weight / total };
}

export function round(v: number, dp = 0): number {
  if (!Number.isFinite(v)) return 0;
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}

/** Safe ratio; null when the denominator is missing, zero or non-finite. */
export function ratio(a: number | null | undefined, b: number | null | undefined): number | null {
  if (!isNum(a) || !isNum(b) || b === 0) return null;
  const r = a / b;
  return Number.isFinite(r) ? r : null;
}
