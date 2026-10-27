/**
 * Test runner: every spec is a standalone node script with its own static server on its own
 * port, so they can run side by side. Runs them in a pool (TEST_WORKERS, default half the CPUs,
 * max 6: the specs measure animations, so the box must not be starved), buffers each spec's
 * output and prints it whole, then a timing summary. Exits 1 if any spec failed.
 *   node tests/run.mjs            all specs (npm test)
 *   node tests/run.mjs intro shop  only specs whose name contains one of the words (test:quick)
 * Needs a fresh `npm run build` (npm test does it once up front).
 */
import { spawn } from 'node:child_process';
import { cpus } from 'node:os';

// [name, file]. Order = longest first, so the pool finishes evenly.
const SPECS = [
  ['a11y', 'tests/a11y.spec.mjs'],
  ['shop-intro', 'tests/shop-intro.spec.mjs'],
  ['intro', 'tests/intro-face.spec.mjs'],
  ['contact', 'tests/contact.spec.mjs'],
  ['keystatic', 'tests/keystatic-smoke.spec.mjs'],
  ['taps', 'tests/mobile-taps.spec.mjs'],
  ['scroll', 'tests/mobile-scroll.spec.mjs'],
  ['reveal', 'tests/text-reveal.spec.mjs'],
  ['reveal-first-paint', 'tests/reveal-first-paint.spec.mjs'],
  ['footer-faces', 'tests/footer-faces.spec.mjs'],
  ['reveal-robust', 'tests/reveal-robust.spec.mjs'],
  ['spin', 'tests/spin-mark.spec.mjs'],
  ['vt', 'tests/view-transition.spec.mjs'],
  ['hscroll', 'tests/no-hscroll.spec.mjs'],
  ['shop-grid', 'tests/shop-grid.spec.mjs'],
  ['canvas-pages', 'tests/canvas-pages.spec.mjs'],
  ['canvas', 'tests/canvas-auth.spec.mjs'],
  ['shop', 'tests/shop-checkout.spec.mjs'],
  ['project-images', 'tests/project-images.spec.mjs'],
  ['touch-guard', 'tests/touch-scroll-guard.mjs'],
];

const words = process.argv.slice(2);
const todo = words.length ? SPECS.filter(([n]) => words.some((w) => n.includes(w))) : SPECS;
if (!todo.length) { console.error(`no spec matches ${words.join(' ')}`); process.exit(1); }
const workers = Math.max(1, Number(process.env.TEST_WORKERS) || Math.min(6, Math.floor(cpus().length / 2)));

const run = ([name, file]) =>
  new Promise((done) => {
    const t0 = Date.now();
    const child = spawn(process.execPath, [file], { env: process.env });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('close', (code) => {
      const s = ((Date.now() - t0) / 1000).toFixed(1);
      process.stdout.write(`\n--- ${name} (${s}s, ${code === 0 ? 'ok' : 'FAILED'}) ---\n${out}`);
      done({ name, code, s });
    });
  });

const t0 = Date.now();
const queue = [...todo];
const results = [];
await Promise.all(
  Array.from({ length: Math.min(workers, queue.length) }, async () => {
    while (queue.length) results.push(await run(queue.shift()));
  }),
);
const failed = results.filter((r) => r.code !== 0);
console.log(`\n${results.length} specs, ${workers} workers, ${((Date.now() - t0) / 1000).toFixed(1)}s wall`);
for (const r of results.sort((a, b) => b.s - a.s)) console.log(`  ${r.code === 0 ? 'ok  ' : 'FAIL'} ${r.name} ${r.s}s`);
if (failed.length) { console.error(`FAILED: ${failed.map((r) => r.name).join(', ')}`); process.exit(1); }
