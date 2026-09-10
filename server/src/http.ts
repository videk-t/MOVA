/**
 * Outbound HTTP.
 *
 * Everything MOVA fetches is third-party and occasionally hostile: slow, wrong
 * shape, rate-limited, or an HTML error page with a 200. This wrapper bounds
 * the damage — a timeout on every request, bounded retries on the failures that
 * are actually transient, and a hard cap on response size so a runaway body
 * cannot exhaust the process.
 */

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 8 * 1024 * 1024;
const USER_AGENT = 'MOVA/1.0 (+https://github.com/videk-t/MOVA)';

export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean,
    readonly source: string,
  ) {
    super(message);
    this.name = 'UpstreamError';
  }
}

export interface FetchOptions {
  source: string;
  timeoutMs?: number;
  retries?: number;
  headers?: Record<string, string>;
  method?: 'GET' | 'POST';
  body?: unknown;
  signal?: AbortSignal;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function once(url: string, options: FetchOptions): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  options.signal?.addEventListener('abort', onAbort, { once: true });

  try {
    const response = await fetch(url, {
      method: options.method ?? 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': USER_AGENT,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      // 5xx and 429 are worth another attempt; a 4xx will say the same thing twice.
      const retryable = response.status >= 500 || response.status === 429;
      throw new UpstreamError(
        `${options.source} responded ${response.status}`,
        response.status,
        retryable,
        options.source,
      );
    }

    const length = Number(response.headers.get('content-length'));
    if (Number.isFinite(length) && length > MAX_BODY_BYTES) {
      throw new UpstreamError(`${options.source} response too large`, 502, false, options.source);
    }

    const text = await response.text();
    if (text.length > MAX_BODY_BYTES) {
      throw new UpstreamError(`${options.source} response too large`, 502, false, options.source);
    }

    try {
      return JSON.parse(text) as unknown;
    } catch {
      // A 200 carrying HTML means a proxy, a captive portal or an error page
      // answered instead of the API.
      throw new UpstreamError(`${options.source} returned a non-JSON body`, 502, true, options.source);
    }
  } catch (error) {
    if (error instanceof UpstreamError) throw error;
    const aborted = error instanceof Error && error.name === 'AbortError';
    throw new UpstreamError(
      aborted ? `${options.source} timed out` : `${options.source} is unreachable`,
      aborted ? 504 : 502,
      true,
      options.source,
    );
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', onAbort);
  }
}

export async function fetchJson(url: string, options: FetchOptions): Promise<unknown> {
  const attempts = Math.max(1, (options.retries ?? 1) + 1);
  let last: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await once(url, options);
    } catch (error) {
      last = error;
      const retryable = error instanceof UpstreamError && error.retryable;
      if (!retryable || attempt === attempts - 1) break;
      // Back off so a struggling upstream is not hammered into staying down.
      await sleep(Math.min(2_000, 250 * 2 ** attempt));
    }
  }

  throw last;
}

/**
 * Run tasks with bounded concurrency. Upstreams publish per-second limits, and
 * firing forty simultaneous requests is the fastest way to earn a 429.
 */
export async function pooled<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      const item = items[index];
      if (index >= items.length || item === undefined) return;
      try {
        results[index] = { status: 'fulfilled', value: await worker(item) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  });

  await Promise.all(runners);
  return results;
}
