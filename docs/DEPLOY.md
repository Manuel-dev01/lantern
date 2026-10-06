# Deploying Lantern

The Next.js application runs on Vercel. Generated documents and binaries live
in Cloudflare R2. A Railway worker keeps unfinished gifts advancing when no
browser is open.

## Contents

- [Live application](#live-application)
- [Deployment shape](#deployment-shape)
- [Environment](#environment)
- [Release procedure](#release-procedure)
- [World assets](#world-assets)
- [Same-origin invariant](#same-origin-invariant)
- [Post-deploy checks](#post-deploy-checks)

## Live application

<https://lantern-manuel-dev01s-projects.vercel.app>

Vercel SSO protection must remain disabled so a judge can open the demo without
an account.

## Deployment shape

| Concern | Service | Notes |
|---|---|---|
| Next.js pages and APIs | Vercel | routes, pipeline ticks, same-origin rewrites |
| gift JSON and binaries | Cloudflare R2 | strongly consistent server reads; public immutable assets |
| continuation worker | Railway | lists unfinished gifts and calls the deployed tick API |

World binaries are intentionally not in git. A full splat is tens of megabytes,
and every generated gift adds another splat, collider, thumbnail, and object
set. Git contains code, documentation, scripts, and curated manifests; R2 owns
runtime data.

## Environment

Vercel needs:

```text
WORLDLABS_API_KEY
TRIPO_API_KEY
DEEPSEEK_API_KEY
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET
R2_PUBLIC_URL
```

Railway needs the five `R2_*` variables plus:

```text
LANTERN_BASE_URL=https://lantern-manuel-dev01s-projects.vercel.app
```

The worker never calls World Labs, Tripo, or DeepSeek directly, so their keys
remain on Vercel.

## Release procedure

1. Verify locally:

   ```powershell
   npm run sweep
   npx tsc --noEmit
   npm run build
   ```

2. Review the git diff and confirm no `.env`, signed provider URL, generated
   world binary, or `shots/` media is staged.
3. Commit and push to the deployment branch. The linked Vercel project builds
   from the repository.
4. Confirm the deployment URL, favicon, landing page, a known gift, and the
   Constellation.

Prefer the repository deployment path over `vercel deploy` from this machine.
The CLI uploads the working directory and can include large ignored local
assets or fail mid-transfer; the git build is smaller and reproducible.

## World assets

Curated local worlds use two layers:

| Part | Local path | Production |
|---|---|---|
| manifest | `data/worlds/<id>.json` | bundled with application |
| splat/collider/thumbnail | `public/worlds/<id>/` | R2 `worlds/<id>/` |

Publish only the assets a hero needs:

```powershell
npm run world:hero -- <worldId>
```

Visitor-generated gifts already mirror their assets into `gifts/<giftId>/` as
the pipeline advances. Provider URLs are short-lived and must never be written
into a client-facing manifest.

## Same-origin invariant

Manifests keep app-relative `/worlds/*` and `/gifts/*` URLs. In development,
Next.js serves local public files. In production, `vercel.ts` rewrites the same
paths to `R2_PUBLIC_URL`.

Do not replace those paths with absolute R2 URLs. Spark loads splats with range
requests; a direct cross-origin request introduces a preflight and has previously
failed as a blank world with only a generic network error. Same-origin paths
also keep local development from downloading every asset over the internet.

## Post-deploy checks

- `/` returns 200 and the icon appears in a fresh tab.
- `/g/Z1MV55219C` reaches its threshold card.
- entering a gift eventually reports the requested splat LoD, collider, and
  object count in `?hud=1` mode.
- a desktop walk remains grounded and stops at the capture-safe boundary.
- `/constellation` loads public cards.
- `railway logs` shows the worker targeting the current production URL.
- system Chrome reports hardware WebGL before any final visual judgement.

See [STORAGE.md](STORAGE.md) for bucket setup and [WORKER.md](WORKER.md) for the
continuation service.
