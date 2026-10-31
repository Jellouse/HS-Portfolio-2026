import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sections } from '../src/components/sections/registry.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const baselinePath = join(root, 'docs/agents/known-drift.json');
const mapPath = join(root, 'docs/agents/COMPONENTS.md');

const SPACE = new Set([0, 1, 3, 4, 6, 8, 10, 12, 16, 20, 40, 48, 80, 84, 96, 100, 150, 160, 240]);
const RADIUS = new Set([0, 15, 31]);
const BREAKPOINTS = new Set([759, 760, 1439, 1440]);
const DURATIONS = new Set([0, 30, 150, 160, 200, 240, 260, 300, 400]);
const EASINGS = new Set([
  '0.23,1,0.32,1',
  '0.16,1,0.3,1',
  '0.25,0.46,0.45,0.94',
  '0.65,0,0.15,1',
  '0.77,0,0.175,1',
  '0.32,0.72,0,1',
]);

const SPACE_PROPS = 'margin|padding|gap|row-gap|column-gap|inset|top|right|bottom|left|outline|outline-offset|text-underline-offset|text-decoration-thickness';
const LAYOUT = new Set(['page-grid', 'sr-only', 'fade-in']);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'content' || name === 'node_modules') continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(css|astro|tsx|ts|mjs|js)$/.test(name)) out.push(path);
  }
  return out;
}

function rel(path) {
  return relative(root, path).replaceAll('\\', '/');
}

function lineNo(text, index) {
  return text.slice(0, index).split('\n').length;
}

function lineText(text, index) {
  const start = text.lastIndexOf('\n', index - 1) + 1;
  const end = text.indexOf('\n', index);
  return text.slice(start, end === -1 ? text.length : end);
}

function isTokenLine(text, index) {
  return /^\s*--[\w-]+\s*:/.test(lineText(text, index));
}

function normNum(raw) {
  const n = Number(raw);
  return Number.isFinite(n) ? String(n) : raw;
}

function push(list, rule, file, index, detail, text) {
  list.push(`${rule}\t${rel(file)}:${lineNo(text, index)}\t${detail}`);
}

export function collect() {
  const drift = [];
  const errors = [];
  const files = walk(join(root, 'src')).filter((file) => !rel(file).endsWith('sections/registry.mjs'));

  for (const file of files) {
    const text = readFileSync(file, 'utf8');

    for (const match of text.matchAll(/#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b/g)) {
      if (isTokenLine(text, match.index)) continue;
      push(drift, 'hex', file, match.index, match[0].toLowerCase(), text);
    }

    for (const match of text.matchAll(new RegExp(`(?:${SPACE_PROPS})(?:-[a-z]+)?\\s*:\\s*([^;]+);`, 'g'))) {
      if (isTokenLine(text, match.index)) continue;
      for (const px of match[1].matchAll(/(-?\d+(?:\.\d+)?)px/g)) {
        const n = Number(px[1]);
        if (!SPACE.has(n)) push(drift, 'space', file, match.index + match[1].indexOf(px[0]), px[0], text);
      }
    }

    for (const match of text.matchAll(/border-radius(?:-[a-z]+)?\s*:\s*([^;]+);/g)) {
      if (isTokenLine(text, match.index)) continue;
      for (const px of match[1].matchAll(/(-?\d+(?:\.\d+)?)px/g)) {
        const n = Number(px[1]);
        if (!RADIUS.has(n)) push(drift, 'radius', file, match.index, px[0], text);
      }
    }

    for (const match of text.matchAll(/(?:font-size|line-height|letter-spacing)\s*:\s*([^;]+);/g)) {
      if (isTokenLine(text, match.index)) continue;
      const px = match[1].match(/(-?\d+(?:\.\d+)?)px/);
      if (!px) continue;
      const rule = px[1].includes('.') ? 'type-decimal' : 'type-scale';
      push(drift, rule, file, match.index, `${match[0].slice(0, 24).trim()} ${px[0]}`, text);
    }

    for (const match of text.matchAll(/(?:max-width|min-width)\s*:\s*(\d+)px/g)) {
      const before = text.slice(Math.max(0, match.index - 160), match.index);
      if (!/@media|matchMedia|sizes\s*=/.test(before)) continue;
      const n = Number(match[1]);
      if (!BREAKPOINTS.has(n)) push(drift, 'breakpoint', file, match.index, `${n}px`, text);
    }

    for (const match of text.matchAll(/cubic-bezier\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/g)) {
      if (isTokenLine(text, match.index)) continue;
      const key = [1, 2, 3, 4].map((i) => normNum(match[i])).join(',');
      if (!EASINGS.has(key)) push(drift, 'easing', file, match.index, key, text);
    }

    for (const match of text.matchAll(/(?:transition|animation)(?:-[a-z]+)?\s*:\s*([^;{}]+)/g)) {
      if (isTokenLine(text, match.index)) continue;
      for (const dur of match[1].matchAll(/(\d+(?:\.\d+)?)(ms|s)\b/g)) {
        const ms = dur[2] === 's' ? Number(dur[1]) * 1000 : Number(dur[1]);
        if (!DURATIONS.has(ms)) push(drift, 'duration', file, match.index, `${dur[1]}${dur[2]}`, text);
      }
    }

    for (const match of text.matchAll(/\bduration\s*:\s*(\d+(?:\.\d+)?)/g)) {
      const ms = Number(match[1]);
      if (!DURATIONS.has(ms)) push(drift, 'duration', file, match.index, `${match[1]}ms`, text);
    }

    for (const match of text.matchAll(/\bstyle="([^"]*)"/g)) {
      if (!styleAllowed(match[1])) push(drift, 'inline-style', file, match.index, clip(match[1]), text);
    }
    for (const match of text.matchAll(/\bstyle=\{`([^`]*)`\}/g)) {
      if (!styleAllowed(match[1])) push(drift, 'inline-style', file, match.index, clip(match[1]), text);
    }
    for (const match of text.matchAll(/\bstyle=\{\{([\s\S]*?)\}\}/g)) {
      if (!objectStyleAllowed(match[1])) push(drift, 'inline-style', file, match.index, clip(match[1]), text);
    }
  }

  const pageFiles = files.filter((file) => rel(file).startsWith('src/pages/') && rel(file).endsWith('.astro'));
  const seen = new Map();
  for (const file of pageFiles) {
    const text = readFileSync(file, 'utf8');
    for (const section of sections) {
      for (const rootClass of section.roots || []) {
        const re = new RegExp(`<(?:section|header|nav|article|div|figure|p|span|h1|h2|ul|footer|a|button)\\b[^>]*class="[^"]*\\b${rootClass}\\b`, 'g');
        for (const match of text.matchAll(re)) {
          errors.push(`inlined-section\t${rel(file)}:${lineNo(text, match.index)}\t${section.name} ${rootClass}`);
        }
      }
      for (const marker of section.markers || []) {
        const at = text.indexOf(marker);
        if (at !== -1) errors.push(`inlined-section\t${rel(file)}:${lineNo(text, at)}\t${section.name} ${marker}`);
      }
    }
    for (const match of text.matchAll(/<(?:section|header|nav|article|div|figure)\b[^>]*class="([^"]+)"/g)) {
      const tokens = match[1].trim().split(/\s+/).filter((token) => token && !LAYOUT.has(token)).sort();
      if (!tokens.length) continue;
      const key = tokens.join(' ');
      const hit = `${rel(file)}:${lineNo(text, match.index)}`;
      if (!seen.has(key)) seen.set(key, []);
      seen.get(key).push(hit);
    }
  }
  for (const [key, hits] of seen) {
    const filesHit = new Set(hits.map((hit) => hit.split(':')[0]));
    if (filesHit.size > 1) errors.push(`duplicate-page-section\t${key}\t${hits.join(', ')}`);
  }

  const onDisk = readdirSync(join(root, 'src/components/sections'))
    .filter((name) => name.endsWith('.astro'))
    .map((name) => `src/components/sections/${name}`);
  const registered = new Set(sections.map((section) => section.file));
  for (const file of onDisk) {
    if (!registered.has(file)) errors.push(`unregistered-section\t${file}\tadd it to src/components/sections/registry.mjs`);
  }
  for (const section of sections) {
    if (!existsSync(join(root, section.file))) errors.push(`missing-section\t${section.file}\t${section.name}`);
    for (const file of section.files) {
      const full = join(root, file);
      if (!existsSync(full)) {
        errors.push(`missing-use\t${file}\t${section.name}`);
        continue;
      }
      const text = readFileSync(full, 'utf8');
      if (!text.includes(section.name)) errors.push(`missing-use\t${file}\t${section.name} is not referenced`);
    }
  }

  if (existsSync(mapPath)) {
    const map = readFileSync(mapPath, 'utf8');
    for (const section of sections) {
      if (!map.includes(section.file)) errors.push(`map\t${section.file}\tmissing from docs/agents/COMPONENTS.md`);
    }
  } else {
    errors.push('map\tdocs/agents/COMPONENTS.md\tmissing');
  }

  return {
    drift: [...new Set(drift)].sort(),
    errors: [...new Set(errors)].sort(),
  };
}

function styleAllowed(value) {
  const decls = value.split(';').map((part) => part.trim()).filter(Boolean);
  return decls.length > 0 && decls.every((decl) => /^--[\w-]+\s*:/.test(decl) || /^background-image\s*:/i.test(decl));
}

function objectStyleAllowed(value) {
  return /backgroundImage/.test(value) && !/color|margin|padding|fontSize|border|gap|transition/i.test(value);
}

function clip(value) {
  return value.replace(/\s+/g, ' ').trim().slice(0, 80);
}

function main() {
  const { drift, errors } = collect();
  if (process.argv.includes('--update')) {
    writeFileSync(baselinePath, `${JSON.stringify(drift, null, 2)}\n`);
    console.log(`wrote ${drift.length} drift rows to docs/agents/known-drift.json`);
  }
  const baseline = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, 'utf8')) : [];
  const base = new Set(baseline);
  const now = new Set(drift);
  const extra = drift.filter((row) => !base.has(row));
  const gone = baseline.filter((row) => !now.has(row));
  if (errors.length) {
    console.error(errors.join('\n'));
  }
  if (extra.length) {
    console.error(`\nnew design drift (${extra.length}):`);
    console.error(extra.join('\n'));
  }
  if (gone.length) {
    console.error(`\nstale baseline (${gone.length}). Run node scripts/check-design.mjs --update`);
    console.error(gone.join('\n'));
  }
  if (errors.length || extra.length || gone.length) process.exit(1);
  console.log(`design-check: ok (${drift.length} known drift)`);
}

const isDirect = process.argv[1] && process.argv[1].endsWith('check-design.mjs');
if (isDirect) main();
