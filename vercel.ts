import { routes, type VercelConfig } from "@vercel/config/v1";

/**
 * Lantern's deployment config.
 *
 * Worlds are immutable once generated - a gift never changes after it is sent -
 * so anything under the blob store or the world manifests can be cached hard.
 * The splat and collider are the two heaviest things a recipient downloads, and
 * they are the whole reason the first frame takes as long as it does.
 */
export const config: VercelConfig = {
  framework: "nextjs",
  headers: [
    routes.cacheControl("/worlds/(.*)", {
      public: true,
      maxAge: "1 year",
      immutable: true,
    }),
  ],
};
