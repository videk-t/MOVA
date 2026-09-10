import type { Holder } from '@/core/types';
import { isRecord, toSolanaAddress } from '@/core/normalize';
import { fetchJson } from '../http.js';
import { cache } from '../cache.js';
import { config } from '../config.js';

/**
 * Solana JSON-RPC.
 *
 * Supplies the facts that decide most of the Safety score: whether the deployer
 * can still mint or freeze, and how concentrated the supply is. These are read
 * straight from chain state rather than taken from any vendor's summary, which
 * makes them the most trustworthy numbers in the app.
 *
 * Works against the public endpoint with no key, which is heavily throttled —
 * a HELIUS_API_KEY silently upgrades every call in this file.
 */

const SOURCE = 'Solana RPC';

/**
 * AMM programs whose pool vaults show up in `getTokenLargestAccounts`.
 *
 * A liquidity pool holding 40% of supply is not the concentration risk that a
 * person holding 40% is, and counting it as one would mark almost every healthy
 * token as dangerous. Vault accounts are identified and excluded from the
 * concentration figure, then shown separately in the holder list.
 */
const AMM_PROGRAMS = new Set([
  '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', // Raydium AMM v4
  'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK', // Raydium CLMM
  'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C', // Raydium CPMM
  'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc', // Orca Whirlpool
  '9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP', // Orca v2
  'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo', // Meteora DLMM
  'Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB', // Meteora Pools
  'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA', // Pump.fun AMM
  '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P', // Pump.fun
]);

/** Addresses that provably destroy what is sent to them. */
const BURN_ADDRESSES = new Set([
  '1nc1nerator11111111111111111111111111111111',
  '11111111111111111111111111111111',
]);

let requestId = 0;

async function rpc(method: string, params: unknown[], signal?: AbortSignal): Promise<unknown> {
  requestId += 1;
  const raw = await fetchJson(config.rpcUrl, {
    source: SOURCE,
    method: 'POST',
    // The public node throttles hard; one retry, then give up and report the
    // field as unavailable rather than stalling the whole token request.
    retries: config.rpcIsPublic ? 1 : 2,
    timeoutMs: 8_000,
    body: { jsonrpc: '2.0', id: requestId, method, params },
    signal,
  });

  if (!isRecord(raw)) throw new Error(`${SOURCE}: malformed response`);
  if (isRecord(raw.error)) {
    throw new Error(`${SOURCE}: ${String(raw.error.message ?? 'unknown error')}`);
  }
  return raw.result;
}

export interface MintInfo {
  /** null when the field could not be read, not when it is absent on chain. */
  mintAuthorityRevoked: boolean | null;
  freezeAuthorityRevoked: boolean | null;
  supply: number | null;
  decimals: number | null;
}

const UNKNOWN_MINT: MintInfo = {
  mintAuthorityRevoked: null,
  freezeAuthorityRevoked: null,
  supply: null,
  decimals: null,
};

/**
 * Mint authority, freeze authority and supply.
 *
 * These change roughly never, so they are cached for far longer than prices.
 */
export async function getMintInfo(mint: string, signal?: AbortSignal): Promise<MintInfo> {
  const address = toSolanaAddress(mint);
  if (address == null) return { ...UNKNOWN_MINT };

  return cache.wrap(`rpc:mint:${address}`, config.structuralCacheTtlMs, async () => {
    try {
      const result = await rpc('getAccountInfo', [address, { encoding: 'jsonParsed' }], signal);
      const value = isRecord(result) ? result.value : null;
      if (!isRecord(value)) return { ...UNKNOWN_MINT };

      const data = isRecord(value.data) ? value.data : {};
      const parsed = isRecord(data.parsed) ? data.parsed : {};
      if (String(parsed.type ?? '') !== 'mint') return { ...UNKNOWN_MINT };

      const info = isRecord(parsed.info) ? parsed.info : {};
      const decimals = typeof info.decimals === 'number' ? info.decimals : null;
      const rawSupply = Number(info.supply);
      const supply =
        Number.isFinite(rawSupply) && decimals != null ? rawSupply / 10 ** decimals : null;

      return {
        // Present-but-null on chain means revoked. Absent means we could not read it.
        mintAuthorityRevoked: 'mintAuthority' in info ? info.mintAuthority == null : null,
        freezeAuthorityRevoked: 'freezeAuthority' in info ? info.freezeAuthority == null : null,
        supply: supply != null && Number.isFinite(supply) && supply > 0 ? supply : null,
        decimals,
      } satisfies MintInfo;
    } catch {
      // An unreadable mint is reported as unknown. The score model drops the
      // component and lowers its confidence rather than assuming the worst.
      return { ...UNKNOWN_MINT };
    }
  });
}

export interface HolderReport {
  holders: Holder[];
  /** Share held by the top ten non-pool holders, 0-100. */
  top10HolderPct: number | null;
  /** Share sitting in identified liquidity vaults, 0-100. */
  poolPct: number | null;
  /** Share provably burned. */
  burnedPct: number | null;
}

const EMPTY_HOLDERS: HolderReport = {
  holders: [],
  top10HolderPct: null,
  poolPct: null,
  burnedPct: null,
};

/**
 * Largest token accounts, resolved to owners and classified.
 *
 * Three RPC calls: the largest accounts, then their owners, then the programs
 * behind those owners. That last hop is what separates a liquidity vault from a
 * whale, and it is the difference between a safety score that means something
 * and one that flags every listed token.
 */
export async function getHolders(
  mint: string,
  supply: number | null,
  signal?: AbortSignal,
): Promise<HolderReport> {
  const address = toSolanaAddress(mint);
  if (address == null) return { ...EMPTY_HOLDERS };

  return cache.wrap(`rpc:holders:${address}`, config.structuralCacheTtlMs, async () => {
    try {
      const largest = await rpc('getTokenLargestAccounts', [address], signal);
      const value = isRecord(largest) ? largest.value : null;
      if (!Array.isArray(value) || value.length === 0) return { ...EMPTY_HOLDERS };

      const accounts = value
        .filter(isRecord)
        .map((item) => ({
          account: toSolanaAddress(item.address),
          amount: Number(item.uiAmount),
        }))
        .filter((a): a is { account: string; amount: number } => a.account != null && Number.isFinite(a.amount) && a.amount > 0)
        .slice(0, 20);

      if (accounts.length === 0) return { ...EMPTY_HOLDERS };

      // Resolve token accounts to their owning wallets in one call.
      const owners = await resolveOwners(accounts.map((a) => a.account), signal);
      // Then work out which of those owners are programs rather than people.
      const programOwned = await resolveProgramOwned([...new Set(owners.values())], signal);

      const total =
        supply ??
        // Without a supply figure percentages are meaningless, so they stay null
        // rather than being computed against the visible subset.
        null;

      const holders: Holder[] = [];
      let poolAmount = 0;
      let burnedAmount = 0;
      const personal: number[] = [];

      for (const entry of accounts) {
        const owner = owners.get(entry.account) ?? entry.account;
        const isBurn = BURN_ADDRESSES.has(owner);
        const isPool = programOwned.has(owner);
        const pct = total != null ? (entry.amount / total) * 100 : null;

        if (isBurn) burnedAmount += entry.amount;
        else if (isPool) poolAmount += entry.amount;
        else personal.push(entry.amount);

        holders.push({
          address: owner,
          label: isBurn ? 'Burned' : isPool ? 'Liquidity pool' : null,
          pct: pct != null && pct >= 0 && pct <= 100 ? pct : 0,
          valueUsd: null,
          tag: 'unknown',
          isContract: isPool || isBurn,
        });
      }

      const share = (amount: number) => (total != null && total > 0 ? (amount / total) * 100 : null);
      const topTen = personal
        .sort((a, b) => b - a)
        .slice(0, 10)
        .reduce((sum, amount) => sum + amount, 0);

      const top10 = share(topTen);
      return {
        holders,
        top10HolderPct: top10 == null ? null : Math.min(100, Math.max(0, top10)),
        poolPct: share(poolAmount),
        burnedPct: share(burnedAmount),
      } satisfies HolderReport;
    } catch {
      return { ...EMPTY_HOLDERS };
    }
  });
}

/** Token account -> owner wallet. */
async function resolveOwners(accounts: string[], signal?: AbortSignal): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  try {
    const result = await rpc('getMultipleAccounts', [accounts, { encoding: 'jsonParsed' }], signal);
    const value = isRecord(result) ? result.value : null;
    if (!Array.isArray(value)) return out;

    value.forEach((item, index) => {
      const account = accounts[index];
      if (account == null || !isRecord(item)) return;
      const data = isRecord(item.data) ? item.data : {};
      const parsed = isRecord(data.parsed) ? data.parsed : {};
      const info = isRecord(parsed.info) ? parsed.info : {};
      const owner = toSolanaAddress(info.owner);
      if (owner) out.set(account, owner);
    });
  } catch {
    // Owners unresolved: every account is then treated as a wallet, which
    // overstates concentration. Safer than understating it.
  }
  return out;
}

/** Owner wallets that are actually program-derived AMM accounts. */
async function resolveProgramOwned(owners: string[], signal?: AbortSignal): Promise<Set<string>> {
  const out = new Set<string>();
  if (owners.length === 0) return out;

  try {
    const result = await rpc('getMultipleAccounts', [owners.slice(0, 20), { encoding: 'base64' }], signal);
    const value = isRecord(result) ? result.value : null;
    if (!Array.isArray(value)) return out;

    value.forEach((item, index) => {
      const owner = owners[index];
      if (owner == null || !isRecord(item)) return;
      const program = typeof item.owner === 'string' ? item.owner : null;
      if (program != null && AMM_PROGRAMS.has(program)) out.add(owner);
    });
  } catch {
    // Unclassified owners stay counted as people.
  }
  return out;
}
