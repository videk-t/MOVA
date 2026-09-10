import { describe, expect, it, vi } from 'vitest';
import { TtlCache } from '../cache.js';

describe('TtlCache', () => {
  it('serves a value within its TTL and drops it after', async () => {
    vi.useFakeTimers();
    const cache = new TtlCache();
    cache.set('k', 'value', 1_000);

    expect(cache.get('k')).toBe('value');
    vi.advanceTimersByTime(1_001);
    expect(cache.get('k')).toBeUndefined();
    vi.useRealTimers();
  });

  it('collapses concurrent misses onto one production', async () => {
    const cache = new TtlCache();
    let productions = 0;

    const produce = async () => {
      productions += 1;
      await new Promise((r) => setTimeout(r, 20));
      return productions;
    };

    // This is the property that matters: twenty clients asking for the same
    // cold token must cost one upstream request, not twenty.
    const results = await Promise.all(
      Array.from({ length: 20 }, () => cache.wrap('same', 5_000, produce)),
    );

    expect(productions).toBe(1);
    expect(new Set(results).size).toBe(1);
  });

  it('does not cache a rejected production', async () => {
    const cache = new TtlCache();
    let calls = 0;

    const failing = async () => {
      calls += 1;
      throw new Error('upstream down');
    };

    await expect(cache.wrap('k', 60_000, failing)).rejects.toThrow('upstream down');
    await expect(cache.wrap('k', 60_000, failing)).rejects.toThrow('upstream down');

    // A failed fetch pinned for the TTL would keep a screen broken long after
    // the upstream recovered.
    expect(calls).toBe(2);
  });

  it('lets a later caller retry after a failure', async () => {
    const cache = new TtlCache();
    let attempt = 0;

    const flaky = async () => {
      attempt += 1;
      if (attempt === 1) throw new Error('transient');
      return 'recovered';
    };

    await expect(cache.wrap('k', 60_000, flaky)).rejects.toThrow();
    await expect(cache.wrap('k', 60_000, flaky)).resolves.toBe('recovered');
  });

  it('evicts rather than growing without bound', () => {
    const cache = new TtlCache(10);
    for (let i = 0; i < 50; i += 1) cache.set(`k${i}`, i, 60_000);
    expect(cache.stats().entries).toBeLessThanOrEqual(10);
  });

  it('reports a hit rate', async () => {
    const cache = new TtlCache();
    await cache.wrap('k', 60_000, async () => 1);
    await cache.wrap('k', 60_000, async () => 1);
    await cache.wrap('k', 60_000, async () => 1);

    const stats = cache.stats();
    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(1);
    expect(stats.hitRate).toBeCloseTo(0.67, 1);
  });
});
