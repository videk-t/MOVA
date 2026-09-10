import 'dotenv/config';

/**
 * Server configuration.
 *
 * Every upstream credential lives here and nowhere else. Nothing in this object
 * is ever serialised into a response — the whole point of the backend is that
 * the app can be decompiled without yielding a single key.
 *
 * MOVA is deliberately usable with none of them set: DexScreener needs no key,
 * and the public Solana RPC needs no key, so a bare `npm start` serves real
 * market data. Keys buy depth (holder counts, history, social), not existence.
 */

function str(name: string, fallback: string): string {
  const value = process.env[name];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

function optional(name: string): string | null {
  const value = process.env[name];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function int(name: string, fallback: number, min: number, max: number): number {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(max, Math.max(min, Math.round(raw)));
}

const heliusKey = optional('HELIUS_API_KEY');

export const config = {
  port: int('PORT', 8787, 1, 65535),

  /**
   * Solana JSON-RPC. A Helius key upgrades the endpoint automatically; the
   * public mainnet node works but is aggressively throttled and will drop
   * requests under any real load.
   */
  rpcUrl: heliusKey
    ? `https://mainnet.helius-rpc.com/?api-key=${heliusKey}`
    : str('SOLANA_RPC_URL', 'https://api.mainnet-beta.solana.com'),
  rpcIsPublic: heliusKey == null && optional('SOLANA_RPC_URL') == null,

  heliusApiKey: heliusKey,
  birdeyeApiKey: optional('BIRDEYE_API_KEY'),
  anthropicApiKey: optional('ANTHROPIC_API_KEY'),
  xBearerToken: optional('X_BEARER_TOKEN'),

  /** How long an upstream response stays fresh in the shared cache. */
  upstreamCacheTtlMs: int('UPSTREAM_CACHE_TTL_MS', 15_000, 1_000, 600_000),
  /** Structural facts (mint authority, decimals) change rarely. */
  structuralCacheTtlMs: int('STRUCTURAL_CACHE_TTL_MS', 5 * 60_000, 10_000, 3_600_000),
  /** How often the tracked-token universe is rebuilt. */
  universeRefreshMs: int('UNIVERSE_REFRESH_MS', 60_000, 15_000, 3_600_000),

  rateLimitPerMinute: int('RATE_LIMIT_PER_MINUTE', 120, 10, 100_000),

  /** Comma-separated allowlist. Empty means allow any origin, which is correct
   *  for a public read-only API consumed by a mobile app. */
  corsOrigins: str('CORS_ORIGINS', '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0),

  logRequests: str('LOG_REQUESTS', 'true') !== 'false',
} as const;

export type Config = typeof config;

/** A one-line summary for the health endpoint. Never includes a key itself. */
export function capabilities() {
  return {
    market: 'DexScreener',
    onChain: config.rpcIsPublic ? 'Solana public RPC (throttled)' : 'Solana RPC',
    holders: true,
    history: config.birdeyeApiKey ? 'Birdeye OHLCV' : 'recorded in-process',
    social: config.xBearerToken ? 'X' : null,
    analysis: 'deterministic',
  };
}
