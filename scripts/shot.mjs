/**
 * Screenshot a page of the running dev server with headless Chrome.
 *
 *   npm run shot                      -> the default world view
 *   npm run shot -- "/?debug=collider" collider.png
 *
 * Uses the installed Chrome rather than downloading a browser. WebGL runs on
 * SwiftShader, so splats and meshes render without a GPU - slower than a real
 * browser but enough to verify orientation, framing and occlusion without
 * asking a human to look at the screen.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const CHROME = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find(existsSync);

if (!CHROME) {
  console.error("No Chrome or Edge found. Install one, or point CHROME at a binary.");
  process.exit(1);
}

let path = process.argv[2] ?? "/";
// Git Bash rewrites any argument starting with "/" into a Windows path, so
// "/make" arrives as something like "C:/Program Files/Git/make".
if (/^[A-Za-z]:[\\/]/.test(path)) {
  // Say so. Falling back to "/" silently captures the wrong page, which then
  // reads as a bug in the app rather than in the shell - it cost one wrong
  // screenshot already.
  console.warn(
    `Git Bash rewrote the path argument into "${path}", so it fell back to "/".\n` +
      `Prefix the command with MSYS_NO_PATHCONV=1 to pass a route such as /make.`,
  );
  path = "/";
}
if (!path.startsWith("/")) path = `/${path}`;
const out = resolve(process.argv[3] ?? "shots/shot.png");
const base = process.env.LANTERN_BASE_URL ?? "http://localhost:3000";
const budget = process.env.SHOT_BUDGET_MS ?? "15000";
// SHOT_SIZE=390,844 checks the phone layout without a device.
const size = process.env.SHOT_SIZE ?? "1280,800";

mkdirSync(resolve(out, ".."), { recursive: true });

execFileSync(
  CHROME,
  [
    "--headless=new",
    "--disable-gpu",
    // Software WebGL. Without this the canvas comes back blank.
    "--enable-unsafe-swiftshader",
    "--hide-scrollbars",
    `--window-size=${size}`,
    // Lets the splat decode and first frames land before the capture.
    `--virtual-time-budget=${budget}`,
    `--screenshot=${out}`,
    `${base}${path}`,
  ],
  { stdio: ["ignore", "ignore", "pipe"] },
);

console.log(`${base}${path} -> ${out}`);
