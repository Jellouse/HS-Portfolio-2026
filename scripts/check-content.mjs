import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parse } = require('yaml');

const IMAGE = /^\/src\/content\/\S+\.(?:jpe?g|png|webp|avif|gif)$/i;

function walkFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walkFiles(path, out);
    else if (name.endsWith('.yaml') || name.endsWith('.yml')) out.push(path);
  }
  return out;
}

function projectSlugs(root) {
  const dir = join(root, 'src/content/projects');
  if (!existsSync(dir)) return new Set();
  return new Set(
    readdirSync(dir).filter((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() && existsSync(join(path, 'index.yaml'));
    }),
  );
}

function coverOf(root, slug) {
  const file = join(root, 'src/content/projects', slug, 'index.yaml');
  if (!existsSync(file)) return '';
  const data = parse(readFileSync(file, 'utf8'));
  return typeof data?.cover === 'string' ? data.cover.trim() : '';
}

function fileExists(root, src) {
  return IMAGE.test(src) && existsSync(join(root, src.replace(/^\//, '')));
}

function walk(node, path, visit) {
  visit(path, node);
  if (Array.isArray(node)) {
    node.forEach((item, index) => walk(item, `${path}[${index}]`, visit));
    return;
  }
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      walk(value, path ? `${path}.${key}` : key, visit);
    }
  }
}

export function checkContent(root) {
  const errors = [];
  const contentDir = join(root, 'src/content');
  if (!existsSync(contentDir)) return [`${relative(root, contentDir) || 'src/content'}: missing content directory`];

  const slugs = projectSlugs(root);
  const covers = new Map([...slugs].map((slug) => [slug, coverOf(root, slug)]));

  for (const file of walkFiles(contentDir)) {
    const rel = relative(root, file).replaceAll('\\', '/');
    let data;
    try {
      data = parse(readFileSync(file, 'utf8'));
    } catch (err) {
      errors.push(`${rel}: invalid yaml (${err instanceof Error ? err.message : err})`);
      continue;
    }
    walk(data, '', (path, value) => {
      if (typeof value === 'string' && IMAGE.test(value)) {
        if (!existsSync(join(root, value.replace(/^\//, '')))) {
          errors.push(`${rel} ${path}: missing image ${value}`);
        }
      }

      if (value && typeof value === 'object' && !Array.isArray(value) && value.discriminant === 'image') {
        const src = typeof value.value?.src === 'string' ? value.value.src.trim() : '';
        if (!src) errors.push(`${rel} ${path}.value.src: missing image`);
      }

      if (value && typeof value === 'object' && !Array.isArray(value) && value.discriminant === 'project') {
        const field = `${path}.value.project`;
        const slug = typeof value.value?.project === 'string' ? value.value.project.trim() : '';
        if (!slug) {
          errors.push(`${rel} ${field}: missing project`);
        } else if (!slugs.has(slug)) {
          errors.push(`${rel} ${field}: unknown project ${slug}`);
        } else if (!fileExists(root, covers.get(slug) || '')) {
          errors.push(`${rel} ${field}: project ${slug} has no cover`);
        }
      }

      if (typeof value === 'string' && /(?:^|\.)projects\[\d+\]$/.test(path) && !slugs.has(value)) {
        errors.push(`${rel} ${path}: unknown project ${value}`);
      }
    });
  }

  return errors.sort();
}

function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const errors = checkContent(root);
  if (errors.length) {
    console.error(errors.join('\n'));
    console.error(`\n${errors.length} content check(s) failed`);
    process.exit(1);
  }
  console.log('content-check: ok');
}

const isDirect = process.argv[1] && process.argv[1].endsWith('check-content.mjs');
if (isDirect) main();
