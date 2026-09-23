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

## Live URL

**https://lantern-manuel-dev01s-projects.vercel.app**

Public — Vercel SSO protection is disabled, so a judge can open it with no account.
The GitHub repo stays private; only the running app is exposed.

## First-time setup

Already done for this project, kept for reference:

```bash
npm i -g vercel && vercel login
vercel link                                                  # connect the directory
vercel blob create-store lantern-assets --access public --yes
vercel env pull                                              # writes .env.local
vercel project protection disable --sso                      # make the URL public
```

`.env.local` is gitignored (covered by `.env*`). The push script reads both `.env`
and `.env.local`.

## Publishing a world

```bash
npm run world:generate      # binaries -> public/worlds/, manifest -> data/worlds/
npm run world:push          # binaries -> Blob
git add data/worlds && git commit -m "Publish world <id>" && git push
```

**Deploy by pushing to git, not with `vercel deploy`.** A CLI deploy uploads the
working directory from your machine — that was 21.9 MB and died mid-upload on a
slow connection. Pushing sends ~800 KB and Vercel pulls the repo server-side, which
built in 29 s.

`world:push` is idempotent: it lists the store once per world and skips what is
already there, so an unchanged re-run costs one request instead of re-sending
megabytes. Pass `--world-id <id>` for one world, `--force` to re-upload.

**Manifests keep relative paths and are never rewritten.** `vercel.ts` maps
`/worlds/*` onto the Blob store in production; locally the same paths are served
from `public/`. This is deliberate — see the warning below.

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

## Why assets are same-origin, and must stay that way

An earlier version pointed manifests at absolute Blob URLs. It broke the world
twice over, and both failures are silent:

1. **Spark loads splats with HTTP Range requests.** `Range` is not a CORS-safelisted
   header, so a cross-origin load triggers a preflight — which the Blob host answers
   with **405**. The only symptom is `could not open this world — network error`,
   with nothing pointing at CORS.
2. **Local development pulls every asset back over the internet.** On a slow link a
   1 MB splat took **153 seconds**, making the app unusable locally.

The rewrite fixes both: same-origin everywhere, no preflight, and local dev reads
from disk. Do not "simplify" this by putting Blob URLs in the manifest.

## Known issues to expect on the live URL

- **The collider is 8.4 MB.** It still gates *occlusion*, and on a slow connection it
  is the dominant cost of the first frame — far more than the 986 KB splat.
  Decimating it is the obvious next performance move.

  It no longer gates *walking*. The player stands on a box built from the world
  bounds from the first frame, and the real mesh replaces it when it arrives. Before
  that, the live site dropped every visitor through the floor on a loop: gravity ran
  with no collider, the player fell out of the world, the recovery respawned them, and
  they fell again. It never reproduced locally, where the collider loads instantly.
  **Anything gated on a multi-megabyte asset needs a defined behaviour for the seconds
  before it arrives** — and that behaviour has to be checked over the network, not on
  localhost.
- **`/` is statically prerendered**, so the world list is baked at build time. Adding a
  world means redeploying. That has to change before Phase 2, where a visitor generates
  a world that must exist without a rebuild — most likely as a per-gift `/g/<id>` route.
