import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkSell } from '../upstream/jupiter.js';
import { cache } from '../cache.js';

/**
 * The sell check is the highest-stakes signal MOVA produces in either
 * direction. A false negative tells someone a token is exitable when it is
 * not; a false positive brands a legitimate token a honeypot, forces its
 * safety score to zero and its risk to high, and says so in words. These tests
 * are mostly about refusing to answer when the evidence does not support one.
 */

const MINT = 'GYHPVwni3ucwizy9BM4TzTMw3PtSgxm5RRYvL8Ecpump';
const DECIMALS = 6;
const PRICE = 0.001;

function ok(outAmount: string, priceImpactPct: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify({ outAmount, priceImpactPct, routePlan: [{}] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    ),
  );
}

function noRoute() {
  // Jupiter answers 400 when it cannot route the pair at all.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ error: 'no route' }), { status: 400 })),
  );
}

beforeEach(() => cache.clear());
afterEach(() => {
  vi.unstubAllGlobals();
  cache.clear();
});

describe('checkSell', () => {
  it('reports routable when a quote comes back', async () => {
    ok('9930', '0.0006');
    const result = await checkSell(MINT, DECIMALS, PRICE, 50_000);
    expect(result.sellsSucceeding).toBe(true);
    expect(result.priceImpactPct).toBeCloseTo(0.06, 4);
  });

  /**
   * The case the whole check exists for: DexScreener reports a real pool, and
   * no aggregator on Solana can find a way out of it.
   */
  it('flags a honeypot when a funded pool has no exit', async () => {
    noRoute();
    expect((await checkSell(MINT, DECIMALS, PRICE, 50_000)).sellsSucceeding).toBe(false);
  });

  it('withholds a verdict when there was barely any liquidity to route against', async () => {
    noRoute();
    // A $900 pool failing to route says the pool is tiny, not that the token
    // is malicious. Calling this a honeypot would be a false accusation.
    expect((await checkSell(MINT, DECIMALS, PRICE, 900)).sellsSucceeding).toBeNull();
  });

  it('withholds a verdict when liquidity is unknown', async () => {
    noRoute();
    expect((await checkSell(MINT, DECIMALS, PRICE, null)).sellsSucceeding).toBeNull();
  });

  it('treats a route that costs almost everything as no exit', async () => {
    ok('12', '0.97');
    // Technically routable, but 97% price impact is not an exit in any sense a
    // person would recognise.
    expect((await checkSell(MINT, DECIMALS, PRICE, 50_000)).sellsSucceeding).toBe(false);
  });

  it('accepts high but survivable impact', async () => {
    ok('4000', '0.20');
    expect((await checkSell(MINT, DECIMALS, PRICE, 50_000)).sellsSucceeding).toBe(true);
  });

  it('refuses to probe without decimals or a price', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('should not be called'); }));

    // A wrongly-sized probe fails for arithmetic reasons and would look
    // identical to a honeypot.
    expect((await checkSell(MINT, null, PRICE, 50_000)).sellsSucceeding).toBeNull();
    expect((await checkSell(MINT, DECIMALS, null, 50_000)).sellsSucceeding).toBeNull();
    expect((await checkSell(MINT, DECIMALS, 0, 50_000)).sellsSucceeding).toBeNull();
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('treats a zero-output quote as no route', async () => {
    ok('0', '0');
    expect((await checkSell(MINT, DECIMALS, PRICE, 50_000)).sellsSucceeding).toBe(false);
  });

  it('caches so a token page does not re-probe on every request', async () => {
    ok('9930', '0.0006');
    await checkSell(MINT, DECIMALS, PRICE, 50_000);
    await checkSell(MINT, DECIMALS, PRICE, 50_000);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });
});
