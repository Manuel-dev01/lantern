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

`railway.json` already sets the start command and asks for a restart on failure, and the service
needs no public domain - it makes requests and serves none.

**The only secret it needs is `BLOB_READ_WRITE_TOKEN`**, which must be the same store Vercel uses,
or the worker will cheerfully drive an empty list for ever. Everything else - the Marble, Tripo and
DeepSeek keys - stays on Vercel, because the worker never calls a provider directly. It only asks
the app to take one more step.

## Checking it

`railway logs` should show `worker up, driving <url>`, then a line per gift it picks up and a line
when each finishes. On an idle system it says nothing at all, which is correct.
