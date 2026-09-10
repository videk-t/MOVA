/**
 * In-memory TTL cache with single-flight.
 *
 * Two properties matter more than speed. First, a cache hit keeps MOVA inside
 * vendor rate limits — one cached DexScreener response serves every connected
 * client. Second, *single-flight*: when twenty clients ask for the same cold
 * token at once, exactly one upstream request goes out and the rest wait on it.
 * Without that, a cache is worst-behaved precisely when it matters most.
 *
 * No Redis for the MVP. One process, one map. When MOVA outgrows a single
 * instance this is the file that changes, and nothing above it.
 */

interface Entry<T> {
  value: T;
  expiresAt: number;
}

export class TtlCache {
  private readonly entries = new Map<string, Entry<unknown>>();
  private readonly inFlight = new Map<string, Promise<unknown>>();
  private hits = 0;
  private misses = 0;

  constructor(private readonly maxEntries = 5_000) {}

  get<T>(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    if (this.entries.size >= this.maxEntries) this.evictOldest();
    this.entries.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  /**
   * Return the cached value, or produce it — collapsing concurrent callers onto
   * a single production. A rejected production is never cached, so a failed
   * upstream is retried on the next request rather than pinned for the TTL.
   */
  async wrap<T>(key: string, ttlMs: number, produce: () => Promise<T>): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== undefined) {
      this.hits += 1;
      return cached;
    }

    const pending = this.inFlight.get(key);
    if (pending) return pending as Promise<T>;

    this.misses += 1;
    const promise = produce()
      .then((value) => {
        this.set(key, value, ttlMs);
        return value;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });

    this.inFlight.set(key, promise);
    return promise;
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
    this.inFlight.clear();
  }

  stats() {
    const total = this.hits + this.misses;
    return {
      entries: this.entries.size,
      inFlight: this.inFlight.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: total === 0 ? null : Math.round((this.hits / total) * 100) / 100,
    };
  }

  /** Insertion order is close enough to age for a cache this size. */
  private evictOldest(): void {
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(key);
    }
    if (this.entries.size < this.maxEntries) return;
    const oldest = this.entries.keys().next();
    if (!oldest.done) this.entries.delete(oldest.value);
  }
}

export const cache = new TtlCache();
