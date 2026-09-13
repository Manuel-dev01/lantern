# Tripothon S1 — Strategy & Execution Plan

## Context

**Tripothon S1: "The First World-Building 3D Hackathon"** — $80,000 cash pool, global, free, solo-friendly.

- **Theme:** *"Build a world as a Gift — For the moon's dark side, For the kid I used to be."* Build a world "for a person, a place, or a future that does not exist yet."
- **Timeline:** Kickoff Sep 15 → **Submission closes Oct 5** → Judging Oct 5–25 → Winners Oct 25.
- **Today is Sep 13.** ~22 days, of which 2 are pre-kickoff setup days.
- **Our situation:** solo, near full-time, software-only, online-only, strong across web/TS/Three.js, Unity, 3D art, and AI backends.
- **Register:** https://tripo-ambassador.typeform.com/to/ScfyutRF · **Discord:** https://discord.com/invite/NEdkyQQ3VP · contest@vastai3d.com

**Goal:** win Global Top 1 ($5,000) plus the maximum stack of secondary awards.

### Prize math for our situation (online-only)

| Award | Value | Realistic? |
|---|---|---|
| Global Online Top 1 | **$5,000** | Target |
| Direction Track award (App) | **$800** | Target |
| Best Use of Tripo | **$800** | Target |
| Best Use of World Labs | **$800** | Target |
| Social Media (Mac mini ×3: most viewed / liked / quoted) | Mac mini | Live target |
| **Stackable ceiling** | **$7,400 + Mac mini** | |

Offline regional pools (SF $5,000 / other regions $2,500) are **unavailable to us** — we're not attending a Demo Day. Everything must land through the video and a live link.

---

## Track A — What actually wins this: the rubric, decoded

The published weights are the whole game. Do not guess at "impressiveness" — optimize the actual function.

**Direction Track (we enter exactly one):**

| Criterion | Weight | What it really rewards |
|---|---|---|
| Creativity | **30%** | A concept a judge has not seen before. The single largest lever. |
| Completeness | **25%** | It *works*, end to end, for a stranger, with no hand-holding. |
| Theme fit | **20%** | Literal, unmistakable connection to "a world as a gift." |
| Viral potential | **15%** | Would a judge screenshot it and post it? |
| Commercial value | **10%** | Is there an obvious business here? |

**Tool Track (we enter two: Tripo + World Labs):**

| Criterion | Weight | What it really rewards |
|---|---|---|
| Inventive use of tool | **35%** | Non-obvious use, not "I called the API." |
| Tool synergy | **25%** | Tripo and World Labs *combined* into something neither does alone. |
| Tool contribution | **20%** | Remove the tool and the project collapses. |
| Theme fit | 10% | |
| Breakout potential | 10% | |

### Four decisive reads

1. **Creativity + Theme fit = 50%.** A technically brilliant project with a generic concept loses to a modest project with an unforgettable one. The concept must be decided correctly on day one and never diluted.

2. **The theme is emotional, not technical.** "For the kid I used to be" is an invitation to make judges *feel* something. Tripothon is not asking for a tech demo. Most entrants will submit a tech demo. That gap is our opening.

3. **The judge panel is web-and-craft, not engine-and-enterprise.** 39 judges. **Pieter Levels (levelsio)** judges Game + Application — he is the internet's loudest advocate for *shipped, live, link-shareable, revenue-generating* browser software (fly.pieter.com). Alongside him on App: **Dilum Sanjaya** and **Nicolas Barradeau** — creative coders whose reputations are built on WebGL work you open in a tab. The rest skew heavily toward XR professors, VFX artists, and a Rockstar artist.
   → **Build for the browser. No installs, no APK, no login wall.** A Unity build that a judge must download is a self-inflicted wound on Completeness *and* Viral potential.

4. **"Viral potential" is scored, so virality must be a designed mechanic, not a hope.** The strongest possible answer: make *sharing the artifact* the core product loop, so the thing cannot be used without being sent to another human.

### Choice of Direction Track: **App**

App judges (Levels, Sanjaya, Sujita, Barradeau, Cruellas, Solarevisky) are precisely the audience for a browser-native creative tool. Entering **Game** instead would put us in front of career game designers (Limanseta, Méndez, López Moreno, Ledón Roig) who will judge mechanics against real games — a fight we don't need. App is also where Viral and Commercial score naturally.

---

## Track B — Frontier tech scouting: where the unfair advantage is

### The two APIs we will actually use

**World Labs — World API (Marble).** Text / image / panorama / multi-view / video → a persistent, navigable 3D world as **Gaussian splats**, plus **collider mesh and visual mesh**. Exports `.spz` (native, compressed) and `.ply`.
- Models: `marble-1.0-draft` (~150–250 credits), `marble-1.0` / `marble-1.1` (~1,500–1,600), `marble-1.1-plus` (1,500–3,100).
- **$1.00 = 1,250 credits** → a full world ≈ **$1.20**, a draft ≈ **$0.15**. Free tier ≈ 7,000 credits (~4 worlds).
- Generation ~5 min; high-quality mesh export ~1 hr.
- ⚠️ Credits bought for the Marble *app* do **not** work with the API. Buy on `platform.worldlabs.ai`.

**Tripo — v3 REST API.** Unified async "task" abstraction: text-to-3D, image-to-3D, multiview-to-3D, re-texturing, **mesh segmentation (`generate_parts`)**, **auto-rigging + animation retargeting**, stylization, format conversion.
- Models incl. `P1-20260311` (low-poly optimized), `v3.1`, `v3.0`. `smart_low_poly=true` gives 1K–20K faces — critical for web performance.
- Rig types: biped, quadruped, hexapod, octopod, avian, serpentine, aquatic. Rig v2.5 ships **27 preset animations**; v1.0 has 101.
- **1 credit = $0.01.** Text-to-3D 7–40cr, image-to-3D 7–50cr, textures +10/+20/+30, rig 25cr, retarget 10cr, segmentation 40cr.
- Official **JS/TS SDK** (`VAST-AI-Research/tripo-js-sdk`, zero deps, Node ≥18 / browsers / edge) and an **official MCP server**.

**Spark.js** — World Labs' own MIT-licensed 3DGS renderer for **Three.js / WebGL2**. Spark 2.0 (Apr 2026) adds streaming, LoD and GPU virtual memory for 100M+ splat scenes. Runs on desktop, mobile, **and WebXR**. Reads `.spz`, `.ply`, `.splat`, `.ksplat`, `.sog`.

### Six advantages most teams will miss

1. **Hybrid splat + polygon rendering with correct depth/occlusion.** Nearly every entrant will render *either* a Marble splat world *or* Tripo meshes. Compositing Tripo GLBs **inside** a Gaussian splat world, with correct depth sorting so objects sit behind and in front of splats convincingly, is genuinely hard and looks extraordinary. **This single technique is our "Tool synergy" score (25% of both tool tracks).**
2. **Use Marble's collider mesh for real first-person walking.** Most demos ship an orbit camera. Physics-collided walking inside a *generated* world makes it read as a place, not a screenshot.
3. **Tripo auto-rig + retarget on generated objects.** A gift object that stands up and moves is worth ten static meshes. ~$0.35 per object.
4. **Draft-then-final as a product mechanic.** `marble-1.0-draft` at $0.15 for instant preview, full world at $1.20 only on commit. Cost control that doubles as a UX ritual.
5. **Spatial audio.** The emotional payload is mostly sound. A recorded voice note attached to an object in 3D space is the highest emotional return per hour of work in this entire project. Almost no hackathon entry has audio.
6. **Ship a live URL from Day 3 and build in public daily.** Levels is a judge *and* is on X. The optional "public build log" is explicitly amplified by organizers, and there are three Mac minis for social metrics. Daily posting is a scored activity here, not a distraction.

---

## Track C — Five concepts

| # | Concept | Direction | The one-line hook |
|---|---|---|---|
| 1 | **Lantern** | App | Describe a memory; it becomes an explorable world you send to the person it's about. |
| 2 | **Dark Side** | Game | A shared world where every visitor leaves one object for a stranger they'll never meet. |
| 3 | **Rewind** | App | One childhood photo → the whole room rebuilt as a walkable world. |
| 4 | **Unbuilt** | Physical Design | Worlds for futures that never happened, exported as fabricable artifacts. |
| 5 | **The Last Room** | Game | An authored narrative game: you are a child inside a world someone built for you. |

**1 · Lantern** — Answer a few questions about a person and a place you'd give them. An LLM turns it into a Marble world prompt plus a list of significant objects; Tripo generates each object; each holds a voice note. The recipient opens a link, walks through, and finds the memories. Every gift joins a public "constellation" of all gifts ever given.

**2 · Dark Side** — A single persistent world on the moon's far side. Each visitor generates exactly one object with Tripo and leaves it. You never learn who receives it. Poetic, perfect literal theme fit, and beautifully simple.

**3 · Rewind** — Upload one old photo. Marble reconstructs the space; Tripo's segmentation turns each pictured object into a mesh you can pick up. A time capsule to send a sibling or parent.

**4 · Unbuilt** — Speculative architecture: describe a divergent future, walk it, then export print-ready geometry. Aimed squarely at the architecture judges (Roche, Jiménez García, Huang).

**5 · The Last Room** — Fully authored, no user generation. A 10-minute crafted story with the highest possible polish ceiling.

---

## Track D — Stress test

| | Feasibility (solo, 21d) | Tool synergy | Theme fit | Viral | Commercial | Fatal risk |
|---|---|---|---|---|---|---|
| **1 Lantern** | Medium — pipeline is the work | **Very high** | **Perfect** | **Very high** | **High** | Feels like a generator wrapper if the recipient experience is weak |
| 2 Dark Side | Medium — needs persistence + multiplayer | High | Perfect | Medium | Low | **Cold start** — an empty world reads as broken to a judge |
| 3 Rewind | Medium-high | High | Strong | High | Medium | **Fidelity gap** — a low-res 1990s photo may reconstruct poorly, and the emotional promise makes failure worse |
| 4 Unbuilt | High | Medium — Tripo underused | Medium | Low | Medium | Narrow judge appeal; we have no printer to close the digital-to-physical loop |
| 5 Last Room | Low — authoring is slow solo | Low — tools become asset sources | Strong | **Low** | Low | Zero viral mechanic; 15% forfeited, and craft must then be world-class |

**Cross-cutting risks**

- 🔴 **World API access is the single blocking dependency.** Signup path (self-serve vs. approval) is not documented publicly. **Resolve this before writing any code.** Fallback: generate worlds manually in the Marble app, export `.spz`, ship a curated library — degrades runtime generation, preserves the product.
- 🟠 **Cost.** A full 5-object gift ≈ $1.20 (world) + ~$2.50 (objects) ≈ **$4/gift**. Dev and demo across ~40 gifts ≈ **$100–200**. Budget it now. Mitigate with draft worlds during dev and low-poly/untextured objects for iteration.
- 🟠 **Web performance.** Splat worlds plus meshes plus audio on a mid-range phone. Mitigate with Spark 2.0 LoD/streaming and `smart_low_poly=true` on every Tripo asset.
- 🟠 **~5 min world generation** is far too long for a first-time visitor. Judges must land on a *pre-generated* gift instantly; only creation goes through the queue.
- 🟡 **Latency of the emotional payoff.** If the recipient experience isn't moving, the whole thesis fails. This is a writing and sound-design problem, not an engineering one — budget real time for it.

---

## 🏆 The Champion: **Lantern**

> *A world you can give someone.*

*(Name is swappable — "Keepsake" and "Faraway" are alternates. Decide once, on day one, then stop thinking about it.)*

### Why this one wins

- **Theme fit (20%) is literal, not metaphorical.** The theme says "build a world as a gift." Lantern's product *is* building a world as a gift. No judge has to be told the connection.
- **Creativity (30%): the inversion nobody else will build.** Every other entry will optimize the *creator's* experience. Lantern's product is the **recipient's** experience — opening something a specific person made for you. That reframing is the idea, and it is genuinely novel.
- **Viral potential (15%) is structural.** The artifact cannot exist without being sent to another human. K-factor is built into the mechanic, not bolted on. This is exactly the property Levels rewards.
- **Commercial value (10%) is self-evident.** Personalized gifting is a proven multi-billion-dollar market with a natural paywall: free to make, pay to keep it forever.
- **Tool synergy (25% of each tool track) is maximal.** Marble makes the *place*; Tripo makes the *things in it*. Neither tool alone produces the product. Remove either and Lantern collapses — which is precisely what "Tool contribution" (20%) measures.
- **Completeness (25%) is defensible solo** because the scope is one loop — create → send → open — not an open-ended sandbox.

### The three details that separate winning from placing

1. **The recipient view is the product.** Build it first, polish it most. A judge should be able to open one shared link and be moved within 40 seconds, before understanding any of the technology.
2. **Voice notes in 3D space.** You walk toward an object and someone's actual voice fades in. This is the emotional core and it is cheap to build.
3. **Seed it with real gifts for real people.** Ten genuine gifts made for real friends and family, with their real reactions, beats a hundred synthetic demos — and gives the video its ending.

---

## Execution roadmap

**Freeze date: Oct 3.** Submission closes Oct 5. The final 48 hours are buffer and launch, not building. This is non-negotiable — Completeness is 25% and a broken link on Oct 5 scores zero.

### Phase 0 · Sep 13–14 — Pre-flight (GO/NO-GO)

Do this **before** the Sep 15 kickoff.

1. Register via the Typeform; join the Discord.
2. **Get both API keys and prove they work.** Tripo (300 free credits, 2-week expiry — don't burn them early). World Labs at `platform.worldlabs.ai` (free tier ≈7,000 credits).
3. **Spike, in one sitting:** generate one `marble-1.0-draft` world → download `.spz` → load in Spark.js in a browser. Separately: one Tripo text-to-3D with `smart_low_poly=true` → GLB → same Three.js scene.
4. Ask in Discord: **what is the "Jupiter" tool track?** If it's software-accessible, it's a third $800 award. Also confirm submission platform and any pre-existing-code rules — the public page states neither.
5. **Gate:** if the World API is waitlisted, switch to the manual-export fallback *now* and re-scope, rather than discovering it on day 8.

### Phase 1 · Sep 15–17 — The renderer (ship a live URL by Day 3)

- Next.js + Three.js + **Spark.js**; deploy to Vercel on day one and keep it live from then on.
- Load a Marble `.spz` world; first-person controller using the **collider mesh** for real walking and gravity.
- **Composite Tripo GLBs into the splat scene with correct depth/occlusion.** This is the hardest and most valuable technical task in the project. Solve it early — everything else is downstream.
- Mobile touch controls from the start, not retrofitted.
- ✅ **Milestone:** a public URL where a stranger walks around a generated world containing generated objects.

### Phase 2 · Sep 18–21 — The generation pipeline

- Intake: a short, warm set of questions (who is this for, what place, what mattered).
- LLM turns answers into (a) one Marble world prompt and (b) 3–6 significant objects with descriptions.
- Async job orchestration: 1 Marble world + N parallel Tripo tasks, with per-task status streamed to the client.
- **Make the ~5-minute wait part of the ritual** — a "your world is being built" screen with real progress and the memory text, not a spinner.
- Persist worlds and object placements; short shareable URLs.

### Phase 3 · Sep 22–25 — The gift loop (the actual product)

- **Recipient flow, no login:** open link → a card with the sender's name → step inside.
- **Spatial audio:** recorded voice notes attached to objects, fading in on approach.
- Tripo **auto-rig + retarget** on 1–2 hero objects so something in the world is alive.
- Write the copy properly. Every string a recipient reads is carrying 30% of the score.
- ✅ **Milestone:** send a real gift to a real person and watch them open it.

### Phase 4 · Sep 26–28 — Constellation, polish, performance

- Public gallery of all gifts given — social proof, a browsing surface for judges, and the answer to Dark Side's cold-start problem.
- Perf pass: Spark 2.0 LoD/streaming, low-poly enforcement, texture budgets. **Target: usable on a mid-range phone.**
- Empty states, error states, failed-generation fallbacks. Judges will find every edge.

### Phase 5 · Sep 29–Oct 1 — Seed with real humans

- Create 10–15 genuine gifts for real people. Capture their reactions (with permission).
- Fix what real users break. Prune anything not carrying its weight.

### Phase 6 · Oct 2–3 — Freeze and produce

- **Code freeze Oct 3.**
- **Screen recording (required):** open on the *recipient* experience, not the tech. Structure: 0–20s the emotional hook (someone opening a gift) → 20–60s the create flow → 60–90s the technical reveal (Marble world + Tripo objects + rigging) → last 15s the constellation and real reactions.
- **Visual asset board (required):** key stills, turnarounds, environment frames. Compose these deliberately — several judges are VFX and 3D artists who will read this board as a portfolio piece.
- **Public build log (optional but amplified):** consolidate the daily X thread.

### Phase 7 · Oct 4–5 — Submit and launch

- Submit **Oct 4**, a full day early. Never submit on deadline day.
- Enter: **App** (direction) + **Tripo** and **World Labs** (tools), plus Jupiter if Phase 0 confirms it's viable.
- Public launch post: Show HN / X / r/threejs / the Tripothon Discord. Social metrics are a scored prize category.

### Continuous · Every day from Sep 15

One build-in-public post daily on X, tagging `@tripoai`, `@theworldlabs`, and the hackathon. Short clips, not text. Three Mac minis go to most viewed / most liked / most quoted, the organizers amplify visible entries, and a judge who has followed the build for three weeks arrives at judging already invested.

---

## Verification

Run these end to end before the Oct 3 freeze. Each maps to a scored criterion.

1. **Cold-stranger test (Completeness, 25%).** Hand the live link to someone with no context on a phone they didn't set up. They must reach the emotional payload with zero instructions. If they ask a question, fix that thing.
2. **Depth-composite check (Tool synergy, 25%).** Walk a Tripo object behind and in front of splat geometry. No z-fighting, no popping, no floating. Screenshot it — this frame goes in the asset board.
3. **Full-pipeline cold run.** From a fresh browser session: submit the intake form → Marble world generates → all Tripo tasks complete → world renders with objects placed → share link works from a different device on a different network.
4. **Failure injection.** Kill a Tripo task mid-flight; time out a Marble job; feed nonsense intake text. The app must degrade gracefully, never white-screen.
5. **Mobile performance.** Mid-range Android, cellular connection. Target ≥30fps and time-to-first-frame under 10s.
6. **Cost telemetry.** Log credits per gift on both APIs. Confirm unit economics before any public launch spike.
7. **The real test.** Give a gift to someone you actually love. If it doesn't move them, the concept isn't finished — and no amount of rendering will fix that.

---

## Sources

- [Tripothon S1 official event page](https://developers.tripo3d.ai/en/events/tripothon-s1)
- [World Labs — Announcing the World API](https://www.worldlabs.ai/blog/announcing-the-world-api) · [API pricing](https://docs.worldlabs.ai/api/pricing) · [Spark 2.0](https://www.worldlabs.ai/blog/spark-2.0)
- [Spark.js docs](https://sparkjs.dev/docs/overview/) · [sparkjsdev/spark](https://github.com/sparkjsdev/spark)
- [Tripo developer pricing](https://developers.tripo3d.ai/en/pricing) · [Tripo OpenAPI docs](https://docs.tripo3d.ai/get-started/pricing.html) · [tripo-js-sdk](https://github.com/VAST-AI-Research/tripo-js-sdk) · [tripo-mcp](https://github.com/vast-ai-research/tripo-mcp)
- [World Labs Hack 01 results](https://www.linkedin.com/posts/world-labs_70-hackers-joined-us-in-sf-for-the-first-ever-activity-7435409354020909056-L6Fk)

---

## Phase 0 findings — API surfaces pinned (Sep 13)

Gathered before kickoff so Phase 1 starts with zero unknowns.

### World API (World Labs / Marble)

- **Base URL:** `https://api.worldlabs.ai` · **Auth header:** `WLT-Api-Key: <key>`
- **Key acquisition:** sign in at `platform.worldlabs.ai` with a Marble account → **add a payment method and purchase credits** → generate key. ⚠️ A card appears to be required up front; don't assume the free tier is card-free.
- Endpoints:
  - `POST /marble/v1/worlds:generate` → returns `operation_id`
  - `GET  /marble/v1/operations/{operation_id}` → poll until `done: true`, then `response.id` and `response.world_marble_url`
  - `GET  /marble/v1/worlds/{world_id}` → full world details
  - `POST /marble/v1/worlds/{world_id}:export` → async export job
- Generate payload: `{ display_name, model: "marble-1.1", world_prompt: { type: "text", text_prompt: "..." } }`
- Export body: `asset_type` `"splats"|"mesh"` · `format` `"ply"|"glb"` · `resolution` `"full_res"|"500k"|"150k"|"100k"` · `mesh_variant` `"textured"|"vertex_colored"`
- Download URLs carry an `expires_at` — **mirror every asset to our own blob storage on receipt.**

**🔧 Correction to Phase 1.** The *API* exports **PLY splats** and **GLB mesh** — not `.spz`, and there is no separately named "collider mesh" endpoint. Those are Marble *app* features. Revised approach:

- **Visuals:** export `splats` / `ply`. Spark.js reads PLY natively, so nothing is lost.
- **Collision + occlusion:** export `mesh` / `glb` at **`resolution: "100k"`, `mesh_variant: "vertex_colored"`**. Use this single cheap asset twice — as the physics collider for first-person walking, *and* rendered invisibly as a depth-only pass so Tripo GLBs occlude correctly against the splats.

That last point is the whole hybrid-rendering trick, and it's now a known quantity rather than a research risk. Two exports per world; budget the extra credits.

### Tripo v3 (JS/TS SDK)

- `npm install @vastai/tripo-sdk` · env `TRIPO_API_KEY="tsk_..."` · base `https://openapi.tripo3d.ai/v3`
- `client.textToModel({ prompt, model, texture, pbr, texture_quality })` → `taskId`
- `client.imageToModel({ file, model, face_limit, texture })` · `client.multiviewToModel({...})`
- `client.waitForTask(id, { pollingIntervalMs, onProgress })` → `task.output.model_url`
- `client.uploadFile(buffer, { filename, contentType })` → `{ file_token }`
- Rig chain: `rigCheck({ input })` → `rigModel({ input, rig_type, spec: RigSpec.MIXAMO })` → `retargetAnimation({ input, animations: [Animation.IDLE, ...], out_format: 'glb' })`
- Also available: `textureModel()`, `convertModel()` (GLTF/FBX/OBJ/STL/USDZ/3MF), `decimateMesh()`, segmentation, mesh repair, retopology
- Model versions: `ModelVersion.H3_1` (`v3.1-20260211`), `ModelVersion.P1` (`P1-20260311`, low-poly optimized)
- ⚠️ **`model_url` expires ~5 minutes after completion.** Download immediately inside the job worker — never hand a raw Tripo URL to the browser.
- Errors: `TripoAPIError`, `TripoTaskError`, `TripoTimeoutError`

**Architectural consequence:** both APIs are async-job + expiring-URL, so the backend needs a **persist-on-completion worker** from day one — poll, download, re-upload to our own storage, then store our URL. Building this in Phase 1 rather than retrofitting it in Phase 2 avoids a rewrite.
