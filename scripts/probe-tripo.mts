/**
 * Cheapest possible proof that the Tripo key works.
 *
 * `getBalance` costs nothing and answers both questions at once: is the key
 * accepted, and are there credits behind it. A valid key with a zero balance
 * fails later at task-creation time with a much less obvious error, so check
 * the number here before generating anything.
 *
 *   npm run object:probe
 */

import { createTripoClient, TRIPO_BASE_URL } from "./lib/tripo.mts";

const client = createTripoClient();
console.log(`base: ${TRIPO_BASE_URL}`);

try {
  const balance = await client.getBalance();
  console.log("KEY OK — Tripo accepted the key.");
  console.log(`  balance: ${balance.balance} credits (~$${(balance.balance / 100).toFixed(2)})`);
  if (balance.frozen) console.log(`  frozen:  ${balance.frozen}`);

  if (!balance.balance) {
    console.log();
    console.warn(
      "NO CREDITS. The key authenticates but the account has a zero balance,\n" +
        "so every generation call will fail. Claim the free tier or top up at\n" +
        "platform.tripo3d.ai before running `npm run object:generate`.",
    );
    process.exitCode = 1;
  }
} catch (err) {
  console.error("KEY REJECTED or request failed.");
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
}
