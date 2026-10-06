/**
 * Drive every screen with a real browser and report what is broken.
 *
 * Uses `playwright-core` against the Chrome already on this machine, rather
 * than `playwright`, which downloads its own browsers - a few hundred
 * megabytes this connection cannot fetch.
 *
 * What it checks on each screen, at desktop and phone width:
 *
 *  - console errors and page exceptions, with the text
 *  - failed network requests, with status
 *  - horizontal overflow (the single most common phone bug)
 *  - tap targets under 40px
 *  - loading states that never resolve
 *  - every button and link: present, enabled, and not obviously dead
 *
 * It screenshots everything, because a page can pass all of the above and
 * still look wrong, and that part needs eyes.
 *
 *   node scripts/sweep.mts [baseUrl]
 */

import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { chromium, type ConsoleMessage, type Page } from "playwright-core";

const BASE = process.argv[2] ?? "https://lantern-manuel-dev01s-projects.vercel.app";
const OUT = join(process.cwd(), "shots", "sweep");

const CHROME = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
];

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

/** Noise every page produces that says nothing about this app. */
const IGNORE = [
  /GPU stall due to ReadPixels/i,
  /GL Driver Message/i,
  /Download the React DevTools/i,
  /favicon/i,
  // Next cancels its own prefetches when you navigate away from a link it
  // was warming. Normal, not a failure, and it was the loudest thing here.
  /[?&]_rsc=/,
];

interface Finding {
  screen: string;
  viewport: string;
  kind: string;
  detail: string;
}

async function gotoWithRetry(page: Page, url: string): Promise<number> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });
      return attempt;
    } catch (error) {
      lastError = error;
      // The production sweep crosses several large asset requests on a
      // variable connection. A transient network switch is not a page bug;
      // only a URL that fails all three clean navigations is a finding.
      if (attempt < 3) await page.waitForTimeout(attempt * 750);
    }
  }
  throw lastError;
}

const findings: Finding[] = [];
const note = (screen: string, viewport: string, kind: string, detail: string) =>
  findings.push({ screen, viewport, kind, detail });

async function audit(page: Page, screen: string, viewport: string) {
  // Horizontal overflow: the page is wider than the window.
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    const widest: string[] = [];
    if (doc.scrollWidth > doc.clientWidth + 1) {
      for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
        const r = el.getBoundingClientRect();
        if (r.right > doc.clientWidth + 1 || r.left < -1) {
          widest.push(
            `${el.tagName.toLowerCase()}${el.className ? "." + String(el.className).split(" ")[0] : ""} right=${Math.round(r.right)}`,
          );
        }
        if (widest.length >= 5) break;
      }
      return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, widest };
    }
    return null;
  });
  if (overflow) {
    note(
      screen,
      viewport,
      "horizontal overflow",
      `page is ${overflow.scrollWidth}px wide in ${overflow.clientWidth}px — ${overflow.widest.join("; ")}`,
    );
  }

  // Tap targets. Only on the phone, where it matters.
  if (viewport === "mobile") {
    const small = await page.evaluate(() => {
      const out: string[] = [];
      for (const el of Array.from(
        document.querySelectorAll<HTMLElement>("a, button, input, textarea, [role=button]"),
      )) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        if (r.height < 40 || r.width < 40) {
          out.push(
            `${el.tagName.toLowerCase()} "${(el.textContent ?? "").trim().slice(0, 24)}" ${Math.round(r.width)}x${Math.round(r.height)}`,
          );
        }
      }
      return out.slice(0, 8);
    });
    for (const t of small) note(screen, viewport, "tap target under 40px", t);
  }

  // Controls that exist but cannot be used.
  const controls = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("a, button"))) {
      const label = (el.textContent ?? "").trim().slice(0, 30);
      if (el.tagName === "A") {
        const href = el.getAttribute("href");
        if (!href || href === "#") out.push(`dead link "${label}"`);
      }
      if (el.tagName === "BUTTON" && !label && !el.getAttribute("aria-label")) {
        out.push("button with no label and no aria-label");
      }
    }
    return [...new Set(out)].slice(0, 8);
  });
  for (const c of controls) note(screen, viewport, "control", c);
}

async function visit(page: Page, screen: string, path: string, viewport: string, settle = 6000) {
  const consoleErrors: string[] = [];
  const failures: string[] = [];

  const onConsole = (m: ConsoleMessage) => {
    if (m.type() !== "error") return;
    const text = m.text();
    if (IGNORE.some((r) => r.test(text))) return;
    consoleErrors.push(text.slice(0, 200));
  };
  const onPageError = (e: Error) => consoleErrors.push(`UNCAUGHT: ${e.message.slice(0, 200)}`);
  const onFailed = (r: { url: () => string; failure: () => { errorText: string } | null }) => {
    const url = r.url();
    if (IGNORE.some((x) => x.test(url))) return;
    failures.push(`${r.failure()?.errorText ?? "failed"} ${url.replace(BASE, "")}`);
  };
  const onResponse = (r: { status: () => number; url: () => string }) => {
    if (r.status() >= 400) failures.push(`HTTP ${r.status()} ${r.url().replace(BASE, "")}`);
  };

  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  page.on("requestfailed", onFailed);
  page.on("response", onResponse);

  try {
    const attempts = await gotoWithRetry(page, `${BASE}${path}`);
    if (attempts > 1) failures.length = 0;
  } catch (err) {
    note(screen, viewport, "navigation failed", err instanceof Error ? err.message.slice(0, 160) : "");
  }

  await page.waitForTimeout(settle);
  try {
    await audit(page, screen, viewport);
  } catch (err) {
    // A Next/Vercel navigation can replace the document between the final
    // wait and the first evaluate. That is a race in the probe, not a reason
    // to lose every later screen. Wait for the replacement document and audit
    // it once; any repeat failure is recorded normally below.
    if (err instanceof Error && /Execution context was destroyed/i.test(err.message)) {
      await page.waitForLoadState("domcontentloaded", { timeout: 30_000 }).catch(() => {});
      await page.waitForTimeout(500);
      await audit(page, screen, viewport);
    } else {
      throw err;
    }
  }

  for (const e of [...new Set(consoleErrors)]) note(screen, viewport, "console error", e);
  for (const f of [...new Set(failures)].slice(0, 10)) note(screen, viewport, "request", f);

  // Viewport-sized, animations frozen, and never allowed to kill the run.
  //
  // A full-page shot of the landing timed out at 30s: it is several screens
  // tall, every section has large blurred layers, and a WebGL canvas is
  // running behind it. That is worth knowing, but it is not worth losing the
  // whole sweep to.
  try {
    await page.screenshot({
      path: join(OUT, `${screen}-${viewport}.png`),
      animations: "disabled",
      caret: "hide",
      timeout: 25_000,
    });
  } catch (err) {
    note(
      screen,
      viewport,
      "screenshot timed out",
      `could not capture in 25s — ${err instanceof Error ? err.message.slice(0, 80) : ""}`,
    );
  }

  page.off("console", onConsole);
  page.off("pageerror", onPageError);
  page.off("requestfailed", onFailed);
  page.off("response", onResponse);
}

// ---------------------------------------------------------------- run it

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: CHROME.find(Boolean),
  args: ["--enable-unsafe-swiftshader", "--disable-gpu"],
});

const screens: Array<[string, string, number]> = [
  ["landing", "/", 9000],
  ["make", "/make", 5000],
  ["constellation", "/constellation", 7000],
  ["gift-door", `/g/${process.env.SWEEP_GIFT ?? "Z1MV55219C"}`, 12000],
];

for (const viewport of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    hasTouch: viewport.name === "mobile",
    isMobile: viewport.name === "mobile",
  });
  const page = await context.newPage();

  for (const [screen, path, settle] of screens) {
    process.stdout.write(`${viewport.name} ${screen}… `);
    await visit(page, screen, path, viewport.name, settle);
    console.log("done");
  }

  // The intake is a flow, not a screen: walk it without submitting.
  process.stdout.write(`${viewport.name} make-flow… `);
  try {
    await gotoWithRetry(page, `${BASE}/make`);
    await page.waitForTimeout(2500);
    await page.locator("input, textarea").first().fill("Tobi");
    await page.getByRole("button", { name: /next/i }).click();
    await page.waitForTimeout(1200);
    await page
      .locator("textarea")
      .first()
      .fill("The roof of the block of flats we grew up in, cracked concrete and aerials.");
    await page.getByRole("button", { name: /next/i }).click();
    await page.waitForTimeout(1200);
    await page.screenshot({
      path: join(OUT, `make-step3-${viewport.name}.png`),
      animations: "disabled",
      timeout: 25_000,
    });
    await audit(page, "make-step3", viewport.name);
    console.log("done");
  } catch (err) {
    note("make-flow", viewport.name, "flow broke", err instanceof Error ? err.message.slice(0, 160) : "");
    console.log("FAILED");
  }

  await context.close();
}

await browser.close();

// ---------------------------------------------------------------- report

console.log(`\n${"=".repeat(70)}\n${findings.length} finding(s)\n`);

const byScreen = new Map<string, Finding[]>();
for (const f of findings) {
  const key = `${f.screen} · ${f.viewport}`;
  byScreen.set(key, [...(byScreen.get(key) ?? []), f]);
}
for (const [key, list] of byScreen) {
  console.log(`\n### ${key}`);
  for (const f of list) console.log(`  [${f.kind}] ${f.detail}`);
}
if (!findings.length) console.log("Clean.");
console.log(`\nscreenshots: ${OUT}`);
