// Cuts the generated mascot art into the files the site serves.
//
//   bun run mascots
//
// Sources: the full-size images in refs/cute/raw (git-ignored, ~100 MB). Results (committed):
//   public/mascots/<role>-<pose>-{320,640}.webp    the four roles in five poses, cut out of their sheets
//   public/mascots/moko-<pose>-{320,640}.webp      Moko in four poses
//   public/mascots/moko-bust-*-{320,640}.webp      Moko's portrait cards (cut at the bottom edge)
//   public/scenes/<scene>-<width>.webp             stream, facecam and banner art
//   public/brand/logo-<size>.png                   the Moko logo mark
//   src/app/icon.png, src/app/apple-icon.png       the app icon
//   src/lib/domain/mascots.ts                      every image's size, so a page reserves its space
//
// The pose sheets are drawn on a green screen: alpha comes from how much green beats red and blue,
// and green spill is taken out of the colours. Poses are found by column coverage, left to right.
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const RAW = join(root, "refs/cute/raw");
const OUT = {
  mascots: join(root, "public/mascots"),
  scenes: join(root, "public/scenes"),
  brand: join(root, "public/brand"),
  app: join(root, "src/app"),
  manifest: join(root, "src/lib/domain/mascots.ts"),
};

const ROLE_POSES = ["idle", "cheer", "wave", "peek", "oops"];
const MOKO_POSES = ["hello", "love", "wow", "party"];
// Moko's portrait cards, drawn on a flat violet instead of a green screen
const MOKO_BUSTS = [
  ["moko-a.jpg", "moko-bust"],
  ["moko-a-happy.jpg", "moko-bust-happy"],
  ["moko-a-love.jpg", "moko-bust-love"],
  ["moko-a-wow.jpg", "moko-bust-wow"],
  ["moko-a-sleepy.jpg", "moko-bust-sleepy"],
];
const MASCOT_HEIGHTS = [320, 640];
const SCENES = [
  { name: "stream", file: "a3-mockup-stream.jpg", widths: [960, 1920] },
  { name: "facecam", file: "moko-a4.jpg", widths: [480, 960] },
  { name: "banner", file: "a-6.jpg", widths: [1200, 2400] },
];
const LOGO_SIZES = [64, 128, 512];

// ---- keying and slicing --------------------------------------------------------------------------

async function load(file) {
  const path = join(RAW, file);
  if (!existsSync(path)) throw new Error(`missing source ${path} (the raw art lives in refs/cute/raw)`);
  const { data, info } = await sharp(path).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, W: info.width, H: info.height };
}

/** Green screen to RGBA: alpha from green dominance (18..70), green spill clamped. */
function keyGreen({ data, W, H }) {
  const out = Buffer.alloc(W * H * 4);
  for (let i = 0, j = 0; i < W * H; i++, j += 3) {
    const r = data[j];
    const b = data[j + 2];
    let g = data[j + 1];
    const dom = g - Math.max(r, b);
    const a = dom >= 70 ? 0 : dom <= 18 ? 255 : Math.round((255 * (70 - dom)) / 52);
    if (dom > 0) g = Math.max(r, b);
    // the generator also tints pale areas (the Bard, the Judge's hair) with green bounce light: on
    // low-saturation colours only, drop most of the green above the red/blue average (gold, Moko's
    // red and the Seer's violet are saturated, so they keep their colour)
    if (Math.max(r, g, b) - Math.min(r, g, b) < 64) {
      const avg = (r + b) / 2;
      if (g > avg) g = Math.round(avg + (g - avg) * 0.25);
    }
    out[i * 4] = r;
    out[i * 4 + 1] = g;
    out[i * 4 + 2] = b;
    out[i * 4 + 3] = a;
  }
  return out;
}

/**
 * Flat background to RGBA: alpha from the colour distance to the background (sampled in the top-left
 * corner), and the background taken back out of the half-transparent edge pixels so no violet halo
 * is left around the character.
 */
function keyFlat({ data, W, H }) {
  let sr = 0;
  let sg = 0;
  let sb = 0;
  let n = 0;
  for (let y = 8; y < 72; y++) {
    for (let x = 8; x < 72; x++) {
      const j = (y * W + x) * 3;
      sr += data[j];
      sg += data[j + 1];
      sb += data[j + 2];
      n++;
    }
  }
  const bg = [sr / n, sg / n, sb / n];
  const out = Buffer.alloc(W * H * 4);
  const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
  for (let i = 0, j = 0; i < W * H; i++, j += 3) {
    let r = data[j];
    let g = data[j + 1];
    let b = data[j + 2];
    const d = Math.hypot(r - bg[0], g - bg[1], b - bg[2]);
    const a = d <= 30 ? 0 : d >= 72 ? 255 : Math.round((255 * (d - 30)) / 42);
    if (a > 0 && a < 255) {
      const k = a / 255;
      r = clamp((r - (1 - k) * bg[0]) / k);
      g = clamp((g - (1 - k) * bg[1]) / k);
      b = clamp((b - (1 - k) * bg[2]) / k);
    }
    out[i * 4] = r;
    out[i * 4 + 1] = g;
    out[i * 4 + 2] = b;
    out[i * 4 + 3] = a;
  }
  return out;
}

const solid = (rgba, W, x, y) => rgba[(y * W + x) * 4 + 3] > 128;

/** Runs of columns (or rows) with at least `minCov` solid pixels; runs closer than `gap` are merged. */
function runs(cov, minCov, gap) {
  const found = [];
  let start = -1;
  for (let i = 0; i <= cov.length; i++) {
    const on = i < cov.length && cov[i] >= minCov;
    if (on && start < 0) start = i;
    if (!on && start >= 0) {
      found.push([start, i - 1]);
      start = -1;
    }
  }
  const merged = [];
  for (const r of found) {
    const last = merged.at(-1);
    if (last && r[0] - last[1] <= gap) last[1] = r[1];
    else merged.push([...r]);
  }
  return merged;
}

/** Folds the narrowest run into its nearest neighbour (sparkles, hearts, confetti) until `n` remain. */
function foldTo(rs, n) {
  while (rs.length > n) {
    let k = 0;
    for (let i = 1; i < rs.length; i++) if (rs[i][1] - rs[i][0] < rs[k][1] - rs[k][0]) k = i;
    const left = k > 0 ? rs[k][0] - rs[k - 1][1] : Infinity;
    const right = k < rs.length - 1 ? rs[k + 1][0] - rs[k][1] : Infinity;
    const into = left <= right ? k - 1 : k + 1;
    rs[into] = [Math.min(rs[into][0], rs[k][0]), Math.max(rs[into][1], rs[k][1])];
    rs.splice(k, 1);
  }
  return rs;
}

function columnCoverage(rgba, W, H) {
  const cov = new Array(W).fill(0);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (solid(rgba, W, x, y)) cov[x]++;
  return cov;
}

/** The solid pixels' bounding box inside columns x0..x1 (rows with fewer than 3 solid pixels are noise). */
function rowsOf(rgba, W, H, x0, x1) {
  let y0 = H;
  let y1 = -1;
  for (let y = 0; y < H; y++) {
    let c = 0;
    for (let x = x0; x <= x1; x++) if (solid(rgba, W, x, y)) c++;
    if (c >= 3) {
      if (y < y0) y0 = y;
      y1 = y;
    }
  }
  return [y0, y1];
}

function crop(rgba, W, x0, y0, x1, y1) {
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const buf = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) rgba.copy(buf, y * w * 4, ((y0 + y) * W + x0) * 4, ((y0 + y) * W + x1 + 1) * 4);
  return { buf, w, h };
}

const rgbaImage = ({ buf, w, h }) => sharp(buf, { raw: { width: w, height: h, channels: 4 } });

/** Cuts a sheet of poses laid out left to right into one transparent image per pose. */
async function cutSheet(file, names, gap) {
  const img = await load(file);
  const { W, H } = img;
  const rgba = keyGreen(img);
  const cols = foldTo(runs(columnCoverage(rgba, W, H), 3, gap), names.length);
  if (cols.length !== names.length) throw new Error(`${file}: found ${cols.length} poses, expected ${names.length}`);
  const pad = 16;
  return cols.map(([x0, x1], i) => {
    const [y0, y1] = rowsOf(rgba, W, H, x0, x1);
    const box = crop(rgba, W, Math.max(0, x0 - pad), Math.max(0, y0 - pad), Math.min(W - 1, x1 + pad), Math.min(H - 1, y1 + pad));
    return { name: names[i], box };
  });
}

/** A portrait card: the whole character, trimmed, keeping the edge it is cut off at. */
async function cutCard(file) {
  const img = await load(file);
  const { W, H } = img;
  const rgba = keyFlat(img);
  const cols = runs(columnCoverage(rgba, W, H), 3, W);
  const [x0, x1] = [cols[0][0], cols.at(-1)[1]];
  const [y0, y1] = rowsOf(rgba, W, H, x0, x1);
  const pad = 12;
  // the character runs off the bottom (and sometimes the side) of the card: keep that edge flush
  return crop(rgba, W, Math.max(0, x0 - pad), Math.max(0, y0 - pad), x1 >= W - 3 ? W - 1 : Math.min(W - 1, x1 + pad), y1 >= H - 3 ? H - 1 : Math.min(H - 1, y1 + pad));
}

// ---- writers -------------------------------------------------------------------------------------

const manifest = { mascots: {}, scenes: {} };

async function writeMascot(name, box) {
  let size = null;
  for (const height of MASCOT_HEIGHTS) {
    const info = await rgbaImage(box)
      .resize({ height, kernel: "lanczos3" })
      .webp({ quality: 82, alphaQuality: 90, effort: 6 })
      .toFile(join(OUT.mascots, `${name}-${height}.webp`));
    size = { width: info.width, height: info.height };
  }
  manifest.mascots[name] = size; // the largest one
}

async function writeScene({ name, file, widths }) {
  const path = join(RAW, file);
  if (!existsSync(path)) throw new Error(`missing source ${path}`);
  let size = null;
  for (const width of widths) {
    const info = await sharp(path).resize({ width }).webp({ quality: 80, effort: 6 }).toFile(join(OUT.scenes, `${name}-${width}.webp`));
    size = { width: info.width, height: info.height };
  }
  manifest.scenes[name] = { ...size, widths };
}

/** The logo mark: keyed off its green background, trimmed and centred on a transparent square. */
async function writeLogo() {
  const img = await load("logo.jpg");
  const { W, H } = img;
  const rgba = keyGreen(img);
  const cols = runs(columnCoverage(rgba, W, H), 3, W);
  const [x0, x1] = [cols[0][0], cols.at(-1)[1]];
  const [y0, y1] = rowsOf(rgba, W, H, x0, x1);
  const box = crop(rgba, W, x0, y0, x1, y1);
  const side = Math.max(box.w, box.h);
  const square = await rgbaImage(box)
    .extend({
      top: Math.floor((side - box.h) / 2),
      bottom: Math.ceil((side - box.h) / 2),
      left: Math.floor((side - box.w) / 2),
      right: Math.ceil((side - box.w) / 2),
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  for (const s of LOGO_SIZES) {
    await sharp(square).resize(s, s, { kernel: "lanczos3" }).png({ palette: true, quality: 95, compressionLevel: 9 }).toFile(join(OUT.brand, `logo-${s}.png`));
  }
}

async function writeAppIcons() {
  const path = join(RAW, "app icon.jpg");
  if (!existsSync(path)) throw new Error(`missing source ${path}`);
  // flat colours, so a palette keeps them exact at a fraction of the size
  await sharp(path).resize(256, 256).png({ palette: true, quality: 95, compressionLevel: 9 }).toFile(join(OUT.app, "icon.png"));
  await sharp(path).resize(180, 180).png({ palette: true, quality: 95, compressionLevel: 9 }).toFile(join(OUT.app, "apple-icon.png"));
  rmSync(join(OUT.app, "icon.svg"), { force: true }); // the old placeholder, replaced by icon.png
}

function writeManifest() {
  const lines = (obj, fmt) => Object.entries(obj).map(([k, v]) => `  ${JSON.stringify(k)}: ${fmt(v)},`).join("\n");
  const ts = `/**
 * Generated by \`bun run mascots\` (scripts/mascots.mjs). Do not edit by hand.
 *
 * The size of every mascot and scene image, so a page can reserve the space before the image loads.
 * Mascots come in ${MASCOT_HEIGHTS.join(" and ")} px tall versions (\`/mascots/<name>-<height>.webp\`); the
 * size given is the ${MASCOT_HEIGHTS.at(-1)} px one. Scenes come in the listed widths
 * (\`/scenes/<name>-<width>.webp\`); the size given is the widest.
 */

export const MASCOT_HEIGHTS = [${MASCOT_HEIGHTS.join(", ")}] as const;

export const MASCOTS = {
${lines(manifest.mascots, (v) => `{ width: ${v.width}, height: ${v.height} }`)}
} as const;

export type MascotName = keyof typeof MASCOTS;

export const SCENES = {
${lines(manifest.scenes, (v) => `{ width: ${v.width}, height: ${v.height}, widths: [${v.widths.join(", ")}] }`)}
} as const;

export type SceneName = keyof typeof SCENES;

export const LOGO_SIZES = [${LOGO_SIZES.join(", ")}] as const;
`;
  writeFileSync(OUT.manifest, ts);
}

// ---- run -----------------------------------------------------------------------------------------

for (const dir of [OUT.mascots, OUT.scenes, OUT.brand]) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
}

for (const role of ["knight", "seer", "judge", "bard"]) {
  for (const { name, box } of await cutSheet(`${role}-a1.jpg`, ROLE_POSES, 40)) await writeMascot(`${role}-${name}`, box);
  console.log(`cut ${role}`);
}
for (const { name, box } of await cutSheet("a2-moko-reactions.jpg", MOKO_POSES, 30)) await writeMascot(`moko-${name}`, box);
for (const [file, name] of MOKO_BUSTS) await writeMascot(name, await cutCard(file));
console.log("cut moko");
for (const scene of SCENES) await writeScene(scene);
console.log("wrote scenes");
await writeLogo();
await writeAppIcons();
console.log("wrote logo and app icons");
writeManifest();
console.log(`wrote ${OUT.manifest}`);
