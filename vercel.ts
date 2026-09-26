import { routes, type VercelConfig } from "@vercel/config/v1";

/**
 * Lantern's deployment config.
 *
 * World manifests reference assets by relative path (`/worlds/<id>/splat.spz`).
 * Locally those are served straight out of `public/`. In production the files
 * are not in the repo at all - they live in Blob - so this rewrite maps the
 * same paths onto the store.
 *
 * Keeping them same-origin is deliberate, and fixes two things at once:
 *
 *  1. No CORS. Spark loads splats with HTTP Range requests, and `Range` is not
 *     a CORS-safelisted header, so a cross-origin load triggers a preflight -
 *     which the Blob host answers with 405. The world then fails with nothing
 *     more useful than "network error".
 *  2. Local development stays fast. Pointing manifests at absolute Blob URLs
 *     means every local page load pulls ~10 MB back over the internet.
 *
 * Worlds are immutable once generated - a gift never changes after it is sent -
 * so the assets can be cached as hard as the CDN allows.
 */
const BLOB_HOST = "https://5qgtncatzt22bvcl.public.blob.vercel-storage.com";

export const config: VercelConfig = {
  framework: "nextjs",
  rewrites: [
    routes.rewrite("/worlds/(.*)", `${BLOB_HOST}/worlds/$1`),
    // Visitor-generated gifts, same reasoning as worlds above.
    routes.rewrite("/gifts/(.*)", `${BLOB_HOST}/gifts/$1`),
  ],
  headers: [
    routes.cacheControl("/worlds/(.*)", {
      public: true,
      maxAge: "1 year",
      immutable: true,
    }),
    // Gift *assets* are immutable once written. The gift document itself is
    // not, but that is read server-side through the Blob API and never
    // through this path.
    routes.cacheControl("/gifts/(.*).spz", {
      public: true,
      maxAge: "1 year",
      immutable: true,
    }),
    routes.cacheControl("/gifts/(.*).glb", {
      public: true,
      maxAge: "1 year",
      immutable: true,
    }),
  ],
};
