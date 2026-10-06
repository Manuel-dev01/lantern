/**
 * Verify gravity and detailed-collider contact without drawing gaussian splats.
 *
 *   npm run gift:walk -- <baseUrl> <giftId>
 */

import { existsSync } from "node:fs";

import { chromium } from "playwright-core";

const [baseUrl = "http://127.0.0.1:3000", giftId] = process.argv.slice(2);
if (!giftId) {
  console.error("usage: probe-walk.mts <baseUrl> <giftId>");
  process.exit(1);
}

const chrome = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find(existsSync);
if (!chrome) throw new Error("System Chrome or Edge was not found.");

const browser = await chromium.launch({ executablePath: chrome, args: ["--disable-gpu"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const url = `${baseUrl.replace(/\/$/, "")}/g/${giftId}?enter=1&debug=nosplat&hud=1&autowalk=0.2`;

try {
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      console.log(`browser ${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => console.log(`browser pageerror: ${error.message}`));
  page.on("requestfailed", (request) =>
    console.log(`request failed: ${request.url()} — ${request.failure()?.errorText ?? "unknown"}`),
  );

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });

  const readHud = () =>
    page.evaluate(
      () =>
        Array.from(document.querySelectorAll("p")).find((element) =>
          element.textContent?.startsWith("pos "),
        )?.textContent ?? "HUD missing",
    );

  let before = "HUD missing";
  for (let attempt = 0; attempt < 18; attempt++) {
    await page.waitForTimeout(5_000);
    before = await readHud();
    if (before.includes("on mesh")) break;
  }
  await page.waitForTimeout(5_000);
  const after = await readHud();
  console.log(`before: ${before}`);
  console.log(`after:  ${after}`);

  if (!after.includes("grounded on mesh")) process.exitCode = 1;
} finally {
  await browser.close();
}
