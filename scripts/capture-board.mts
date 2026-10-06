/**
 * Capture the submission asset-board frames with the installed system Chrome.
 *
 *   npm run capture:board -- arrival
 *   npm run capture:board -- lod-100k lod-full
 *   npm run capture:board -- all --headed
 *
 * Unlike `shot.mjs`, this deliberately leaves Chrome on the hardware GPU.
 * Spark's software-rendered canvas measured at roughly zero fps and produced
 * blank or half-drawn frames, so it cannot be used to judge or deliver splats.
 */

import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type Page, type PageScreenshotOptions } from "playwright-core";

const BASE = process.env.LANTERN_BASE_URL ??
  "https://lantern-manuel-dev01s-projects.vercel.app";
const OUT = resolve(process.env.CAPTURE_DIR ?? "shots/asset-board");
const TIMEOUT_MS = Number(process.env.CAPTURE_TIMEOUT_MS ?? 180_000);
const headed = process.argv.includes("--headed");

const CHROME = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find(existsSync);

if (!CHROME) throw new Error("No system Chrome or Edge installation found.");

type SceneReady = {
  gift: string;
  lod: "100k" | "full_res";
  objects: number;
};

type Shot = {
  path: string;
  ready?: SceneReady | "threshold" | "page";
  clip?: NonNullable<PageScreenshotOptions["clip"]>;
};

// Camera numbers are intentionally written into the deliverable script. The
// normal/debug occlusion pair and the LoD pair must be pixel-identical or they
// do not prove what the board claims they prove.
const shots: Record<string, Shot> = {
  threshold: {
    path: "/g/1KAJZTJBK1",
    ready: "threshold",
  },
  arrival: {
    path: "/g/Z1MV55219C?enter=1&lod=full_res&cam=0,0,0&look=0,-0.2,-0.98",
    ready: { gift: "Z1MV55219C", lod: "full_res", objects: 5 },
  },
  "object-close": {
    path: "/g/Z1MV55219C?enter=1&lod=full_res&cam=0,0,0&look=0,-0.2,-0.98",
    ready: { gift: "Z1MV55219C", lod: "full_res", objects: 5 },
    clip: { x: 620, y: 390, width: 1230, height: 670 },
  },
  occlusion: {
    path: "/g/1KAJZTJBK1?enter=1&lod=full_res&cam=0,-0.08,0&look=-0.3,-0.55,-0.78",
    ready: { gift: "1KAJZTJBK1", lod: "full_res", objects: 5 },
  },
  "occlusion-collider": {
    path: "/g/1KAJZTJBK1?enter=1&lod=full_res&debug=collider&cam=0,-0.08,0&look=-0.3,-0.55,-0.78",
    ready: { gift: "1KAJZTJBK1", lod: "full_res", objects: 5 },
  },
  "lod-100k": {
    path: "/g/Z1MV55219C?enter=1&lod=100k&cam=0,0,0&look=0,-0.2,-0.98",
    ready: { gift: "Z1MV55219C", lod: "100k", objects: 5 },
  },
  "lod-full": {
    path: "/g/Z1MV55219C?enter=1&lod=full_res&cam=0,0,0&look=0,-0.2,-0.98",
    ready: { gift: "Z1MV55219C", lod: "full_res", objects: 5 },
  },
  constellation: {
    path: "/constellation",
    ready: "page",
  },
};

function finishedAssets(page: Page) {
  const urls = new Set<string>();
  page.on("requestfinished", (request) => urls.add(request.url()));
  return urls;
}

async function waitForAssets(
  page: Page,
  finished: Set<string>,
  ready: SceneReady,
) {
  const prefix = `/gifts/${ready.gift}/`;
  const splat = `splat-${ready.lod}.spz`;

  await page.waitForFunction(
    ({ prefix, splat, count }) => {
      const urls = (window as Window & { __lanternFinished?: string[] })
        .__lanternFinished ?? [];
      const relevant = urls.filter((url) => url.includes(prefix));
      return relevant.some((url) => url.endsWith(splat)) &&
        relevant.some((url) => url.endsWith("collider.glb")) &&
        new Set(relevant.filter((url) => /\/object-[^/]+\.glb$/.test(url))).size >= count;
    },
    { prefix, splat, count: ready.objects },
    { timeout: TIMEOUT_MS },
  );

  // Network completion precedes GLB parsing and the last Spark frame. The
  // small settle is measured in frames, not a guessed multi-minute timeout.
  await page.waitForFunction(
    () => !document.body.innerText.includes("opening…"),
    undefined,
    { timeout: TIMEOUT_MS },
  );
  await page.waitForTimeout(4_000);

  // Keep the closure live until after the wait; requestfinished writes here.
  void finished;
}

async function gpuName(page: Page) {
  return page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    const gl = canvas?.getContext("webgl2") ?? canvas?.getContext("webgl");
    if (!gl) return "no WebGL context";
    const debug = gl.getExtension("WEBGL_debug_renderer_info");
    return debug
      ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL))
      : String(gl.getParameter(gl.RENDERER));
  });
}

const requested = process.argv
  .slice(2)
  .filter((arg) => arg !== "--headed");
const names = requested.length === 0 || requested.includes("all")
  ? Object.keys(shots)
  : requested;

for (const name of names) {
  if (!shots[name]) {
    throw new Error(`Unknown shot "${name}". Choose: ${Object.keys(shots).join(", ")}`);
  }
}

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: !headed,
});
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
});

try {
  for (const name of names) {
    const shot = shots[name];
    const page = await context.newPage();
    const finished = finishedAssets(page);
    const failed: string[] = [];
    page.on("requestfailed", (request) => {
      failed.push(`${request.url()} — ${request.failure()?.errorText ?? "failed"}`);
    });

    // Browser-side polling cannot see a Node Set. Mirror it into the page on
    // each completion so Playwright's wait is event-driven and inspectable.
    page.on("requestfinished", () => {
      void page.evaluate((urls) => {
        (window as Window & { __lanternFinished?: string[] }).__lanternFinished = urls;
      }, [...finished]).catch(() => undefined);
    });

    const url = new URL(shot.path, BASE).toString();
    console.log(`${name}: opening ${url}`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: TIMEOUT_MS });

    if (typeof shot.ready === "object") {
      try {
        await waitForAssets(page, finished, shot.ready);
      } catch (error) {
        const prefix = `/gifts/${shot.ready.gift}/`;
        console.error(
          `${name}: finished assets\n${[...finished]
            .filter((url) => url.includes(prefix))
            .map((url) => `  ${url}`)
            .join("\n") || "  none"}`,
        );
        if (failed.length) console.error(`${name}: failed requests\n  ${failed.join("\n  ")}`);
        throw error;
      }
      const renderer = await gpuName(page);
      if (/swiftshader|software/i.test(renderer)) {
        throw new Error(`${name}: refused software WebGL renderer ${renderer}`);
      }
      console.log(`${name}: ${renderer}`);
    } else if (shot.ready === "threshold") {
      await page.getByRole("button", { name: /step inside/i }).waitFor({
        timeout: TIMEOUT_MS,
      });
      await page.waitForTimeout(3_000);
    } else {
      await page.waitForLoadState("networkidle", { timeout: TIMEOUT_MS }).catch(() => undefined);
      await page.waitForTimeout(2_000);
    }

    const out = resolve(OUT, `${name}.png`);
    await page.screenshot({ path: out, clip: shot.clip });
    console.log(`${name}: wrote ${out}`);
    await page.close();
  }
} finally {
  await browser.close();
}
