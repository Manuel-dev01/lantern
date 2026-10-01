import { defineRailway, project, service } from "railway/iac";

// This repository manages only its own resources in the environment. Other
// repositories export their own partial name.
// See https://docs.railway.com/infrastructure-as-code#multi-repo-projects
export const partial = "lantern";

export default defineRailway(() => {
  /**
   * The gift worker. See docs/WORKER.md.
   *
   * Serves nothing and needs no domain - it only makes requests. The one
   * secret it needs is BLOB_READ_WRITE_TOKEN, pointing at the same store
   * Vercel uses; the Marble, Tripo and DeepSeek keys stay on Vercel, because
   * this never calls a provider itself. It asks the app to take one more step.
   *
   * No build step: the worker is TypeScript run directly by Node 24's own
   * type stripping, so installing dependencies is the whole of it.
   */
  const lantern = service("lantern", {
    build: "npm install --no-audit --no-fund",
    start: "node scripts/worker.mts",
  });
  return project("lantern-worker", {
    resources: [lantern],
  });
});
