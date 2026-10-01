/**
 * Make a gift the way a visitor would, and wait for it.
 *
 * Phase 5 asks for real gifts in the constellation before launch: a judge
 * arriving cold should find rooms already built for named people, not an
 * empty gallery and a five-minute wait. This drives the deployed endpoints
 * rather than calling the pipeline in-process, so seeding is also the
 * full-pipeline cold run the verification list asks for - intake, Marble,
 * Tripo, mirroring, placement, all of it, over the network, in production.
 *
 *   node scripts/seed-gift.mts --to "Mum" --from "Ada" \
 *     --memory "..." --model marble-1.1 --share
 */

const BASE = process.env.LANTERN_BASE_URL ?? "https://lantern-manuel-dev01s-projects.vercel.app";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

const memory = arg("memory");
if (!memory) {
  console.error('usage: seed-gift.mts --memory "..." [--to X] [--from Y] [--model m] [--share]');
  process.exit(1);
}

const label = arg("to") ?? "someone";

const created = await fetch(`${BASE}/api/gifts`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    toName: arg("to"),
    fromName: arg("from"),
    memory,
    model: arg("model") ?? "marble-1.1",
  }),
});

const start = (await created.json()) as { id?: string; error?: string };
if (!created.ok || !start.id) {
  console.error(`[${label}] could not start: ${start.error ?? created.status}`);
  process.exit(1);
}

const id = start.id;
console.log(`[${label}] ${id} started`);

// The client polling tick is what drives the pipeline; there is no worker.
const began = Date.now();
for (let i = 0; i < 400; i++) {
  await new Promise((r) => setTimeout(r, 5000));

  let data: { stage?: string; label?: string; objectsDone?: number; objectsTotal?: number; error?: string };
  try {
    const res = await fetch(`${BASE}/api/gifts/${id}/tick`, { method: "POST" });
    data = (await res.json()) as typeof data;
  } catch {
    continue; // A dropped poll is not a failure on this connection.
  }

  const mins = ((Date.now() - began) / 60000).toFixed(1);
  const count = data.objectsTotal ? ` ${data.objectsDone}/${data.objectsTotal}` : "";
  process.stdout.write(`\r[${label}] ${mins}m ${data.label ?? data.stage}${count}        `);

  if (data.stage === "ready") {
    console.log(`\n[${label}] ready after ${mins}m — ${BASE}/g/${id}`);
    if (process.argv.includes("--share")) {
      await fetch(`${BASE}/api/gifts/${id}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shared: true }),
      });
      console.log(`[${label}] shared to the constellation`);
    }
    process.exit(0);
  }

  if (data.stage === "failed") {
    console.log(`\n[${label}] failed: ${data.error}`);
    process.exit(1);
  }
}

console.log(`\n[${label}] gave up waiting`);
