/**
 * World Labs (Marble) World API client.
 *
 * The endpoint shapes below come from docs/STRATEGY.md's Phase 0 findings,
 * which were researched rather than executed. Assume they are approximately
 * right and occasionally wrong: every non-2xx response throws with the status
 * AND the full body text, because the body is where the real schema is. Do
 * not "clean up" those errors into a generic message.
 */

import { requireEnv } from "./env.mts";

export const BASE_URL = "https://api.worldlabs.ai";

export class WorldLabsError extends Error {
  // Declared as plain fields, not constructor parameter properties: Node runs
  // these scripts with strip-only type removal, which rejects that syntax.
  status: number;
  statusText: string;
  body: string;
  path: string;

  constructor(status: number, statusText: string, body: string, path: string) {
    super(
      `World Labs ${status} ${statusText} on ${path}\n` +
        `--- response body ---\n${body || "(empty)"}\n---------------------`,
    );
    this.name = "WorldLabsError";
    this.status = status;
    this.statusText = statusText;
    this.body = body;
    this.path = path;
  }
}

export async function wlFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "WLT-Api-Key": requireEnv("WORLDLABS_API_KEY"),
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

  const text = await res.text();
  if (!res.ok) {
    throw new WorldLabsError(res.status, res.statusText, text, path);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

/** Raw status probe: no throw, no parse. Used to validate the key for free. */
export async function wlProbe(
  path: string,
): Promise<{ status: number; statusText: string; body: string }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "WLT-Api-Key": requireEnv("WORLDLABS_API_KEY") },
  });
  return { status: res.status, statusText: res.statusText, body: await res.text() };
}

// ─── Operations ─────────────────────────────────────────────────────────────

export interface Operation<T = Record<string, unknown>> {
  operation_id?: string;
  name?: string;
  done?: boolean;
  error?: { code?: number; message?: string; [key: string]: unknown };
  response?: T;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

/** The API has used both `operation_id` and `name` for this in the wild. */
function operationId(op: Operation): string {
  const id = op.operation_id ?? op.name;
  if (!id) {
    throw new Error(
      `No operation id in response. Raw payload:\n${JSON.stringify(op, null, 2)}`,
    );
  }
  return String(id).replace(/^operations\//, "");
}

export async function pollOperation<T = Record<string, unknown>>(
  op: Operation | string,
  {
    intervalMs = 10_000,
    timeoutMs = 900_000,
    label = "operation",
  }: { intervalMs?: number; timeoutMs?: number; label?: string } = {},
): Promise<T> {
  const id = typeof op === "string" ? op : operationId(op);
  const started = Date.now();

  for (;;) {
    const current = await wlFetch<Operation<T>>(`/marble/v1/operations/${id}`);

    if (current.done) {
      if (current.error) {
        throw new Error(
          `${label} failed: ${JSON.stringify(current.error, null, 2)}`,
        );
      }
      if (!current.response) {
        throw new Error(
          `${label} reported done with no response payload:\n` +
            JSON.stringify(current, null, 2),
        );
      }
      console.log(`  ${label}: done in ${elapsed(started)}`);
      return current.response;
    }

    const elapsedMs = Date.now() - started;
    if (elapsedMs > timeoutMs) {
      throw new Error(
        `${label} still running after ${elapsed(started)} (timeout ${Math.round(timeoutMs / 1000)}s). ` +
          `Operation id ${id} — it may still complete; re-run with --world-id to resume.`,
      );
    }

    // A silent multi-minute script is indistinguishable from a hung one.
    const progress = current.metadata?.progress;
    console.log(
      `  ${label}: ${elapsed(started)}${progress !== undefined ? ` — ${JSON.stringify(progress)}` : ""}`,
    );
    await sleep(intervalMs);
  }
}

// ─── Worlds ─────────────────────────────────────────────────────────────────

/**
 * The assets a world ships with.
 *
 * Verified live on Sep 13: a completed generate operation already carries
 * finished, downloadable assets -- .spz splats at three levels of detail and a
 * purpose-built collider mesh. No export call is required for either, which
 * corrects docs/STRATEGY.md's Phase 1 note claiming the API emits only PLY and
 * has no collider endpoint.
 */
export interface WorldAssets {
  mesh?: {
    collider_mesh_url?: string | null;
    hq_mesh_url?: string | null;
    full_res_mesh_url?: string | null;
  } | null;
  imagery?: { pano_url?: string | null } | null;
  splats?: {
    /** Keyed by level of detail: "100k", "500k", "full_res". */
    spz_urls?: Record<string, string | null> | null;
    semantics_metadata?: unknown;
  } | null;
  thumbnail_url?: string | null;
  /** A model-written description of the generated world. */
  caption?: string | null;
}

export interface GenerateWorldResult {
  id?: string;
  world_id?: string;
  world_marble_url?: string;
  display_name?: string;
  model?: string;
  created_at?: string;
  assets?: WorldAssets | null;
  [key: string]: unknown;
}

/** Full world details, for resuming against a world generated earlier. */
export async function getWorld(worldId: string): Promise<GenerateWorldResult> {
  return wlFetch<GenerateWorldResult>(`/marble/v1/worlds/${worldId}`);
}

export async function generateWorld(params: {
  displayName: string;
  model: string;
  textPrompt: string;
}): Promise<Operation> {
  return wlFetch<Operation>("/marble/v1/worlds:generate", {
    method: "POST",
    body: JSON.stringify({
      display_name: params.displayName,
      model: params.model,
      world_prompt: { type: "text", text_prompt: params.textPrompt },
    }),
  });
}

export type ExportAssetType = "splats" | "mesh";

export interface ExportParams {
  asset_type: ExportAssetType;
  format: "ply" | "glb";
  resolution?: "full_res" | "500k" | "150k" | "100k";
  mesh_variant?: "textured" | "vertex_colored";
}

export interface ExportResult {
  url?: string;
  download_url?: string;
  expires_at?: string;
  [key: string]: unknown;
}

export async function exportWorld(
  worldId: string,
  params: ExportParams,
): Promise<Operation<ExportResult>> {
  return wlFetch<Operation<ExportResult>>(
    `/marble/v1/worlds/${worldId}:export`,
    { method: "POST", body: JSON.stringify(params) },
  );
}

/** Export responses have used several names for the download link. */
export function downloadUrlOf(result: ExportResult): string {
  const url =
    result.url ??
    result.download_url ??
    (result.asset as { url?: string } | undefined)?.url;
  if (!url) {
    throw new Error(
      `No download URL in export result. Raw payload:\n${JSON.stringify(result, null, 2)}`,
    );
  }
  return url;
}

// ─── Small helpers ──────────────────────────────────────────────────────────

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function elapsed(since: number): string {
  const s = Math.round((Date.now() - since) / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, "0")}s`;
}
