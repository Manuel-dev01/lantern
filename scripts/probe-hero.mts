/**
 * Measure the landing page in the same system-Chrome software-rendering path
 * used for the original 0 fps / 60 fps comparison.
 *
 *   npm run hero:probe -- [baseUrl]
 */

import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { chromium } from "playwright-core";

const base = process.argv[2] ?? "http://127.0.0.1:3000";
const out = join(process.cwd(), "shots", "hero-probe.png");
const chrome = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find(existsSync);

if (!chrome) throw new Error("System Chrome or Edge was not found.");

await mkdir(join(process.cwd(), "shots"), { recursive: true });

const browser = await chromium.launch({
  executablePath: chrome,
  args: ["--enable-unsafe-swiftshader", "--disable-gpu"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.addInitScript(() => {
  Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 8 });
  let frames = 0;
  const started = performance.now();
  const tick = () => {
    frames++;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  Object.defineProperty(window, "__heroProbe", {
    get: () => ({ frames, elapsedMs: performance.now() - started }),
  });
});

try {
  await page.goto(base, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForTimeout(8_000);

  const readSnapshot = () =>
    Promise.race([
      page.evaluate(() => {
        const sample = (
          window as Window & { __heroProbe?: { frames: number; elapsedMs: number } }
        ).__heroProbe;
        const canvas = document.querySelector("section canvas");
        return {
          frames: sample?.frames ?? 0,
          elapsedMs: sample?.elapsedMs ?? 0,
          canvas: Boolean(canvas),
          opacity: canvas?.parentElement ? getComputedStyle(canvas.parentElement).opacity : "n/a",
        };
      }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 5_000)),
    ]);

  const before = await readSnapshot();
  await page.waitForTimeout(5_000);
  const after = before ? await readSnapshot() : null;

  const shotStarted = performance.now();
  let screenshot = "completed";
  try {
    await page.screenshot({ path: out, timeout: 20_000 });
  } catch (error) {
    screenshot = `failed: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`;
  }
  const screenshotMs = Math.round(performance.now() - shotStarted);

  const sampledFrames = before && after ? after.frames - before.frames : 0;
  const sampledMs = before && after ? after.elapsedMs - before.elapsedMs : 0;

  console.log(
    before && after
      ? `fps: ${((sampledFrames * 1000) / sampledMs).toFixed(1)} (${sampledFrames} frames / ${(sampledMs / 1000).toFixed(1)}s)`
      : "fps: ~0 (page did not answer the probe within 5s)",
  );
  console.log(
    `hero canvas: ${after ? (after.canvas ? `present, opacity ${after.opacity}` : "absent") : "page unresponsive"}`,
  );
  console.log(`screenshot: ${screenshot} in ${screenshotMs}ms`);
  if (screenshot === "completed") console.log(`output: ${out}`);
} finally {
  await browser.close();
}
