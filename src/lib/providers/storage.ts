/**
 * Object storage, on Cloudflare R2.
 *
 * This was Vercel Blob until the store was blocked for exceeding its free
 * allowance, roughly a day into the billing period. The cause was egress, not
 * space: a gift's full-resolution splat is 23 MB and every view pulls it, so
 * seven seeded gifts and a few days of testing were enough. Judging runs for
 * three weeks, with judges opening gifts, so the same cap would have been hit
 * again at the worst possible moment.
 *
 * R2 charges nothing for egress at all, which is the whole reason it is here.
 *
 * The API is deliberately unchanged from the Blob version - the same seven
 * functions, the same pathnames - because every caller already spoke this
 * language and the day before a freeze is no time to re-teach them.
 *
 * Two things the old implementation needed that this one does not:
 *
 *  - **No cache-busting query on reads.** Blob served documents through a CDN
 *    that could hand two readers different versions for minutes. R2 reads here
 *    go through the S3 API, which is strongly read-after-write consistent.
 *  - **No `head` round trip** to find a URL. A pathname maps straight onto a
 *    key, so a read is one request rather than two.
 */

import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import { fetchWithRetry } from "./net.ts";

function env(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing ${name}. R2 needs R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, ` +
        "R2_SECRET_ACCESS_KEY, R2_BUCKET and R2_PUBLIC_URL. See docs/STORAGE.md.",
    );
  }
  return value;
}

/** The host the browser fetches assets from. Never used for reads here. */
export function publicUrl(pathname: string): string {
  return `${env("R2_PUBLIC_URL").replace(/\/$/, "")}/${pathname}`;
}

let client: S3Client | null = null;

function s3(): S3Client {
  if (client) return client;
  client = new S3Client({
    region: "auto",
    endpoint: `https://${env("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env("R2_ACCESS_KEY_ID"),
      secretAccessKey: env("R2_SECRET_ACCESS_KEY"),
    },
  });
  return client;
}

async function putObject(
  pathname: string,
  body: Buffer,
  contentType: string,
): Promise<{ url: string; bytes: number }> {
  await s3().send(
    new PutObjectCommand({
      Bucket: env("R2_BUCKET"),
      Key: pathname,
      Body: body,
      ContentType: contentType,
    }),
  );
  return { url: publicUrl(pathname), bytes: body.byteLength };
}

/**
 * Copy a provider URL into storage and return our own URL for it.
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
  const stored = await putObject(pathname, data, contentTypeFor(pathname));

  // The bytes come back so a caller can measure them - reading a collider's
  // bounds, say - without fetching its own copy straight back out again.
  return { ...stored, data };
}

/**
 * Store bytes we were handed rather than bytes we fetched.
 *
 * A voice note arrives from the sender's microphone, not from a provider, so
 * there is no URL to mirror.
 */
export async function writeBlobBytes(
  pathname: string,
  data: Buffer | Uint8Array,
  contentType: string,
): Promise<{ url: string; bytes: number }> {
  return putObject(pathname, Buffer.from(data), contentType);
}

/** True when this exact pathname is already in the store. */
export async function blobExists(pathname: string): Promise<boolean> {
  try {
    await s3().send(new HeadObjectCommand({ Bucket: env("R2_BUCKET"), Key: pathname }));
    return true;
  } catch {
    return false;
  }
}

export async function writeBlobJson(pathname: string, value: unknown): Promise<string> {
  const { url } = await putObject(
    pathname,
    Buffer.from(JSON.stringify(value)),
    "application/json",
  );
  return url;
}

/**
 * Read a JSON document back.
 *
 * Straight off the S3 API rather than the public URL. R2 is read-after-write
 * consistent, so unlike the Blob implementation this needs no cache-busting
 * query and cannot hand back a version from minutes ago - which is what made
 * the constellation show three gifts when five were shared.
 */
export async function readBlobJson<T>(pathname: string): Promise<T | null> {
  try {
    const res = await s3().send(
      new GetObjectCommand({ Bucket: env("R2_BUCKET"), Key: pathname }),
    );
    const body = await res.Body?.transformToString();
    return body ? (JSON.parse(body) as T) : null;
  } catch {
    return null;
  }
}

/** Pathnames under a prefix, newest first. */
export async function listBlobs(prefix: string): Promise<
  Array<{ pathname: string; url: string; uploadedAt: Date }>
> {
  const out: Array<{ pathname: string; url: string; uploadedAt: Date }> = [];
  let token: string | undefined;

  do {
    const page = await s3().send(
      new ListObjectsV2Command({
        Bucket: env("R2_BUCKET"),
        Prefix: prefix,
        ContinuationToken: token,
      }),
    );

    for (const item of page.Contents ?? []) {
      if (!item.Key) continue;
      out.push({
        pathname: item.Key,
        url: publicUrl(item.Key),
        uploadedAt: item.LastModified ?? new Date(0),
      });
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);

  return out.sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());
}

/**
 * Remove objects by pathname.
 *
 * Regenerating a gift's objects leaves the previous ones stored but
 * unreferenced. Storage is cheap, but an asset nobody can reach is still an
 * asset somebody pays for.
 */
export async function deleteBlobs(pathnames: string[]): Promise<void> {
  if (!pathnames.length) return;

  // The API takes a thousand keys at a time.
  for (let i = 0; i < pathnames.length; i += 1000) {
    await s3().send(
      new DeleteObjectsCommand({
        Bucket: env("R2_BUCKET"),
        Delete: { Objects: pathnames.slice(i, i + 1000).map((Key) => ({ Key })) },
      }),
    );
  }
}

/**
 * What a file should be served as.
 *
 * R2 keeps whatever it is told and serves it back, so getting this wrong is
 * not cosmetic: a `.glb` sent as `application/octet-stream` still loads, but a
 * splat served as `text/html` does not.
 */
function contentTypeFor(pathname: string): string {
  if (pathname.endsWith(".json")) return "application/json";
  if (pathname.endsWith(".glb")) return "model/gltf-binary";
  if (pathname.endsWith(".webp")) return "image/webp";
  if (pathname.endsWith(".png")) return "image/png";
  if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) return "image/jpeg";
  // .spz has no registered type; octet-stream is what Blob served it as and
  // what Spark expects to decode.
  return "application/octet-stream";
}
