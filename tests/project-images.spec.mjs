/**
 * Every project article must paint each image src as often as the data says —
 * no duplicate blocks, and process-folder images must not re-show body images.
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import {
  collectBlockImageSrcs,
  planArticleImageSrcs,
} from '../src/lib/project-blocks.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const projectsDir = join(root, 'src/content/projects');
const require = createRequire(import.meta.url);
const { parse: loadYaml } = require('yaml');

function folderSrcsOnDisk(slug) {
  const dir = join(projectsDir, slug, 'process');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => /\.(jpe?g|png|webp|avif)$/i.test(name))
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' }))
    .map((name) => `/src/content/projects/${slug}/process/${name}`);
}

function countBy(arr) {
  const m = new Map();
  for (const x of arr) m.set(x, (m.get(x) || 0) + 1);
  return m;
}

let failed = 0;
const slugs = readdirSync(projectsDir).filter((name) =>
  statSync(join(projectsDir, name)).isDirectory(),
);

for (const slug of slugs) {
  const yamlPath = join(projectsDir, slug, 'index.yaml');
  if (!existsSync(yamlPath)) continue;
  const data = loadYaml(readFileSync(yamlPath, 'utf8'));
  const blocks = data.blocks || [];
  const blockSrcs = collectBlockImageSrcs(blocks);
  const blockCounts = countBy(blockSrcs);
  const blockDups = [...blockCounts.entries()].filter(([, n]) => n > 1);
  if (blockDups.length) {
    console.error(`${slug}: duplicate image paths in blocks:`);
    for (const [src, n] of blockDups) console.error(`  ${n}× ${src}`);
    failed++;
  }

  const byHash = new Map();
  for (const src of new Set(blockSrcs)) {
    const file = join(root, src.replace(/^\//, ''));
    if (!existsSync(file)) continue;
    const hash = createHash('sha256').update(readFileSync(file)).digest('hex');
    if (!byHash.has(hash)) byHash.set(hash, []);
    byHash.get(hash).push(src);
  }
  for (const [hash, paths] of byHash) {
    if (paths.length > 1) {
      console.error(`${slug}: byte-identical block images (${hash.slice(0, 12)}):`);
      for (const p of paths) console.error(`  ${p}`);
      failed++;
    }
  }

  const folder = folderSrcsOnDisk(slug);
  const planned = planArticleImageSrcs(blocks, {
    processFromFolder: Boolean(data.processFromFolder),
    folderSrcs: folder,
  });
  const plannedCounts = countBy(planned);
  const plannedDups = [...plannedCounts.entries()].filter(([, n]) => n > 1);
  if (plannedDups.length) {
    console.error(`${slug}: planArticleImageSrcs would paint duplicates:`);
    for (const [src, n] of plannedDups) console.error(`  ${n}× ${src}`);
    failed++;
  }
}

{
  const data = loadYaml(readFileSync(join(projectsDir, 'atomic-campaigns', 'index.yaml'), 'utf8'));
  const planned = planArticleImageSrcs(data.blocks || [], {
    processFromFolder: Boolean(data.processFromFolder),
    folderSrcs: folderSrcsOnDisk('atomic-campaigns'),
  });
  const imageBlocks = (data.blocks || []).filter((b) => b.discriminant === 'image').length;
  if (planned.length !== imageBlocks) {
    console.error(
      `atomic-campaigns: expected ${imageBlocks} planned images, got ${planned.length}`,
    );
    failed++;
  }
  if (new Set(planned).size !== planned.length) {
    console.error('atomic-campaigns: planned image srcs are not unique');
    failed++;
  } else {
    console.log(`atomic-campaigns: ${planned.length} unique planned images OK`);
  }
}

if (failed) {
  console.error(`\n${failed} project-image check(s) failed`);
  process.exit(1);
}
console.log(`\nAll ${slugs.length} projects: image src plan matches data (no duplicates)`);
