import { head, list, put } from "@vercel/blob";

import { fetchWithRetry } from "./net.ts";

/**
 * Blob storage, as used at runtime.
 *
 * The scripts mirror assets to `public/worlds/` on the local filesystem. A
 * deployment cannot: Vercel's filesystem is read-only, so anything a visitor
 * generates has to go straight to Blob. This is that path.
 *
 * Provider URLs expire - Tripo's in about five minutes - so a generated asset
 * is streamed here immediately and only our own URL is ever stored.
 */

function token(): string {
  const value = process.env.BLOB_READ_WRITE_TOKEN;
  if (!value) {
    throw new Error(
      "Missing BLOB_READ_WRITE_TOKEN. Locally it comes from `vercel env pull`; " +
        "on Vercel it is injected by the linked Blob store.",
    );
  }
  return value;
}

/**
 * Copy a provider URL into Blob and return our own URL for it.
 *
 * A fixed pathname rather than a random suffix, so retrying a failed stage
 * replaces the file instead of leaving orphans behind - which matters because
 * the pipeline is driven by repeated polling and any stage may run twice.
 */
export async function mirrorToBlob(
  sourceUrl: string,
  pathname: string,
): Promise<{ url: string; bytes: number; data: Buffer }> {
  const res = await fetchWithRetry(sourceUrl, undefined, { label: pathname });
  if (!res.ok) {
    throw new Error(
      `Could not fetch ${pathname} (${res.status} ${res.statusText}). ` +
        "Provider URLs are short-lived; this may simply have expired.",
    );
  }

  const data = Buffer.from(await res.arrayBuffer());
  const result = await put(pathname, data, {
    access: "public",
    token: token(),
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  // The bytes come back so a caller can measure them - reading a collider's
  // bounds, say - without fetching its own copy straight back out again.
  return { url: result.url, bytes: data.byteLength, data };
}

/** True when this exact pathname is already in the store. */
export async function blobExists(pathname: string): Promise<boolean> {
  try {
    const { blobs } = await list({ prefix: pathname, limit: 1, token: token() });
    return blobs.some((b) => b.pathname === pathname);
  } catch {
    return false;
  }
}

export async function writeBlobJson(pathname: string, value: unknown): Promise<string> {
  const result = await put(pathname, `${JSON.stringify(value, null, 2)}\n`, {
    access: "public",
    token: token(),
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
  return result.url;
}

export async function readBlobJson<T>(pathname: string): Promise<T | null> {
  try {
    const meta = await head(pathname, { token: token() });
    // `cache: no-store` because a gift document changes as the pipeline
    // advances, and a cached copy would show a finished world as still
    // generating.
    const res = await fetchWithRetry(meta.url, { cache: "no-store" }, { label: pathname });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Pathnames under a prefix, newest first. */
export async function listBlobs(prefix: string): Promise<
  Array<{ pathname: string; url: string; uploadedAt: Date }>
> {
  const { blobs } = await list({ prefix, token: token() });
  return blobs
    .map((b) => ({ pathname: b.pathname, url: b.url, uploadedAt: b.uploadedAt }))
    .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());
}
