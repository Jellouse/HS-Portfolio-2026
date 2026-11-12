// The landing face must settle once. After the intro brings it down to its
// resting size it may not grow again and shrink back (the face pulse Johann
// saw on iPhone shortly after load). Loads the landing, never taps, and
// samples the face box every frame until well after the intro ends.
//
// npm run build && npm run test:landing-face
// EVIDENCE=/some/dir also saves frames around the end of the intro.
import { chromium, webkit } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const EVIDENCE = process.env.EVIDENCE || '';
if (EVIDENCE) mkdirSync(EVIDENCE, { recursive: true });
const failures = [];

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2', '.mp4': 'video/mp4' };
const root = [join(ROOT, '.vercel', 'output', 'static'), join(ROOT, 'dist', 'client')].find((d) => existsSync(join(d, 'index.html')));
if (!root) {
  console.error('Run npm run build first.');
  process.exit(1);
}
const server = createServer((req, res) => {
  let path = decodeURIComponent((req.url || '/').split('?')[0]);
  if (path.endsWith('/')) path += 'index.html';
  const file = [join(root, path), join(root, path, 'index.html')].find((f) => f.startsWith(root) && existsSync(f) && statSync(f).isFile());
  if (!file) {
    res.writeHead(404);
    return res.end();
  }
  res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(4351, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:4351';

const probe = () => {
  window.__faces = [];
  const sample = () => {
    // The visible face is the GPU drawing during the phone intro and the SVG
    // blob otherwise. The blob can be larger than its clipping circle, so its
    // own box is measured, not the circle.
    const nav = document.querySelector('[data-arrow-nav]');
    const scale = nav?.querySelector('.arrow-face-scale');
    if (scale) {
      // The GPU canvas covers the slot but draws the face at the circle's size.
      const gl = nav.classList.contains('is-face-gl') && nav.querySelector('.arrow-face-gl');
      const blob = nav.querySelector('.arrow-face-blob');
      const shown = blob && getComputedStyle(blob).visibility !== 'hidden' && getComputedStyle(blob).display !== 'none';
      const boxes = [gl ? scale : null, shown ? blob : null].filter(Boolean).map((el) => el.getBoundingClientRect());
      const w = Math.max(0, ...boxes.map((r) => r.width));
      const h = Math.max(0, ...boxes.map((r) => r.height));
      window.__faces.push({
        t: Math.round(performance.now()),
        w,
        h,
        intro: nav.classList.contains('is-intro'),
        path: nav.classList.contains('is-face-gl') ? 'gl' : nav.classList.contains('is-face-svg') ? 'svg' : '',
      });
    }
    requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
};

const run = async (type, engine, size, label) => {
  const tag = `${type} ${label}`;
  const browser = await engine.launch();
  const context = await browser.newContext({
    viewport: size,
    deviceScaleFactor: 2,
    ...(EVIDENCE ? { recordVideo: { dir: join(EVIDENCE, `${type}-${label}-landing`), size } } : {}),
  });
  const page = await context.newPage();
  await page.addInitScript(probe);
  await page.goto(`${BASE}/`, { waitUntil: 'load' });
  // The intro runs 7.2s. Wait past its end and any transition after it.
  await page.waitForFunction(() => !document.querySelector('[data-arrow-nav]')?.classList.contains('is-intro'), null, { timeout: 15000 });
  await page.waitForTimeout(1500);
  const faces = (await page.evaluate(() => window.__faces)).filter((f) => f.w && f.h);
  const path = [...new Set(faces.map((f) => f.path).filter(Boolean))].join('+') || 'none';
  const rest = faces[faces.length - 1];
  const big = (f) => Math.max(f.w, f.h);
  const restSize = big(rest);
  // First frame the face is down at its resting size.
  const settled = faces.findIndex((f) => big(f) <= restSize * 1.05);
  let worst = null;
  for (let i = settled; i >= 0 && i < faces.length; i++) {
    if (!worst || big(faces[i]) > big(worst)) worst = faces[i];
  }
  const ratio = worst ? big(worst) / restSize : 1;
  if (settled < 0) failures.push(`${tag}: the face never reached its resting size`);
  else if (ratio > 1.1) {
    failures.push(
      `${tag}: the face settled at ${Math.round(restSize)}px at ${faces[settled].t}ms, then grew to ${Math.round(big(worst))}px at ${worst.t}ms (${ratio.toFixed(2)}x) and came back down`,
    );
  }
  console.log(`${tag}: ${faces.length} frames, intro path ${path}, rest ${Math.round(restSize)}px, settled at ${faces[settled]?.t}ms, largest after ${ratio.toFixed(2)}x`);
  await context.close();
  await browser.close();
};

const sizes = [
  [{ width: 390, height: 844 }, 'phone'],
  [{ width: 1440, height: 900 }, 'desktop'],
];
for (const [type, engine] of [['webkit', webkit], ['chromium', chromium]].filter(([t]) => !process.env.ONLY || process.env.ONLY === t)) {
  for (const [size, label] of sizes) {
    try {
      await run(type, engine, size, label);
    } catch (error) {
      failures.push(`${type} ${label}: ${error.message.split('\n')[0]}`);
    }
  }
}

server.close();
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('landing face settle: pass');
