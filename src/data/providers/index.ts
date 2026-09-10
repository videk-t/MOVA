import type { ProviderBundle } from './types';
import { mockProviders } from './mock';
import { createHttpProviders } from './http';

/**
 * Provider registry.
 *
 * This is the single place that decides where data comes from. Screens and
 * hooks import {@link getProviders}, never a concrete implementation, so moving
 * from the demo generator to a live backend — or swapping one vendor for
 * another behind that backend — touches nothing above this file.
 */

export type DataMode = 'mock' | 'live';

function readMode(): DataMode {
  return process.env.EXPO_PUBLIC_DATA_MODE === 'live' ? 'live' : 'mock';
}

function readBaseUrl(): string {
  const url = process.env.EXPO_PUBLIC_API_URL;
  return typeof url === 'string' && url.length > 0 ? url : '';
}

let override: ProviderBundle | null = null;

/**
 * Force a bundle at runtime. Used by the Profile screen's data-source switch so
 * the demo can be toggled without a rebuild, and by tests.
 */
export function setProviderOverride(bundle: ProviderBundle | null): void {
  override = bundle;
}

/** Whether a runtime override is currently in force. */
export function isProviderOverridden(): boolean {
  return override != null;
}

export function getProviders(): ProviderBundle {
  if (override) return override;

  if (readMode() === 'live') {
    const baseUrl = readBaseUrl();
    if (baseUrl.length === 0) {
      // Misconfiguration must not produce a blank app. Fall back to the demo
      // bundle, which is self-labelling, rather than failing every screen.
      if (__DEV__) {
        console.warn('[MOVA] EXPO_PUBLIC_DATA_MODE=live but EXPO_PUBLIC_API_URL is unset. Using demo data.');
      }
      return mockProviders;
    }
    return createHttpProviders(baseUrl);
  }

  return mockProviders;
}

export function getConfiguredMode(): DataMode {
  return readMode() === 'live' && readBaseUrl().length > 0 ? 'live' : 'mock';
}

export { mockProviders, createHttpProviders };
export * from './types';
