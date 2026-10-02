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
/**
 * Where the browser fetches assets from.
 *
 * Cloudflare R2, not Vercel Blob. Blob's store was blocked about a day into a
 * billing period for exceeding its free allowance, and the cause was egress
 * rather than space: a gift's full-resolution splat is 23 MB and every view
 * pulls it. R2 charges nothing for egress, which is the whole reason for the
 * move - judging runs for three weeks with judges opening gifts, so the same
 * cap would have been reached again at the worst possible moment.
 *
 * From the environment because the bucket's public host is account-specific,
 * and because a wrong value here fails as a blank world rather than an error.
 */
const ASSET_HOST = (process.env.R2_PUBLIC_URL ?? "").replace(/\/$/, "");

export const config: VercelConfig = {
  framework: "nextjs",
  rewrites: [
    routes.rewrite("/worlds/(.*)", `${ASSET_HOST}/worlds/$1`),
    // Visitor-generated gifts, same reasoning as worlds above.
    routes.rewrite("/gifts/(.*)", `${ASSET_HOST}/gifts/$1`),
  ],
  headers: [
    routes.cacheControl("/worlds/(.*)", {
      public: true,
      maxAge: "1 year",
      immutable: true,
    }),
    // Gift *assets* are immutable once written. The gift document itself is
    // not, but that is read server-side through the S3 API and never through
    // this path.
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
