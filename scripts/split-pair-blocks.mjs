/**
 * One-time / optional: turn Image pair blocks into two normal image blocks.
 * Keeps file paths as-is (left.jpg / right.jpg stay where they are).
 *
 *   node scripts/split-pair-blocks.mjs analogue-af1
 *   node scripts/split-pair-blocks.mjs --all
 *   node scripts/split-pair-blocks.mjs --all --only-stacked
 *
 * --only-stacked: only pairs with layout: stack
 * Dry-run by default; pass --write to save.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parse, stringify } = require('yaml');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const projectsDir = join(root, 'src/content/projects');

const args = process.argv.slice(2);
const write = args.includes('--write');
const all = args.includes('--all');
const onlyStacked = args.includes('--only-stacked');
const slugs = all
  ? readdirSync(projectsDir).filter((n) => statSync(join(projectsDir, n)).isDirectory())
  : args.filter((a) => !a.startsWith('--'));

if (!slugs.length) {
  console.error('Usage: node scripts/split-pair-blocks.mjs <slug>|--all [--only-stacked] [--write]');
  process.exit(1);
}

let changed = 0;
for (const slug of slugs) {
  const path = join(projectsDir, slug, 'index.yaml');
  const data = parse(readFileSync(path, 'utf8'));
  const blocks = data.blocks || [];
  const next = [];
  let local = 0;
  for (const block of blocks) {
    if (block.discriminant !== 'pair') {
      next.push(block);
      continue;
    }
    const v = block.value || {};
    if (onlyStacked && v.layout !== 'stack') {
      next.push(block);
      continue;
    }
    next.push({
      discriminant: 'image',
      value: {
        src: v.left,
        alt: v.leftAlt || '',
        frame: 'full',
        flush: false,
      },
    });
    next.push({
      discriminant: 'image',
      value: {
        src: v.right,
        alt: v.rightAlt || '',
        frame: 'full',
        flush: false,
      },
    });
    local++;
  }
  if (!local) {
    console.log(`${slug}: no pairs to split`);
    continue;
  }
  console.log(`${slug}: split ${local} pair(s) → ${local * 2} image blocks${write ? '' : ' (dry-run)'}`);
  if (write) {
    data.blocks = next;
    writeFileSync(path, stringify(data));
  }
  changed += local;
}
console.log(write ? `Wrote ${changed} split(s).` : `Dry-run: ${changed} pair(s) would split. Pass --write to save.`);
