# Deploying Lantern

## The one thing to understand first

**World binaries are not in git, and they never will be.** A single draft world is
~9.4 MB (986 KB splat, 8.4 MB collider, 25 KB thumbnail) and every new world adds
another. Committing them would bloat the repo permanently, so `public/worlds/` is
gitignored.

That splits a world in two:

| Part | Lives in | Committed |
|---|---|---|
| Manifest — `data/worlds/<id>.json` | git | **yes** |
| Splat, collider, thumbnail, object meshes | `public/worlds/<id>/` locally, Vercel Blob in production | no |

So a fresh `git clone` builds and runs, but shows no world until the binaries are
either regenerated locally or already uploaded to Blob. **A deploy without
`world:push` will render an empty scene** — the manifests point at `/worlds/...`
paths that do not exist on the server.

## First-time setup

The Vercel CLI is not installed in this repo's environment. Once:

```bash
npm i -g vercel
vercel login
vercel link                            # connect this directory to a project
vercel blob store add lantern-assets   # create the Blob store
vercel env pull                        # writes .env.local with BLOB_READ_WRITE_TOKEN
```

`.env.local` is gitignored (covered by `.env*`). The push script reads both `.env`
and `.env.local`.

## Publishing a world

```bash
npm run world:push          # uploads binaries, rewrites data/worlds/<id>.json
git add data/worlds && git commit -m "Publish world <id>"
vercel deploy --prod
```

`world:push` is idempotent: assets already on Blob are skipped, and uploads use a
fixed path per world rather than a random suffix, so re-running replaces rather
than accumulating orphans. Pass `--world-id <id>` for one world, `--force` to
re-upload.

After the push, the manifest holds absolute `https://...blob.vercel-storage.com/...`
URLs. Those work locally too, so local dev keeps working after publishing.

## Checking it worked

```bash
LANTERN_BASE_URL=https://<your-deployment> SHOT_BUDGET_MS=60000 npm run shot -- "/?hud=1"
```

The HUD line is the reliable signal — it prints position, facing, grounded state and
splat status as text. Trust it over the pixels: software-rendered captures are flaky
about *timing*, and a black frame usually means the splat had not finished loading,
not that anything is broken.

**Test touch on a real phone.** Headless Chrome reports `pointer: fine`, so the touch
paths cannot be verified from here at all — the deployment is the first real test of
the movement stick and look drag.

## Known issues to expect on the live URL

- **The collider is 8.4 MB and blocks both walking and occlusion** until it loads. On
  cellular this is the dominant cost of the first frame — far more than the 986 KB
  splat. Decimating it, or deferring it so the world is visible while collision is
  still arriving, is the obvious next performance move.
- **`/` is statically prerendered**, so the world list is baked at build time. Adding a
  world means redeploying. That has to change before Phase 2, where a visitor generates
  a world that must exist without a rebuild — most likely as a per-gift `/g/<id>` route.
