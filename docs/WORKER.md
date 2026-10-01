# The worker

## Why there is one

Lantern's pipeline is driven by whoever polls `tick`. For most of the build that was the sender's
browser, which means closing the tab left a gift stopped half-built, with Marble and Tripo credits
already spent on it.

Two things now sit in front of that, and only the third is a guarantee:

1. **A tick carries on after it answers.** One request keeps advancing the gift for the rest of
   its invocation and hands on to a fresh one, bounded at about fifty minutes.
2. **Work is taken under a lease**, so the server driving a gift and a browser still polling it
   do not both start the same Tripo task.
3. **This worker**, which simply never stops.

A serverless function cannot outlive its own invocation, so the guarantee has to live somewhere
that stays running. That is all this is.

## What it does

Asks the store what is unfinished, ticks each one until it is `ready` or `failed`, sleeps, repeats.
It holds no state - everything it needs is in Blob - so it can be killed and restarted at any
moment, and running two of it is wasteful but harmless, because work is leased.

Locally: `npm run worker`

## Deploying it on Railway

From the repo root:

```bash
railway link                 # pick or create a project
railway variables --set "BLOB_READ_WRITE_TOKEN=<same token as Vercel>"
railway variables --set "LANTERN_BASE_URL=https://lantern-manuel-dev01s-projects.vercel.app"
railway up
```

The service needs no public domain - it makes requests and serves none.

### Two things that will waste an hour if you do not know them

**The start command comes from the `Procfile`, not from `railway.json`.** Nixpacks detects a
Next.js app in this repo and starts `next start`, and the `startCommand` in `railway.json` did not
displace it - the service came up three times serving a web app nobody asked for. `Procfile` does
displace it. Both files are kept: the Procfile is what actually works, and `railway.json` carries
the restart policy.

**Strip the newline off the token.** `.env.local` is written with Windows line endings, so reading
the value straight out of it carries a trailing carriage return into Railway, and every call comes
back `Vercel Blob: Access denied, please provide a valid token for this resource` - which reads
exactly like a wrong token rather than a well-formed one with two extra characters on the end:

```bash
TOKEN=$(grep -m1 '^BLOB_READ_WRITE_TOKEN=' .env.local | cut -d= -f2- | tr -d '
')
```

### On the deprecation warning

The CLI will say `railway.json` is deprecated in favour of `.railway/railway.ts`. That migration was
attempted and abandoned: the generated file needs the `railway` npm package, which then refuses to
run because it believes the CLI is too old - against a CLI three releases newer than its own
minimum. The old format works until 2026-12-01, which is long after this matters.

**The only secret it needs is `BLOB_READ_WRITE_TOKEN`**, which must be the same store Vercel uses,
or the worker will cheerfully drive an empty list for ever. Everything else - the Marble, Tripo and
DeepSeek keys - stays on Vercel, because the worker never calls a provider directly. It only asks
the app to take one more step.

## Checking it

`railway logs` should show `worker up, driving <url>`, then a line per gift it picks up and a line
when each finishes. On an idle system it says nothing at all, which is correct.

## Proving it works

The point of the worker is a gift that finishes with nobody watching, so that is what to test:
create one and deliberately never open it.

```bash
curl -s -X POST -H "Content-Type: application/json"   -d '{"toName":"worker test","memory":"...","model":"marble-1.0-draft"}'   https://lantern-manuel-dev01s-projects.vercel.app/api/gifts
```

Then watch `railway logs`. It should report `driving 1: <id>` within half a minute and carry the
gift through every stage on its own. Confirmed on 1 Oct 2026: a gift created and never polled by
any browser went from `world_generating` to `objects_generating` under the worker alone.
