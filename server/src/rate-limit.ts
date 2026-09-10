/**
 * Per-client rate limiting.
 *
 * MOVA's backend fans one request out to several third-party APIs, so an
 * unthrottled client does not just cost CPU — it burns shared vendor quota and
 * degrades the service for everyone connected. A sliding window keeps one
 * misbehaving caller from doing that.
 *
 * In-process, like the cache: correct for a single instance, and the file to
 * replace when MOVA runs more than one.
 */

interface Window {
  hits: number[];
}

const WINDOW_MS = 60_000;
const MAX_CLIENTS = 10_000;

const windows = new Map<string, Window>();

export interface RateVerdict {
  allowed: boolean;
  remaining: number;
  /** Seconds until the caller may retry. Only meaningful when blocked. */
  retryAfter: number;
}

export function check(key: string, limitPerMinute: number): RateVerdict {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;

  let window = windows.get(key);
  if (!window) {
    if (windows.size >= MAX_CLIENTS) evict(cutoff);
    window = { hits: [] };
    windows.set(key, window);
  }

  // Drop hits that have aged out of the window.
  while (window.hits.length > 0 && (window.hits[0] ?? 0) < cutoff) window.hits.shift();

  if (window.hits.length >= limitPerMinute) {
    const oldest = window.hits[0] ?? now;
    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.max(1, Math.ceil((oldest + WINDOW_MS - now) / 1000)),
    };
  }

  window.hits.push(now);
  return { allowed: true, remaining: limitPerMinute - window.hits.length, retryAfter: 0 };
}

function evict(cutoff: number): void {
  for (const [key, window] of windows) {
    if (window.hits.length === 0 || (window.hits[window.hits.length - 1] ?? 0) < cutoff) {
      windows.delete(key);
    }
  }
  // Still full of active clients: drop the oldest tracked one rather than grow.
  if (windows.size >= MAX_CLIENTS) {
    const oldest = windows.keys().next();
    if (!oldest.done) windows.delete(oldest.value);
  }
}

export function reset(): void {
  windows.clear();
}

export function stats() {
  return { clients: windows.size };
}
