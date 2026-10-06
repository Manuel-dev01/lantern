/**
 * Render Lantern's motion-designed launch film from verified product captures.
 *
 *   npm run video:launch -- preview
 *   npm run video:launch -- 90
 *
 * The large presentation cursor is reconstructed editorially. Product states
 * inside the browser frame are real captures from the live application.
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import ffmpegPath from "ffmpeg-static";
import sharp, { type OverlayOptions } from "sharp";

if (!ffmpegPath) throw new Error("ffmpeg-static is unavailable.");

const ROOT = resolve("shots/demo");
const CARD_DIR = resolve(ROOT, "cards");
const SEGMENT_DIR = resolve(ROOT, "segments");
mkdirSync(CARD_DIR, { recursive: true });
mkdirSync(SEGMENT_DIR, { recursive: true });

const W = 1920;
const H = 1080;
const FPS = 60;

type Scene = {
  name: string;
  source?: string;
  title: string;
  subtitle?: string;
  label?: string;
  url?: string;
  duration: number;
  cursor?: [number, number, number, number];
  focus?: [number, number];
};

const asset = (name: string) => resolve("shots/asset-board", name);
const sweep = (name: string) => resolve("shots/sweep", name);

const launch90: Scene[] = [
  { name: "title", title: "Build someone the place they remember.", subtitle: "LANTERN", duration: 4 },
  { name: "threshold", source: asset("threshold.png"), title: "A gift begins with their name.", label: "LIVE PRODUCT · EXISTING GIFT", url: "/g/1KAJZTJBK1", duration: 7, cursor: [1510, 880, 960, 710], focus: [960, 560] },
  { name: "arrival", source: asset("arrival.png"), title: "Then it becomes somewhere you can enter.", label: "MARBLE · FULL RESOLUTION", url: "/g/Z1MV55219C", duration: 7, cursor: [960, 850, 1040, 620], focus: [980, 610] },
  { name: "landing", source: sweep("landing-desktop.png"), title: "Start with one remembered place.", label: "LIVE PRODUCT", url: "/", duration: 7, cursor: [1510, 890, 220, 850], focus: [300, 690] },
  { name: "make-one", source: sweep("make-desktop.png"), title: "Who was it for?", label: "REAL CREATION FLOW", url: "/make", duration: 6, cursor: [420, 820, 760, 515], focus: [730, 520] },
  { name: "make-three", source: sweep("make-step3-desktop.png"), title: "A link is built to send them.", label: "NO TRANSACTION FABRICATED", url: "/make · step 3 of 3", duration: 6, cursor: [970, 810, 650, 585], focus: [650, 580] },
  { name: "becomes", title: "The memory becomes a place.", subtitle: "WORLD LABS × TRIPO", duration: 6 },
  { name: "preview", source: asset("lod-100k.png"), title: "Open quickly. Keep enhancing underneath.", label: "100K STREAMING PREVIEW", url: "/g/Z1MV55219C?lod=100k", duration: 8, cursor: [1550, 840, 1060, 630], focus: [970, 570] },
  { name: "full", source: asset("lod-full.png"), title: "The same camera. The complete room.", label: "FULL-RESOLUTION SPLAT", url: "/g/Z1MV55219C?lod=full_res", duration: 8, cursor: [1060, 630, 1210, 540], focus: [980, 520] },
  { name: "objects", source: asset("object-close.png"), title: "Marble remembers the place. Tripo rebuilds the things.", label: "VERIFIED LIVE COMPOSITE", url: "/g/Z1MV55219C", duration: 7, cursor: [1580, 780, 980, 650], focus: [1080, 610] },
  { name: "occlusion", source: asset("occlusion.png"), title: "One depth system lets both share the room.", label: "OCCLUSION · NORMAL VIEW", url: "/g/1KAJZTJBK1", duration: 5, cursor: [1500, 830, 960, 500], focus: [1020, 520] },
  { name: "collider", source: asset("occlusion-collider.png"), title: "The hidden collider is the proof.", label: "EDITORIAL EVIDENCE · COLLIDER DEBUG", url: "/g/1KAJZTJBK1?debug=collider", duration: 4, cursor: [960, 760, 1120, 510], focus: [1000, 520] },
  { name: "constellation", source: asset("constellation.png"), title: "Every room was made for somebody by name.", label: "LIVE CONSTELLATION", url: "/constellation", duration: 7, cursor: [1640, 880, 1040, 760], focus: [1050, 740] },
  { name: "end", title: "Not a generated image. A place they can walk through.", subtitle: "LANTERN", duration: 8 },
];

const preview18: Scene[] = [
  { name: "preview-title", title: "Build someone the place they remember.", subtitle: "LANTERN", duration: 4 },
  { name: "preview-threshold", source: asset("threshold.png"), title: "A gift begins with their name.", label: "LIVE PRODUCT", url: "/g/1KAJZTJBK1", duration: 5, cursor: [1500, 860, 960, 710], focus: [960, 560] },
  { name: "preview-arrival", source: asset("arrival.png"), title: "Then it becomes somewhere you can enter.", label: "MARBLE × TRIPO", url: "/g/Z1MV55219C", duration: 6, cursor: [960, 840, 1080, 620], focus: [980, 610] },
  { name: "preview-end", title: "A place, built from a memory.", subtitle: "LANTERN", duration: 3 },
];

const demo300: Scene[] = [
  { name: "demo-title", title: "What if a memory became somewhere you could enter?", subtitle: "LANTERN · PRODUCT DEMO", duration: 8 },
  { name: "demo-threshold-one", source: asset("threshold.png"), title: "A gift begins at the threshold.", label: "LIVE PRODUCT · EXISTING GIFT", url: "/g/1KAJZTJBK1", duration: 14, cursor: [1540, 850, 980, 715] },
  { name: "demo-arrival-one", source: asset("arrival.png"), title: "Then it opens into a walkable room.", label: "FULL-RESOLUTION WORLD", url: "/g/Z1MV55219C", duration: 15, cursor: [1020, 850, 1180, 620] },
  { name: "demo-recipient", title: "One link. One name. A place made for them.", subtitle: "THE RECIPIENT EXPERIENCE", duration: 10 },
  { name: "demo-landing", source: sweep("landing-desktop.png"), title: "Start with one remembered place.", label: "LIVE LANDING PAGE", url: "/", duration: 15, cursor: [1500, 875, 230, 840] },
  { name: "demo-make-one", source: sweep("make-desktop.png"), title: "First, name the person.", label: "REAL CREATION FLOW · STEP 1", url: "/make", duration: 16, cursor: [420, 820, 770, 510] },
  { name: "demo-make-three", source: sweep("make-step3-desktop.png"), title: "Then make the gift ready to send.", label: "REAL CREATION FLOW · STEP 3", url: "/make", duration: 16, cursor: [980, 810, 655, 585] },
  { name: "demo-pipeline", title: "World Labs remembers the place. Tripo rebuilds the things.", subtitle: "THE PIPELINE", duration: 10 },
  { name: "demo-preview", source: asset("lod-100k.png"), title: "Open quickly with a lighter preview.", label: "100K GAUSSIAN PREVIEW", url: "/g/Z1MV55219C?lod=100k", duration: 15, cursor: [1530, 830, 1080, 650] },
  { name: "demo-full", source: asset("lod-full.png"), title: "Keep enhancing underneath.", label: "FULL-RESOLUTION SWAP", url: "/g/Z1MV55219C?lod=full_res", duration: 15, cursor: [1080, 650, 1220, 540] },
  { name: "demo-progressive", title: "More detail. The same camera. No restart.", subtitle: "PROGRESSIVE SPATIAL LOADING", duration: 10 },
  { name: "demo-objects", source: asset("object-close.png"), title: "Independent objects stay inspectable.", label: "VERIFIED LIVE COMPOSITE", url: "/g/Z1MV55219C", duration: 16, cursor: [1570, 790, 1010, 645] },
  { name: "demo-occlusion", source: asset("occlusion.png"), title: "Depth lets both systems share one room.", label: "OCCLUSION · NORMAL VIEW", url: "/g/1KAJZTJBK1", duration: 15, cursor: [1490, 835, 950, 500] },
  { name: "demo-collider", source: asset("occlusion-collider.png"), title: "The hidden collider is the evidence.", label: "EDITORIAL EVIDENCE · DEBUG VIEW", url: "/g/1KAJZTJBK1?debug=collider", duration: 12, cursor: [950, 770, 1130, 510] },
  { name: "demo-grounded", title: "Supported objects. Grounded cameras. Walkable space.", subtitle: "PLACEMENT + COLLISION", duration: 10 },
  { name: "demo-arrival-two", source: asset("arrival.png"), title: "The viewer arrives inside the capture.", label: "VERIFIED LIVE WORLD", url: "/g/Z1MV55219C", duration: 18, cursor: [960, 840, 1060, 610] },
  { name: "demo-kitchen", source: asset("occlusion.png"), title: "A different memory, using the same system.", label: "EXISTING GIFT", url: "/g/1KAJZTJBK1", duration: 16, cursor: [1460, 820, 1020, 570] },
  { name: "demo-sharing", title: "The sender shares a gift—not an asset folder.", subtitle: "ONE LINK", duration: 10 },
  { name: "demo-threshold-two", source: asset("threshold.png"), title: "The recipient decides when to enter.", label: "RECIPIENT-FIRST REVEAL", url: "/g/1KAJZTJBK1", duration: 15, cursor: [1470, 840, 970, 710] },
  { name: "demo-constellation", source: asset("constellation.png"), title: "Every room was made for somebody by name.", label: "LIVE CONSTELLATION", url: "/constellation", duration: 18, cursor: [1630, 880, 1060, 750] },
  { name: "demo-evidence", title: "Real product states. Labelled evidence. No fabricated outcomes.", subtitle: "DEMO INTEGRITY", duration: 10 },
  { name: "demo-end", title: "Not a generated image. A place they can walk through.", subtitle: "LANTERN", duration: 16 },
];

function esc(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function bgSvg() {
  return Buffer.from(`<svg width="${W}" height="${H}">
    <defs>
      <radialGradient id="g" cx="72%" cy="30%" r="90%">
        <stop offset="0" stop-color="#342319"/>
        <stop offset="0.42" stop-color="#111014"/>
        <stop offset="1" stop-color="#05060a"/>
      </radialGradient>
      <filter id="noise"><feTurbulence baseFrequency="0.9" numOctaves="2" seed="8"/><feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 .035 0"/></filter>
    </defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <rect width="100%" height="100%" filter="url(#noise)" opacity=".5"/>
  </svg>`);
}

function copySvg(scene: Scene, browser = false) {
  const x = browser ? 152 : 190;
  const y = browser ? 940 : 445;
  const width = browser ? 1616 : 1540;
  const titleSize = browser ? 34 : scene.title.length > 64 ? 48 : scene.title.length > 48 ? 56 : 72;
  return Buffer.from(`<svg width="${W}" height="${H}">
    <style>
      .sans{font-family:Arial,Helvetica,sans-serif}.serif{font-family:Georgia,serif}
    </style>
    ${scene.subtitle ? `<text x="${x}" y="${y - 110}" class="sans" fill="#d9c3a6" font-size="18" letter-spacing="7">${esc(scene.subtitle)}</text>` : ""}
    <text x="${x}" y="${y}" class="serif" fill="#f5f1ec" font-size="${titleSize}">${esc(scene.title)}</text>
    ${browser ? `<text x="${x}" y="988" class="sans" fill="#9d9995" font-size="16">Presentation cursor reconstructed · product state captured live</text>` : ""}
  </svg>`);
}

async function roundedWindow(scene: Scene) {
  const source = scene.source!;
  if (!existsSync(source)) throw new Error(`Missing source ${source}`);
  const ww = 1680;
  const wh = 850;
  const top = 46;
  const viewport = await sharp(source)
    .resize(ww, wh - top, { fit: "cover", position: "centre" })
    .png()
    .toBuffer();
  const chrome = Buffer.from(`<svg width="${ww}" height="${wh}">
    <rect width="${ww}" height="${top}" fill="#101114"/>
    <circle cx="25" cy="23" r="5" fill="#8c6157"/><circle cx="45" cy="23" r="5" fill="#88745a"/><circle cx="65" cy="23" r="5" fill="#586f61"/>
    <rect x="112" y="11" width="1180" height="24" rx="12" fill="#1b1c20"/>
    <text x="132" y="28" font-family="Arial" font-size="12" fill="#8f9096">lantern-manuel-dev01s-projects.vercel.app${esc(scene.url ?? "")}</text>
    <rect x="1390" y="11" width="255" height="24" rx="12" fill="#17181c"/>
    <text x="1518" y="27" text-anchor="middle" font-family="Arial" font-size="11" letter-spacing="2" fill="#d9c3a6">${esc(scene.label ?? "LIVE PRODUCT")}</text>
  </svg>`);
  const mask = Buffer.from(`<svg width="${ww}" height="${wh}"><rect width="${ww}" height="${wh}" rx="25" fill="white"/></svg>`);
  return sharp({ create: { width: ww, height: wh, channels: 4, background: "#101114" } })
    .composite([
      { input: viewport, left: 0, top },
      { input: chrome, left: 0, top: 0 },
      { input: mask, blend: "dest-in" },
    ])
    .png()
    .toBuffer();
}

async function renderCard(scene: Scene) {
  const out = resolve(CARD_DIR, `${scene.name}.png`);
  const layers: OverlayOptions[] = [{ input: bgSvg(), left: 0, top: 0 }];
  if (scene.source) {
    const window = await roundedWindow(scene);
    const shadow = await sharp({ create: { width: 1708, height: 878, channels: 4, background: "rgba(0,0,0,.62)" } })
      .blur(20).png().toBuffer();
    layers.push({ input: shadow, left: 106, top: 42 });
    layers.push({ input: window, left: 120, top: 56 });
  }
  layers.push({ input: copySvg(scene, Boolean(scene.source)), left: 0, top: 0 });
  await sharp({ create: { width: W, height: H, channels: 4, background: "#05060a" } })
    .composite(layers).png().toFile(out);
  return out;
}

async function cursorPng() {
  const out = resolve(CARD_DIR, "cursor.png");
  const svg = Buffer.from(`<svg width="72" height="86" viewBox="0 0 72 86">
    <path d="M8 5 L61 49 L37 52 L51 78 L38 84 L24 57 L8 74 Z" fill="#f4ede4" stroke="#121318" stroke-width="5" stroke-linejoin="round"/>
    <circle cx="10" cy="7" r="6" fill="#d8b58d" opacity=".9"/>
  </svg>`);
  await sharp(svg).png().toFile(out);
  return out;
}

async function run(args: string[]) {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(ffmpegPath!, args, { stdio: ["ignore", "inherit", "inherit"] });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolvePromise() : reject(new Error(`ffmpeg exited ${code}`)));
  });
}

async function renderSegment(scene: Scene, cursor: string, stable = false) {
  const card = await renderCard(scene);
  const out = resolve(SEGMENT_DIR, `${scene.name}.mp4`);
  const frames = Math.round(scene.duration * FPS);
  const [fx, fy] = scene.focus ?? [W / 2, H / 2];
  const fadeOut = Math.max(scene.duration - 0.22, 0);
  const zoom = stable ? "null" : `zoompan=z='min(zoom+${(0.035 / frames).toFixed(8)},1.035)'` +
    `:x='(iw-iw/zoom)*${fx / W}':y='(ih-ih/zoom)*${fy / H}'` +
    `:d=${frames}:s=${W}x${H}:fps=${FPS}`;

  if (!scene.cursor) {
    await run(["-y", "-loop", "1", "-i", card, "-vf", `${zoom},fade=t=in:st=0:d=0.22,fade=t=out:st=${fadeOut}:d=0.22,format=yuv420p`, "-frames:v", String(frames), "-r", String(FPS), "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", out]);
    return out;
  }

  const [x0, y0, x1, y1] = scene.cursor;
  const x = `${x0}+(${x1 - x0})*t/${scene.duration}`;
  const y = `${y0}+(${y1 - y0})*t/${scene.duration}`;
  await run(["-y", "-loop", "1", "-i", card, "-loop", "1", "-i", cursor,
    "-filter_complex", `[0:v]${zoom}[bg];[bg][1:v]overlay=x='${x}':y='${y}':shortest=1,fade=t=in:st=0:d=0.22,fade=t=out:st=${fadeOut}:d=0.22,format=yuv420p[v]`,
    "-map", "[v]", "-frames:v", String(frames), "-r", String(FPS), "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", out]);
  return out;
}

function wavBuffer(duration: number, transitions: number[]) {
  const rate = 48_000;
  const samples = Math.round(duration * rate);
  const pcm = Buffer.alloc(samples * 4);
  const clickSamples = Math.round(0.075 * rate);
  for (let i = 0; i < samples; i++) {
    const t = i / rate;
    const breathe = 0.55 + 0.45 * Math.sin((2 * Math.PI * t) / 16);
    let v = breathe * (0.028 * Math.sin(2 * Math.PI * 110 * t) + 0.018 * Math.sin(2 * Math.PI * 164.81 * t) + 0.012 * Math.sin(2 * Math.PI * 220 * t));
    for (const at of transitions) {
      const d = i - Math.round(at * rate);
      if (d >= 0 && d < clickSamples) {
        const env = Math.exp(-d / (rate * 0.018));
        v += env * 0.16 * (Math.sin(2 * Math.PI * 920 * d / rate) + 0.45 * Math.sin(2 * Math.PI * 1480 * d / rate));
      }
    }
    const s = Math.max(-1, Math.min(1, v));
    pcm.writeInt16LE(Math.round(s * 32767), i * 4);
    pcm.writeInt16LE(Math.round(s * 32767), i * 4 + 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0); header.writeUInt32LE(36 + pcm.length, 4); header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(2, 22);
  header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * 4, 28); header.writeUInt16LE(4, 32); header.writeUInt16LE(16, 34);
  header.write("data", 36); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

async function render(scenes: Scene[], name: string, options: { stable?: boolean; narration?: string } = {}) {
  const cursor = await cursorPng();
  const segments: string[] = [];
  for (const scene of scenes) {
    console.log(`rendering ${scene.name}`);
    segments.push(await renderSegment(scene, cursor, options.stable));
  }
  const concat = resolve(ROOT, `${name}-concat.txt`);
  await writeFile(concat, segments.map((path) => `file '${path.replaceAll("'", "'\\''")}'`).join("\n"));
  const silent = resolve(ROOT, `${name}-silent.mp4`);
  await run(["-y", "-f", "concat", "-safe", "0", "-i", concat, "-c", "copy", silent]);
  const duration = scenes.reduce((sum, scene) => sum + scene.duration, 0);
  let elapsed = 0;
  const transitions = scenes.slice(0, -1).map((scene) => elapsed += scene.duration);
  const audio = resolve(ROOT, `${name}-soundbed.wav`);
  await writeFile(audio, wavBuffer(duration, transitions));
  const out = resolve(ROOT, `${name}.mp4`);
  if (options.narration) {
    await run(["-y", "-i", silent, "-i", audio, "-i", options.narration,
      "-filter_complex", "[1:a]volume=0.16[bed];[2:a]adelay=4000|4000,volume=1.0[voice];[bed][voice]amix=inputs=2:duration=longest:normalize=0,alimiter=limit=0.95[a]",
      "-map", "0:v:0", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-t", String(duration), "-movflags", "+faststart", out]);
  } else {
    await run(["-y", "-i", silent, "-i", audio, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-t", String(duration), "-movflags", "+faststart", out]);
  }
  console.log(out);
  return out;
}

const mode = process.argv[2] ?? "preview";
if (mode === "preview") await render(preview18, "lantern-launch-preview-v1-18s");
else if (mode === "90") await render(launch90, "lantern-launch-v1-90s");
else if (mode === "300") await render(demo300, "lantern-product-demo-v1-5min", {
  stable: true,
  narration: resolve(ROOT, "lantern-5min-narration-ezinne-v1.mp3"),
});
else throw new Error("usage: render-launch-video.mts preview|90|300");
