# Continuation worker

Lantern's paid providers take longer than a browser session or one serverless
request can safely own. The Railway worker ensures a gift continues after its
sender closes the tab.

## Why it exists

Three mechanisms can advance a gift:

1. a browser polling its gift;
2. a Next.js `after()` continuation that carries on after a tick responds;
3. this long-running worker.

The first two improve normal responsiveness. Only the worker is independent of
an open browser and a single serverless invocation.

## Behavior

`scripts/worker.mts` lists unfinished gift documents in R2, calls the deployed
tick endpoint, sleeps, and repeats. It holds no local state. Gift documents
contain every provider task id and mirrored-asset checkpoint, so the worker can
restart at any time.

Ticks take a soft lease before doing work. Running two workers is wasteful but
should not start the same Tripo task twice.

Run locally:

```powershell
npm run worker
```

## Railway configuration

Set:

```text
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET
R2_PUBLIC_URL
LANTERN_BASE_URL=https://lantern-manuel-dev01s-projects.vercel.app
```

The service needs no public domain. The `Procfile` supplies the start command;
`railway.json` supplies the restart policy.

On Windows, make sure copied values have no trailing carriage return. A
well-formed secret plus `\r` produces an access-denied response that looks like
the wrong credential.

## Checking it

`railway logs` should show the base URL at startup, a line when an unfinished
gift is claimed, and its terminal `ready` or `failed` state. An idle worker is
quiet by design.

The meaningful test is a gift that finishes with nobody watching:

```powershell
$body = @{
  toName = "worker test"
  memory = "a small room with a clear floor and one warm window"
  model = "marble-1.0-draft"
} | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -ContentType "application/json" `
  -Body $body `
  -Uri "https://lantern-manuel-dev01s-projects.vercel.app/api/gifts"
```

Do not keep the returned gift page open. Watch Railway logs and then open the
gift only after the worker reports a terminal state.
