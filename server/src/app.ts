import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Candle, Timeframe } from '@/core/types';
import { computeMovaScore } from '@/core/scoring';
import { toSolanaAddress } from '@/core/normalize';
import { buildAnalysis } from '@/data/providers/analysis';
import { config, capabilities } from './config.js';
import { cache } from './cache.js';
import * as limiter from './rate-limit.js';
import { UpstreamError } from './http.js';
import { envelope } from './services/meta.js';
import * as dex from './upstream/dexscreener.js';
import * as dexpaprika from './upstream/dexpaprika.js';
import * as universe from './services/universe.js';
import * as tokens from './services/tokens.js';
import * as marketService from './services/market.js';
import * as history from './services/history.js';
import * as discover from './services/discover.js';

/**
 * The MOVA API.
 *
 * One rule runs through every handler: a failure to obtain data is reported as
 * missing, not as zero and not as an error page. A throttled RPC should cost
 * the user a "Data unavailable" line on one panel, not a broken screen.
 */

const TIMEFRAMES: Timeframe[] = ['5m', '15m', '1h', '4h', '1d'];

export function createApp() {
  const app = new Hono();

  app.use(
    '*',
    cors({
      origin: config.corsOrigins.length > 0 ? config.corsOrigins : '*',
      allowMethods: ['GET', 'OPTIONS'],
      allowHeaders: ['Accept', 'Content-Type', 'X-MOVA-Client'],
      maxAge: 600,
    }),
  );

  app.use('/v1/*', async (c, next) => {
    const key =
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
      c.req.header('x-real-ip') ??
      'anonymous';

    const verdict = limiter.check(key, config.rateLimitPerMinute);
    c.header('X-RateLimit-Limit', String(config.rateLimitPerMinute));
    c.header('X-RateLimit-Remaining', String(verdict.remaining));

    if (!verdict.allowed) {
      c.header('Retry-After', String(verdict.retryAfter));
      return c.json({ error: 'Too many requests. Slow down and try again shortly.' }, 429);
    }
    return next();
  });

  if (config.logRequests) {
    app.use('*', async (c, next) => {
      const started = Date.now();
      await next();
      // Path only — query strings can carry a search term, which is the user's.
      console.log(`${c.req.method} ${new URL(c.req.url).pathname} ${c.res.status} ${Date.now() - started}ms`);
    });
  }

  // -------------------------------------------------------------------------
  // Health
  // -------------------------------------------------------------------------

  app.get('/', (c) => c.json({ name: 'MOVA API', version: '1.0.0', docs: '/health' }));

  app.get('/health', (c) =>
    c.json({
      ok: true,
      uptimeSec: Math.round(process.uptime()),
      capabilities: capabilities(),
      universe: universe.status(),
      cache: cache.stats(),
      clients: limiter.stats(),
    }),
  );

  // -------------------------------------------------------------------------
  // Market
  // -------------------------------------------------------------------------

  app.get('/v1/market/overview', async (c) => {
    const pairs = await universe.ensure();
    const data = await marketService.overview(pairs);
    return c.json(
      envelope(data, ['DexScreener'], data.newTokens24h == null ? ['newTokens24h', 'graduated24h'] : []),
    );
  });

  app.get('/v1/market/trending', async (c) => {
    const pairs = await universe.ensure();
    return c.json(envelope(universe.trending(pairs), ['DexScreener']));
  });

  app.get('/v1/market/movers', async (c) => {
    const pairs = await universe.ensure();
    return c.json(envelope(universe.movers(pairs), ['DexScreener']));
  });

  app.get('/v1/market/unusual', async (c) => {
    const pairs = await universe.ensure();
    return c.json(envelope(universe.unusual(pairs), ['DexScreener']));
  });

  // -------------------------------------------------------------------------
  // Discover
  // -------------------------------------------------------------------------

  app.get('/v1/tokens', async (c) => {
    const params = new URL(c.req.url).searchParams;
    const filters = discover.parseFilters(params);
    const { sort, direction } = discover.parseSort(params);
    const limit = Number.parseInt(params.get('limit') ?? '20', 10) || 20;

    // A search term reaches past the tracked set to the whole of DexScreener;
    // an unfiltered browse ranks what MOVA already watches.
    const base =
      filters.query.length >= 2
        ? await tokens.search(filters.query)
        : (await universe.ensure()).map(tokens.summaryFromPair);

    const filtered = discover.applyFilters(base, filters);
    const sorted = discover.applySort(filtered, sort, direction);
    const page = discover.paginate(sorted, params.get('cursor'), limit);

    return c.json(envelope(page, ['DexScreener']));
  });

  app.get('/v1/search', async (c) => {
    const q = (new URL(c.req.url).searchParams.get('q') ?? '').trim();
    if (q.length < 2) return c.json(envelope([], ['DexScreener']));
    return c.json(envelope(await tokens.search(q), ['DexScreener']));
  });

  // -------------------------------------------------------------------------
  // Tokens
  //
  // `/batch` is declared before `/:address` so the literal segment is not
  // captured by the parameter route.
  // -------------------------------------------------------------------------

  app.get('/v1/tokens/batch', async (c) => {
    const raw = new URL(c.req.url).searchParams.get('addresses') ?? '';
    const addresses = raw
      .split(',')
      .map((a) => toSolanaAddress(a.trim()))
      .filter((a): a is string => a != null)
      .slice(0, 100);

    if (addresses.length === 0) return c.json(envelope([], ['DexScreener']));
    return c.json(envelope(await tokens.summarize(addresses), ['DexScreener']));
  });

  app.get('/v1/tokens/:address', async (c) => {
    const address = toSolanaAddress(c.req.param('address'));
    if (address == null) return c.json({ error: 'That is not a Solana token address.' }, 400);

    const assembled = await tokens.assemble(address);
    if (assembled == null) {
      return c.json({ error: 'No Solana pair is listed for that token.' }, 404);
    }
    return c.json(envelope(assembled.detail, assembled.sources, assembled.missing));
  });

  app.get('/v1/tokens/:address/candles', async (c) => {
    const address = toSolanaAddress(c.req.param('address'));
    if (address == null) return c.json({ error: 'That is not a Solana token address.' }, 400);

    const raw = new URL(c.req.url).searchParams.get('tf');
    const timeframe: Timeframe = TIMEFRAMES.includes(raw as Timeframe) ? (raw as Timeframe) : '1h';

    // Real history first, keyed on the pair address DexScreener gives us.
    const pairs = await dex.getTokens([address]);
    const pairAddress = pairs.get(address)?.market.pairAddress ?? null;

    let data: Candle[] = [];
    let source = 'DexPaprika';

    if (pairAddress != null) {
      data = await dexpaprika.getCandles(pairAddress, timeframe);
    }

    // Fall back to what this server watched itself. Degrading to a shorter
    // honest chart beats showing none because an upstream was down.
    if (data.length === 0) {
      data = history.candles(address, timeframe);
      source = 'MOVA recorded history';
    }

    // An empty series is still a true statement, and the chart renders its own
    // "not enough history" state for it.
    const missing = data.length === 0 ? ['candles'] : [];
    return c.json(envelope(data, [source], missing));
  });

  app.get('/v1/tokens/:address/holders', async (c) => {
    const address = toSolanaAddress(c.req.param('address'));
    if (address == null) return c.json({ error: 'That is not a Solana token address.' }, 400);

    const assembled = await tokens.assemble(address);
    if (assembled == null) return c.json(envelope([], ['Solana RPC'], ['holders']));

    const { getMintInfo, getHolders } = await import('./upstream/solana-rpc.js');
    const mint = await getMintInfo(address);
    const report = await getHolders(address, mint.supply);
    return c.json(
      envelope(report.holders, ['Solana RPC'], report.holders.length === 0 ? ['holders'] : []),
    );
  });

  app.get('/v1/tokens/:address/wallets', (c) => {
    const address = toSolanaAddress(c.req.param('address'));
    if (address == null) return c.json({ error: 'That is not a Solana token address.' }, 400);
    // Wallet-level flow needs an indexer MOVA has no keyless access to. The app
    // renders the smart-money panel as unavailable rather than empty-looking.
    return c.json(envelope([], [], ['smartMoney']));
  });

  app.get('/v1/tokens/:address/social', async (c) => {
    const address = toSolanaAddress(c.req.param('address'));
    if (address == null) return c.json({ error: 'That is not a Solana token address.' }, 400);

    const assembled = await tokens.assemble(address);
    const links = assembled?.detail.social.links ?? { website: null, twitter: null, telegram: null };

    return c.json(
      envelope(
        {
          mentions24h: null,
          mentionsGrowthPct: null,
          uniqueAuthors24h: null,
          botLikelihoodPct: null,
          kolMentions24h: null,
          authenticity: 'unknown',
          links,
        },
        ['DexScreener'],
        ['socialMetrics'],
      ),
    );
  });

  app.get('/v1/tokens/:address/analysis', async (c) => {
    const address = toSolanaAddress(c.req.param('address'));
    if (address == null) return c.json({ error: 'That is not a Solana token address.' }, 400);

    const assembled = await tokens.assemble(address);
    if (assembled == null) return c.json({ error: 'No Solana pair is listed for that token.' }, 404);

    // The same deterministic writer the app ships, so the analysis never
    // asserts anything the data behind it does not support.
    const score = computeMovaScore(assembled.detail);
    const analysis = buildAnalysis(assembled.detail, score);
    return c.json(envelope(analysis, ['MOVA analysis'], assembled.missing));
  });

  // -------------------------------------------------------------------------
  // Errors
  // -------------------------------------------------------------------------

  app.notFound((c) => c.json({ error: 'No such endpoint.' }, 404));

  app.onError((error, c) => {
    if (error instanceof UpstreamError) {
      console.error(`[upstream] ${error.source}: ${error.message}`);
      return c.json(
        { error: `${error.source} is not responding. This is upstream of MOVA, not your connection.` },
        error.retryable ? 503 : 502,
      );
    }
    console.error('[error]', error);
    // Never leak an internal message or stack to a client.
    return c.json({ error: 'Something went wrong handling that request.' }, 500);
  });

  return app;
}
