/**
 * Asset storage.
 *
 * Both Tripo and World Labs hand back URLs that expire — Tripo's `model_url`
 * dies about five minutes after the task completes, and World Labs exports
 * carry an `expires_at`. A provider URL must therefore never reach the
 * browser: everything is mirrored here first, and callers only ever see the
 * app-relative URL this module returns.
 *
 * Today that means writing into `public/`, which `next dev` serves for free.
 * Phase 2 swaps the body of `saveStream` / `saveBytes` for a blob upload; the
 * return shape is what the rest of the code depends on, so nothing else moves.
 */

import { createWriteStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

import { fetchWithRetry } from "./net.mts";

/** Repo root, resolved from this file rather than from `process.cwd()`. */
export const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const PUBLIC_DIR = join(REPO_ROOT, "public");

export interface SavedAsset {
  /** App-relative, e.g. `/worlds/abc123/splat.ply`. Safe to hand to the browser. */
  publicUrl: string;
  /** Absolute path on disk. */
  path: string;
  bytes: number;
  ms: number;
}

/**
 * Download a (possibly expiring) provider URL straight to disk.
 *
 * `dir` is relative to `public/`, e.g. `worlds/abc123` or `objects`.
 */
export async function saveAsset(
  dir: string,
  filename: string,
  sourceUrl: string,
): Promise<SavedAsset> {
  const started = Date.now();
  const res = await fetchWithRetry(sourceUrl, undefined, { label: filename });
  if (!res.ok || !res.body) {
    throw new Error(
      `Download failed (${res.status} ${res.statusText}) for ${filename}. ` +
        `The URL may already have expired — these are short-lived.`,
    );
  }

  const destDir = join(PUBLIC_DIR, dir);
  await mkdir(destDir, { recursive: true });
  const path = join(destDir, filename);

  const body = Readable.fromWeb(res.body as unknown as Parameters<typeof Readable.fromWeb>[0]);
  await pipeline(body, createWriteStream(path));

  const { size } = await stat(path);
  return {
    publicUrl: `/${dir}/${filename}`,
    path,
    bytes: size,
    ms: Date.now() - started,
  };
}

/** Same contract as `saveAsset`, for bytes we already hold in memory. */
export async function saveBytes(
  dir: string,
  filename: string,
  data: ArrayBuffer | Uint8Array,
): Promise<SavedAsset> {
  const started = Date.now();
  const destDir = join(PUBLIC_DIR, dir);
  await mkdir(destDir, { recursive: true });
  const path = join(destDir, filename);
  const buffer = data instanceof Uint8Array ? data : new Uint8Array(data);
  await writeFile(path, buffer);
  return {
    publicUrl: `/${dir}/${filename}`,
    path,
    bytes: buffer.byteLength,
    ms: Date.now() - started,
  };
}

export async function writeJson(dir: string, filename: string, value: unknown): Promise<string> {
  const destDir = join(PUBLIC_DIR, dir);
  await mkdir(destDir, { recursive: true });
  const path = join(destDir, filename);
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return path;
}

export async function readJson<T>(dir: string, filename: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(join(PUBLIC_DIR, dir, filename), "utf8")) as T;
  } catch {
    return null;
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

/**
 * An already-mirrored asset, if it is present and non-empty.
 *
 * Re-running a world is normally about fixing metadata, not re-fetching bytes:
 * the collider alone took 12 minutes on a slow connection. Skipping what is
 * already on disk makes `--world-id` resumes nearly instant.
 */
export async function existingAsset(dir: string, filename: string): Promise<SavedAsset | null> {
  try {
    const path = join(PUBLIC_DIR, dir, filename);
    const { size } = await stat(path);
    if (!size) return null;
    return { publicUrl: `/${dir}/${filename}`, path, bytes: size, ms: 0 };
  } catch {
    return null;
  }
}
