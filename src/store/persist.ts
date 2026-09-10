import AsyncStorage from '@react-native-async-storage/async-storage';
import { createJSONStorage, type PersistOptions } from 'zustand/middleware';

/**
 * Shared persistence setup for every store.
 *
 * MOVA holds no funds and no credentials, so everything here is user-authored
 * content — watchlists, alert rules, journal entries, preferences. It lives in
 * plain AsyncStorage on the device and is never sent anywhere.
 */

export const storage = createJSONStorage(() => AsyncStorage);

/**
 * A rehydration guard. Persisted state written by an older build can be any
 * shape at all, so each store validates what comes back rather than trusting it.
 */
export function safeMerge<T extends object>(
  validate: (persisted: unknown, current: T) => T,
): PersistOptions<T>['merge'] {
  return (persisted, current) => {
    try {
      return validate(persisted, current);
    } catch {
      // A corrupt payload must not brick the app; start clean instead.
      return current;
    }
  };
}

export function asArray<T>(value: unknown, isValid: (item: unknown) => item is T, max = 1_000): T[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isValid).slice(0, max);
}

export function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

export function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Collision-resistant enough for local records; not a security primitive. */
export function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
