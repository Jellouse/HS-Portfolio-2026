// During the landing intro the GPU face must sit in the large centered
// placement, then scale in place into the small logo. It must not already
// be parked at the top of the viewport as a header logo.
//
// npm run build && npm run test:intro-face-pos
// EVIDENCE=/some/dir also saves mid-intro frames.
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
await new Promise((r) => server.listen(4358, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:4358';

const probe = () => {
  const nav = document.querySelector('[data-arrow-nav]');
  const gl = nav?.querySelector('.arrow-face-gl');
  const scale = nav?.querySelector('.arrow-face-scale');
  const shown = gl || scale;
  const r = shown?.getBoundingClientRect();
  return {
    intro: !!nav?.classList.contains('is-intro'),
    controls: !!nav?.classList.contains('is-controls'),
    path: nav?.classList.contains('is-face-gl') ? 'gl' : nav?.classList.contains('is-face-svg') ? 'svg' : '',
    vw: innerWidth,
    vh: innerHeight,
    el: shown?.className || '',
    x: r ? r.left : null,
    y: r ? r.top : null,
    w: r ? r.width : null,
    h: r ? r.height : null,
    cx: r ? r.left + r.width / 2 : null,
    cy: r ? r.top + r.height / 2 : null,
  };
};

// The intro holds up to 400ms, then runs 7200ms. Copy/pills fade in at 4400ms.
// Sample once while the face is still large, and once after the landing is
// visible, so a canvas pinned to the top cannot hide behind the early crop.
const SAMPLES = [
  { name: 'early', waitMs: 1600, wantControls: false },
  { name: 'revealed', waitMs: 5200, wantControls: true },
];

const run = async (type, engine, size, label) => {
  const tag = `${type} ${label}`;
  const browser = await engine.launch();
  const context = await browser.newContext({
    viewport: size,
    deviceScaleFactor: 2,
    isMobile: size.width < 800,
    hasTouch: size.width < 800,
  });
  const page = await context.newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'commit' });
  await page.waitForFunction(
    () => {
      const nav = document.querySelector('[data-arrow-nav]');
      return nav && (nav.classList.contains('is-face-gl') || nav.classList.contains('is-face-svg') || !nav.classList.contains('is-intro'));
    },
    null,
    { timeout: 8000 },
  ).catch(() => {});

  const started = Date.now();
  for (const sample of SAMPLES) {
    const remain = sample.waitMs - (Date.now() - started);
    if (remain > 0) await page.waitForTimeout(remain);
    const mid = await page.evaluate(probe);
    if (EVIDENCE) {
      await page.screenshot({ path: join(EVIDENCE, `intro-pos-${type}-${label}-${sample.name}.png`), fullPage: false });
    }
    if (!mid.intro) {
      failures.push(`${tag} ${sample.name}: intro already over`);
      continue;
    }
    if (mid.path !== 'gl') failures.push(`${tag} ${sample.name}: expected GPU face, got ${mid.path || 'none'}`);
    if (mid.cx == null || mid.cy == null) {
      failures.push(`${tag} ${sample.name}: no visible face box`);
      continue;
    }
    const xOff = Math.abs(mid.cx / mid.vw - 0.5);
    const yOff = Math.abs(mid.cy / mid.vh - 0.5);
    // The canvas is the face plus filter reach, centered on the stage. A
    // miss by more than 8% means it has been pinned to an edge (the bug
    // parked the centre on the top edge, yOff ≈ 0.5).
    if (xOff > 0.08) failures.push(`${tag} ${sample.name}: face centre x ${mid.cx.toFixed(1)} / ${mid.vw} (off ${xOff.toFixed(3)})`);
    if (yOff > 0.08) failures.push(`${tag} ${sample.name}: face centre y ${mid.cy.toFixed(1)} / ${mid.vh} (off ${yOff.toFixed(3)})`);
    if (sample.wantControls && !mid.controls) {
      failures.push(`${tag} ${sample.name}: landing copy should be revealed`);
    }
    console.log(`${tag} ${sample.name}: ${mid.path} ${mid.w?.toFixed(0)}×${mid.h?.toFixed(0)} at ${mid.cx?.toFixed(1)},${mid.cy?.toFixed(1)} of ${mid.vw}×${mid.vh}`);
  }

  await context.close();
  await browser.close();
};

await run('webkit', webkit, { width: 390, height: 844 }, 'phone');
await run('webkit', webkit, { width: 1440, height: 900 }, 'desktop');
await run('chromium', chromium, { width: 390, height: 844 }, 'phone');
await run('chromium', chromium, { width: 1440, height: 900 }, 'desktop');

server.close();
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('intro-face-position: ok');
