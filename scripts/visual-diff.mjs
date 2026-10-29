import sharp from 'sharp';
import { readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const before = process.argv[2];
const after = process.argv[3];
const diffDir = process.argv[4];
if (!before || !after) {
  console.error('usage: node scripts/visual-diff.mjs <before-dir> <after-dir> [diff-dir]');
  process.exit(1);
}
if (diffDir) mkdirSync(diffDir, { recursive: true });

const names = readdirSync(before).filter((name) => name.endsWith('.png')).sort();
let failed = 0;
for (const name of names) {
  const A = await sharp(join(before, name)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const B = await sharp(join(after, name)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (A.info.width !== B.info.width || A.info.height !== B.info.height) {
    failed++;
    console.log(`${name} SIZE ${A.info.width}x${A.info.height} vs ${B.info.width}x${B.info.height}`);
    continue;
  }
  const { width, height, channels } = A.info;
  let diff = 0;
  const mask = diffDir ? Buffer.alloc(A.data.length) : null;
  for (let i = 0; i < A.data.length; i += channels) {
    const changed =
      A.data[i] !== B.data[i] ||
      A.data[i + 1] !== B.data[i + 1] ||
      A.data[i + 2] !== B.data[i + 2] ||
      A.data[i + 3] !== B.data[i + 3];
    if (!changed) continue;
    diff++;
    if (mask) {
      mask[i] = 255;
      mask[i + 1] = 0;
      mask[i + 2] = 0;
      mask[i + 3] = 255;
    }
  }
  const pixels = width * height;
  console.log(`${name} ${diff} / ${pixels} (${((100 * diff) / pixels).toFixed(4)}%)`);
  if (diff && mask && diffDir) {
    await sharp(mask, { raw: { width, height, channels } }).png().toFile(join(diffDir, name));
  }
  if (diff) failed++;
}
if (!names.length) {
  console.error('no pngs');
  process.exit(1);
}
process.exit(failed ? 1 : 0);
