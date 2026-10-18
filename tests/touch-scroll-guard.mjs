/**
 * Static guard: fail if touch/pointer listeners are non-passive, or if
 * touch-action:none appears outside the allowlist. Run from repo root.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const ALLOW_TOUCH_ACTION_NONE = [
  // none today — add a relative path only with a comment explaining why
];

const CODE_EXT = new Set(['.ts', '.tsx', '.js', '.mjs', '.astro', '.css']);
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.vercel', '.astro', 'tests']);

const failures = [];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) walk(path, out);
    else if ([...CODE_EXT].some((ext) => name.endsWith(ext))) out.push(path);
  }
  return out;
}

const files = walk(join(ROOT, 'src'));
files.push(join(ROOT, 'astro.config.mjs'));

for (const file of files) {
  const rel = relative(ROOT, file);
  const src = readFileSync(file, 'utf8');

  const passiveRe =
    /addEventListener\(\s*['"](touchstart|touchmove|touchend|touchcancel|pointerdown|pointermove|pointerup|pointercancel)['"][\s\S]{0,200}?passive\s*:\s*false/g;
  let m;
  while ((m = passiveRe.exec(src))) {
    failures.push(`${rel}: non-passive ${m[1]} listener`);
  }

  const taRe = /touch-action\s*:\s*none/gi;
  while ((m = taRe.exec(src))) {
    if (ALLOW_TOUCH_ACTION_NONE.includes(rel)) continue;
    failures.push(`${rel}: touch-action:none (not on allowlist)`);
  }

  // A full-bleed switch under the finger is the known scroll killer (WebKit 321591).
  if (
    /setAttribute\(\s*['"]switch['"][\s\S]{0,500}inset\s*:\s*0/i.test(src) ||
    /type=['"]checkbox['"][\s\S]{0,200}switch[\s\S]{0,500}inset\s*:\s*0/i.test(src)
  ) {
    if (!/visibility\s*:\s*hidden/i.test(src)) {
      failures.push(
        `${rel}: checkbox switch overlay may sit under the finger (use label + visibility:hidden switch)`,
      );
    }
  }
}

if (failures.length) {
  console.error('touch-scroll-guard FAILED:');
  for (const f of failures) console.error('  -', f);
  process.exit(1);
}
console.log(`touch-scroll-guard OK (${files.length} files)`);
