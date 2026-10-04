/**
 * Retrying fetch.
 *
 * Both providers are reached over a connection that intermittently fails to
 * connect at all - undici gives up on the TCP connect after 10s and Node
 * surfaces it as a bare "fetch failed". Raw calls to the same endpoint have
 * failed three times and then succeeded on the fourth, so a single attempt is
 * not a reliable signal that anything is wrong.
 *
 * Retries only cover connection-level failures and 5xx/429 responses. A 4xx is
 * a real answer about a bad request or a bad key and is returned untouched.
 */

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

export interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  label?: string;
  /** Upper bound on a single attempt. See ATTEMPT_TIMEOUT_MS. */
  timeoutMs?: number;
}

/**
 * How long one attempt may hang before it is abandoned.
 *
 * Retrying was never the gap: a connection that accepts and then stalls never
 * throws, so without a deadline an attempt waits for ever and the retry loop
 * never gets its turn. Generous, because mirroring a 23 MB splat is one of
 * these calls.
 */
const ATTEMPT_TIMEOUT_MS = 120_000;

export async function fetchWithRetry(
  input: string | URL | Request,
  init?: RequestInit,
  { attempts = 5, baseDelayMs = 2_000, label, timeoutMs = ATTEMPT_TIMEOUT_MS }: RetryOptions = {},
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      // A caller's own signal still wins; this only adds an upper bound.
      const timeout = AbortSignal.timeout(timeoutMs);
      const signal = init?.signal
        ? AbortSignal.any([init.signal, timeout])
        : timeout;
      const res = await fetch(input, { ...init, signal });
      if (!RETRYABLE_STATUS.has(res.status) || attempt === attempts) return res;
      note(label, attempt, attempts, `HTTP ${res.status}`);
    } catch (err) {
      lastError = err;
      if (attempt === attempts) break;
      note(label, attempt, attempts, describe(err));
    }
    // Linear backoff is plenty here: the failure is a flaky connect, not a
    // server under load that needs backing off exponentially.
    await new Promise((r) => setTimeout(r, baseDelayMs * attempt));
  }

  throw lastError ?? new Error(`${label ?? "request"} failed after ${attempts} attempts`);
}

function describe(err: unknown): string {
  const cause = (err as { cause?: { code?: string; message?: string } })?.cause;
  return cause?.code ?? cause?.message ?? (err instanceof Error ? err.message : String(err));
}

function note(label: string | undefined, attempt: number, attempts: number, why: string) {
  console.warn(`  ${label ?? "request"}: ${why} — retrying (${attempt}/${attempts - 1})`);
}
