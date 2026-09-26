/**
 * Tripo v3 client setup.
 *
 * Two things the SDK gets wrong for us, both verified against live responses
 * on Sep 13:
 *
 *  1. `@vastai/tripo-sdk@0.1.1` defaults to `https://openapi.tripo3d.com/v3`,
 *     which answers 401 "Invalid API key" for a key that is actually valid.
 *     The working host is `openapi.tripo3d.ai` — the one docs/STRATEGY.md
 *     recorded. Always pass `baseUrl`; never rely on the default.
 *  2. The SDK's own `TRIPO_API_KEY` fallback is fine, but we pass the key
 *     explicitly so a missing value fails with our message, not theirs.
 */

import { TripoClient } from "@vastai/tripo-sdk";
import { requireEnv } from "./env.mts";
import { fetchWithRetry } from "./net.mts";

export const TRIPO_BASE_URL = "https://openapi.tripo3d.ai/v3";

export function createTripoClient(): TripoClient {
  return new TripoClient({
    apiKey: requireEnv("TRIPO_API_KEY"),
    baseUrl: TRIPO_BASE_URL,
    timeoutMs: 120_000,
    // The connection to Tripo intermittently fails to establish at all.
    fetch: ((input: Parameters<typeof fetch>[0], init: Parameters<typeof fetch>[1]) =>
      fetchWithRetry(input, init, { label: "tripo" })) as typeof globalThis.fetch,
  });
}
