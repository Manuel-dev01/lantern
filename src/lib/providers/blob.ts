import { del, head, list, put } from "@vercel/blob";

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
    // Blob caches public objects for a month by default. That is right for a
    // splat, which never changes, and badly wrong for a document rewritten at
    // every stage: the pipeline read back its own stale copy, concluded the
    // work was still pending, and re-mirrored the same asset forever.
    cacheControlMaxAge: 0,
  });
  return result.url;
}

export async function readBlobJson<T>(pathname: string): Promise<T | null> {
  try {
    const meta = await head(pathname, { token: token() });
    // Belt and braces with `cacheControlMaxAge` above: any document written
    // before that existed still carries a long TTL, and an edge cache between
    // here and the store may ignore `no-store`. A unique query defeats both.
    const fresh = `${meta.url}${meta.url.includes("?") ? "&" : "?"}ts=${Date.now()}`;
    const res = await fetchWithRetry(fresh, { cache: "no-store" }, { label: pathname });
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

/**
 * Remove blobs by pathname.
 *
 * Regenerating a gift's objects leaves the previous ones stored but
 * unreferenced: one rebuild of a four-object gift stranded 10.4 MB that
 * nothing would ever serve again. Storage is cheap, but an asset nobody can
 * reach is still an asset somebody pays for, and it makes the size numbers
 * this project keeps measuring meaningless.
 */
export async function deleteBlobs(pathnames: string[]): Promise<void> {
  if (!pathnames.length) return;
  await del(pathnames, { token: token() });
}
