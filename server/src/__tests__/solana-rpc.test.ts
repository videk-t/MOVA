import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getHolders, getMintInfo } from '../upstream/solana-rpc.js';
import { cache } from '../cache.js';

/**
 * Holder classification is the part of the safety score that is easiest to get
 * quietly wrong: counting a liquidity pool as a whale marks almost every
 * healthy token as dangerous, and failing to read the chain at all must report
 * unknown rather than clean. Neither failure is visible from a screenshot, and
 * the public RPC is too throttled to exercise this reliably against the real
 * network — so it is pinned here against recorded response shapes.
 */

const MINT = 'GYHPVwni3ucwizy9BM4TzTMw3PtSgxm5RRYvL8Ecpump';
const RAYDIUM_AMM = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';
const SYSTEM_PROGRAM = '11111111111111111111111111111111';

const WALLET_A = '7xKXtg2CW3xM8mQvKzYbNpRdFhJnLsWuVaBcDeFgHi9';
const WALLET_B = 'BpQ8Yy2rXwT4kL9mNvZaCdEfGhJkMnPqRsTuVwXyZ12';
const POOL_OWNER = 'F1FxcHXaLoBGgVXqzWBrTaW8hMPZ4rDsKvNbYeQjUmAt';
const INCINERATOR = '1nc1nerator11111111111111111111111111111111';

/**
 * Token accounts holding the balances, distinct from their owners.
 *
 * Base58 excludes 0, O, I and l — these are built from the valid alphabet so
 * they survive `toSolanaAddress`, which is doing its job when it drops
 * anything that could not be a real account.
 */
const ACC_A = 'TokenAccountAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const ACC_B = 'TokenAccountBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
const ACC_POOL = 'TokenAccountPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPP';
const ACC_BURN = 'TokenAccountZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ';

function rpcResponse(result: unknown) {
  return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

/** A minimal fake of the three calls the holder path makes, in order. */
function mockRpc(handlers: Record<string, unknown>) {
  return vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as { method?: string };
    const method = body.method ?? '';
    if (!(method in handlers)) throw new Error(`unexpected RPC method: ${method}`);
    return rpcResponse(handlers[method]);
  });
}

beforeEach(() => {
  cache.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  cache.clear();
});

describe('getMintInfo', () => {
  it('reads revoked authorities and supply from chain state', async () => {
    vi.stubGlobal(
      'fetch',
      mockRpc({
        getAccountInfo: {
          value: {
            data: {
              parsed: {
                type: 'mint',
                info: {
                  decimals: 6,
                  supply: '1000000000000000',
                  mintAuthority: null,
                  freezeAuthority: null,
                },
              },
            },
          },
        },
      }),
    );

    const info = await getMintInfo(MINT);
    expect(info.mintAuthorityRevoked).toBe(true);
    expect(info.freezeAuthorityRevoked).toBe(true);
    expect(info.decimals).toBe(6);
    expect(info.supply).toBe(1_000_000_000);
  });

  it('reports an authority that is still held', async () => {
    vi.stubGlobal(
      'fetch',
      mockRpc({
        getAccountInfo: {
          value: {
            data: {
              parsed: {
                type: 'mint',
                info: {
                  decimals: 9,
                  supply: '1000000000',
                  mintAuthority: WALLET_A,
                  freezeAuthority: WALLET_A,
                },
              },
            },
          },
        },
      }),
    );

    const info = await getMintInfo(MINT);
    expect(info.mintAuthorityRevoked).toBe(false);
    expect(info.freezeAuthorityRevoked).toBe(false);
  });

  it('reports unknown rather than clean when the RPC fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('rate limited', { status: 429 })));

    const info = await getMintInfo(MINT);
    // The critical assertion: a throttled node must never look like a revoked
    // authority, which would read as a safety pass the chain never confirmed.
    expect(info.mintAuthorityRevoked).toBeNull();
    expect(info.freezeAuthorityRevoked).toBeNull();
    expect(info.supply).toBeNull();
  });

  it('rejects a non-mint account', async () => {
    vi.stubGlobal(
      'fetch',
      mockRpc({ getAccountInfo: { value: { data: { parsed: { type: 'account', info: {} } } } } }),
    );
    expect((await getMintInfo(MINT)).mintAuthorityRevoked).toBeNull();
  });

  it('refuses an address that is not base58', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('should not be called'); }));
    expect((await getMintInfo('not-an-address')).supply).toBeNull();
  });
});

describe('getHolders', () => {
  const largest = {
    value: [
      { address: ACC_POOL, uiAmount: 400 },
      { address: ACC_A, uiAmount: 120 },
      { address: ACC_BURN, uiAmount: 100 },
      { address: ACC_B, uiAmount: 80 },
    ],
  };

  const owners = {
    value: [
      { data: { parsed: { info: { owner: POOL_OWNER } } } },
      { data: { parsed: { info: { owner: WALLET_A } } } },
      { data: { parsed: { info: { owner: INCINERATOR } } } },
      { data: { parsed: { info: { owner: WALLET_B } } } },
    ],
  };

  /** Second getMultipleAccounts call: which owners are AMM-program accounts. */
  const programs = {
    value: [
      { owner: RAYDIUM_AMM },
      { owner: SYSTEM_PROGRAM },
      { owner: SYSTEM_PROGRAM },
      { owner: SYSTEM_PROGRAM },
    ],
  };

  function stub() {
    let multiCall = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as { method?: string };
        if (body.method === 'getTokenLargestAccounts') return rpcResponse(largest);
        if (body.method === 'getMultipleAccounts') {
          multiCall += 1;
          return rpcResponse(multiCall === 1 ? owners : programs);
        }
        throw new Error(`unexpected: ${body.method}`);
      }),
    );
  }

  it('excludes liquidity pools from holder concentration', async () => {
    stub();
    const report = await getHolders(MINT, 1_000);

    // 120 + 80 = 200 of 1000 supply sits with actual wallets. The 400 in the
    // Raydium vault is depth, not concentration, and must not be counted.
    expect(report.top10HolderPct).toBeCloseTo(20, 5);
    expect(report.poolPct).toBeCloseTo(40, 5);
  });

  it('accounts for a provable burn separately', async () => {
    stub();
    const report = await getHolders(MINT, 1_000);
    expect(report.burnedPct).toBeCloseTo(10, 5);
  });

  it('labels pool and burn holders so the UI can explain them', async () => {
    stub();
    const report = await getHolders(MINT, 1_000);

    const pool = report.holders.find((h) => h.address === POOL_OWNER);
    const burn = report.holders.find((h) => h.address === INCINERATOR);
    const wallet = report.holders.find((h) => h.address === WALLET_A);

    expect(pool?.label).toBe('Liquidity pool');
    expect(pool?.isContract).toBe(true);
    expect(burn?.label).toBe('Burned');
    expect(wallet?.label).toBeNull();
    expect(wallet?.isContract).toBe(false);
  });

  it('resolves token accounts to their owning wallets', async () => {
    stub();
    const report = await getHolders(MINT, 1_000);
    // Addresses reported are owners, not the token accounts holding the balance.
    const addresses = report.holders.map((h) => h.address);
    expect(addresses).toContain(WALLET_A);
    expect(addresses).not.toContain(ACC_A);
  });

  it('withholds percentages when supply is unknown', async () => {
    stub();
    const report = await getHolders(MINT, null);
    // Without a denominator a percentage would be invented. It is not.
    expect(report.top10HolderPct).toBeNull();
    expect(report.poolPct).toBeNull();
    expect(report.holders.length).toBeGreaterThan(0);
  });

  it('returns unknown when the node refuses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 429 })));
    const report = await getHolders(MINT, 1_000);
    expect(report.top10HolderPct).toBeNull();
    expect(report.holders).toEqual([]);
  });

  it('counts unclassifiable owners as people rather than pools', async () => {
    // If the program lookup fails, concentration is overstated rather than
    // understated — the cautious direction for a safety signal.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as { method?: string };
        if (body.method === 'getTokenLargestAccounts') return rpcResponse(largest);
        if (body.method === 'getMultipleAccounts') return rpcResponse({ value: [] });
        throw new Error('unexpected');
      }),
    );

    const report = await getHolders(MINT, 1_000);
    // 400 + 120 + 100 + 80 all treated as wallets = 70%.
    expect(report.top10HolderPct).toBeCloseTo(70, 5);
    expect(report.poolPct).toBe(0);
  });
});
