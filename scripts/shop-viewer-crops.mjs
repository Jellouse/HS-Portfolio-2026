// Composes the shop gallery images from the vase masters.
//
//   node scripts/shop-viewer-crops.mjs <dir>
//
// <dir> holds one master per product, named <slug>.png (or .jpg/.webp):
// 660, 28, 120, 490. Use the 2x upscales in ~/Desktop/vases. At 2x every frame
// is downscaled from the master rather than upscaled, so nothing is invented.
//
// The masters are tight artboards. The gallery frames are wider than the art,
// so the art is scaled down and placed on a transparent frame: the vase sits at
// a set share of the frame width, centred, with its rim at a set share of the
// height. That is the composition in the layout references. Everything is in
// fractions, so a 2x export lands on exactly the same picture.
//
// Writes src/content/products/<slug>/viewer/{desktop,mobile}/src.webp at 2x and
// 3x of the frame, so the browser never has to scale them up. The frame is
// transparent, so the page background shows through around the vase.

import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CONTENT = join(ROOT, 'src/content/products');

const FRAMES = {
  desktop: { width: 2880, height: 1800 }, // 16:10 at 2x
  mobile: { width: 1170, height: 2085 }, // 390x695 at 3x
};

// source: the vase in the master, as fractions of the master.
//   centre  middle of the vase
//   vase    width of the vase
//   rim     top edge of the aluminium
//   topInk  the art is cut at the top edge, so never show white above it
// desktop / mobile: the same vase, as fractions of the frame, plus where its
// rim sits in the frame. Taken from the layout references.
const RECIPE = {
  '660': {
    source: { centre: 0.4834, vase: 0.4276, rim: 0.6848, topInk: true },
    desktop: { vase: 0.374, rim: 0.628 },
    mobile: { vase: 0.70, rim: 0.66 },
  },
  '28': {
    source: { centre: 0.5008, vase: 0.2058, rim: 0.5626, topInk: true },
    desktop: { vase: 0.117, rim: 0.638 },
    mobile: { vase: 0.297, rim: 0.578 },
  },
  '120': {
    source: { centre: 0.5003, vase: 0.8474, rim: 0.6713, topInk: true },
    desktop: { vase: 0.591, rim: 0.543 },
    mobile: { vase: 0.803, rim: 0.567 },
  },
  '490': {
    source: { centre: 0.5094, vase: 0.7125, rim: 0.6854, topInk: true },
    desktop: { vase: 0.649, rim: 0.78 },
    mobile: { vase: 0.83, rim: 0.64 },
  },
};

const source = process.argv[2];
if (!source || !existsSync(source)) {
  console.error('Usage: node scripts/shop-viewer-crops.mjs <dir with 660, 28, 120, 490>');
  process.exit(1);
}

const files = new Map();
for (const name of readdirSync(source)) {
  const ext = extname(name).toLowerCase();
  if (!['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) continue;
  const slug = basename(name, ext);
  if (RECIPE[slug]) files.set(slug, join(source, name));
}

let made = 0;
for (const [slug, file] of files) {
  const recipe = RECIPE[slug];
  const master = await sharp(file).metadata();
  const srcVase = master.width * recipe.source.vase;
  const srcCentre = master.width * recipe.source.centre;
  const srcRim = master.height * recipe.source.rim;

  for (const kind of ['desktop', 'mobile']) {
    const frame = FRAMES[kind];
    const target = recipe[kind];
    const scale = (target.vase * frame.width) / srcVase;

    const width = Math.round(master.width * scale);
    const height = Math.round(master.height * scale);
    const x = Math.round(frame.width / 2 - srcCentre * scale);
    let y = Math.round(target.rim * frame.height - srcRim * scale);
    if (recipe.source.topInk) y = Math.min(y, 0); // never show white above the art

    const left = Math.max(0, -x);
    const top = Math.max(0, -y);
    const cropW = Math.min(width - left, frame.width - Math.max(0, x));
    const cropH = Math.min(height - top, frame.height - Math.max(0, y));
    const art = await sharp(file)
      .resize(width, height, { kernel: 'lanczos3' })
      .extract({ left, top, width: cropW, height: cropH })
      .toBuffer();

    const placeX = Math.max(0, x);
    const placeY = Math.max(0, y);
    const gapBottom = Math.max(0, frame.height - (placeY + cropH));

    // The art can end above the bottom edge. The vases are straight extrusions,
    // so repeat the last row down instead of scaling the whole vase up. The top
    // is never padded: there the art is cut through the flowers, and a repeat
    // would show as a hard band.
    const placed = gapBottom
      ? await sharp(art).extend({ bottom: gapBottom, extendWith: 'copy' }).toBuffer()
      : art;
    const layers = [{ input: placed, left: placeX, top: placeY }];

    const out = join(CONTENT, slug, 'viewer', kind);
    mkdirSync(out, { recursive: true });
    await sharp({
      create: { width: frame.width, height: frame.height, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 0 } },
    })
      .composite(layers)
      .webp({ quality: 92, alphaQuality: 100, effort: 6 })
      .toFile(join(out, 'src.webp'));
    console.log(`${slug} ${kind} ${frame.width}x${frame.height}, art ${width}x${height} at ${x},${y}${gapBottom ? ` (pad ${gapBottom})` : ''}`);
    made += 1;
  }
}

if (!made) {
  console.error(`No master named ${Object.keys(RECIPE).join(', ')} in ${source}`);
  process.exit(1);
}
