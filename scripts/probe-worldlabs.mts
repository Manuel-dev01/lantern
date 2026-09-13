/**
 * Cheapest possible proof that the World Labs key works.
 *
 * Asks for a world that cannot exist. A valid key gets 404 (authenticated,
 * nothing found); an invalid one gets 401/403 before the lookup happens. Either
 * way nothing is generated and no credits are spent — which matters, because
 * discovering a dead key after a five-minute generation wastes the session.
 *
 *   npm run world:probe
 */

import { wlProbe } from "./lib/worldlabs.mts";

const PROBE_PATH = "/marble/v1/worlds/lantern-probe-does-not-exist";

const { status, statusText, body } = await wlProbe(PROBE_PATH);

console.log(`GET ${PROBE_PATH}`);
console.log(`  -> ${status} ${statusText}`);
if (body) console.log(`  body: ${body.slice(0, 600)}`);
console.log();

if (status === 401 || status === 403) {
  console.error(
    "KEY REJECTED. The key in .env (WORLDLABS_API_KEY) was not accepted.\n" +
      "Check it at platform.worldlabs.ai — note that credits bought for the\n" +
      "Marble app do not work with the API, and a payment method may be\n" +
      "required before a key becomes active.",
  );
  process.exitCode = 1;
}

else if (status === 404) {
  console.log("KEY OK — authenticated, and the made-up world was not found (expected).");
}

else console.warn(
  `UNEXPECTED STATUS ${status}. The key was probably accepted, but this path\n` +
    "does not behave as docs/STRATEGY.md assumed. Read the body above before\n" +
    "spending credits — it is the real schema.",
);
