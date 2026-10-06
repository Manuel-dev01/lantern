/** Assemble the captured GPU frames into the submission asset board. */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";

const DIR = resolve(process.env.CAPTURE_DIR ?? "shots/asset-board");
const OUT = resolve(DIR, "lantern-asset-board.png");
const WIDTH = 2400;
const HEIGHT = 4020;
const INK = "#f2eee8";
const MUTED = "#9e9a96";

type Layer = NonNullable<Parameters<ReturnType<typeof sharp>["composite"]>[0]>[number];
const layers: Layer[] = [];

function textSvg(
  width: number,
  height: number,
  lines: Array<{ text: string; y: number; size: number; fill?: string; spacing?: number }>,
) {
  const body = lines.map(({ text, y, size, fill = INK, spacing = 0 }) =>
    `<text x="0" y="${y}" fill="${fill}" font-family="Arial, Helvetica, sans-serif" ` +
    `font-size="${size}" letter-spacing="${spacing}">${text}</text>`,
  ).join("");
  return Buffer.from(`<svg width="${width}" height="${height}">${body}</svg>`);
}

async function frame(
  file: string,
  x: number,
  y: number,
  width: number,
  height: number,
  title: string,
  note: string,
) {
  const path = resolve(DIR, file);
  if (!existsSync(path)) throw new Error(`Missing capture ${path}`);

  const image = await sharp(path)
    .resize(width, height, { fit: "cover", position: "centre" })
    .png()
    .toBuffer();
  layers.push({ input: image, left: x, top: y + 54 });
  layers.push({
    input: textSvg(width, 48, [
      { text: title.toUpperCase(), y: 16, size: 17, spacing: 4 },
      { text: note, y: 42, size: 16, fill: MUTED },
    ]),
    left: x,
    top: y,
  });
}

layers.push({
  input: textSvg(WIDTH - 192, 220, [
    { text: "LANTERN", y: 44, size: 20, spacing: 8 },
    { text: "A place, built from a memory.", y: 118, size: 54 },
    {
      text: "Marble rooms · Tripo keepsakes · real-time gaussian splats",
      y: 168,
      size: 21,
      fill: MUTED,
      spacing: 1,
    },
  ]),
  left: 96,
  top: 68,
});

await frame(
  "arrival.png", 96, 290, 1480, 832,
  "Arrival — full resolution",
  "The Enugu sewing room, from its manifest camera",
);
await frame(
  "threshold.png", 1608, 290, 696, 832,
  "The threshold",
  "A gift opens as a place, not a loading screen",
);

await frame(
  "object-close.png", 96, 1228, 1080, 588,
  "Marble place, Tripo things",
  "Sharp keepsakes held against a softer remembered room",
);
await frame(
  "occlusion.png", 1208, 1228, 532, 299,
  "Occlusion",
  "Objects meet the captured table",
);
await frame(
  "occlusion-collider.png", 1772, 1228, 532, 299,
  "The same frame, revealed",
  "Marble's collider writes the hidden depth mesh",
);

await frame(
  "lod-100k.png", 96, 1908, 1088, 612,
  "100k preview",
  "The room appears quickly while detail continues underneath",
);
await frame(
  "lod-full.png", 1216, 1908, 1088, 612,
  "Full resolution",
  "The identical pinned camera after the final rung arrives",
);

await frame(
  "constellation.png", 96, 2630, 2208, 1242,
  "The constellation",
  "Every room was made for somebody by name",
);

await sharp({
  create: {
    width: WIDTH,
    height: HEIGHT,
    channels: 4,
    background: "#05060a",
  },
})
  .composite(layers)
  .png({ compressionLevel: 9 })
  .toFile(OUT);

console.log(OUT);
