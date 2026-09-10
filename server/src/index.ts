import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { config, capabilities } from './config.js';
import * as universe from './services/universe.js';

/**
 * Entry point.
 *
 * Starts the universe refresh loop before listening, so the first request to
 * arrive is not also the one that has to build the tracked set from cold.
 */

const app = createApp();

const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  const caps = capabilities();
  console.log('');
  console.log(`  MOVA API listening on http://localhost:${info.port}`);
  console.log('');
  console.log(`  market    ${caps.market}`);
  console.log(`  on-chain  ${caps.onChain}`);
  console.log(`  history   ${caps.history}`);
  console.log(`  social    ${caps.social ?? 'unavailable (no X_BEARER_TOKEN)'}`);
  console.log('');
  if (config.rpcIsPublic) {
    console.log('  Using the public Solana RPC. It is heavily throttled, so safety');
    console.log('  checks will intermittently report as unavailable. Set HELIUS_API_KEY');
    console.log('  to fix that. Everything else works without any key.');
    console.log('');
  }
});

universe.start();

/**
 * Shut down on a signal rather than being killed mid-response: finish what is
 * in flight, stop the refresh timer, then exit.
 */
function shutdown(signal: string): void {
  console.log(`\n${signal} received, shutting down.`);
  universe.stop();
  server.close(() => process.exit(0));
  // Do not hang forever on a stuck connection.
  setTimeout(() => process.exit(0), 5_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  // A rejected upstream promise must not take the process down; every request
  // path already degrades to "data unavailable" on its own.
  console.error('[unhandledRejection]', reason);
});
