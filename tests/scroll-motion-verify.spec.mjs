/**
 * Legible scroll-motion verification: 2×3 labelled grids + ~4s MP4 captures.
 *   npm run build && ARTIFACTS=/opt/cursor/artifacts node tests/scroll-motion-verify.spec.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ARTIFACTS = process.env.ARTIFACTS || join(ROOT, 'artifacts');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.woff2': 'font/woff2',
  '.webp': 'image/webp',
  '.png': 'image/png',
};
const root = [join(ROOT, '.vercel', 'output', 'static'), join(ROOT, 'dist', 'client')].find((d) =>
  existsSync(join(d, 'index.html')),
);
if (!root) {
  console.error('Run npm run build first.');
  process.exit(1);
}
const server = createServer((req, res) => {
  let path = decodeURIComponent((req.url || '/').split('?')[0]);
  if (path.endsWith('/')) path += 'index.html';
  const file = [join(root, path), join(root, path, 'index.html')].find(
    (f) => f.startsWith(root) && existsSync(f) && statSync(f).isFile(),
  );
  if (!file) {
    res.writeHead(404);
    return res.end();
  }
  res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
});
mkdirSync(ARTIFACTS, { recursive: true });
const tmpRoot = join(ARTIFACTS, 'scroll-motion-cells');
mkdirSync(tmpRoot, { recursive: true });
await new Promise((r) => server.listen(4338, '127.0.0.1', r));
const cellServer = createServer((req, res) => {
  const base = decodeURIComponent((req.url || '/').split('?')[0].replace(/^\//, ''));
  const file = join(tmpRoot, base);
  if (!file.startsWith(tmpRoot) || !existsSync(file)) {
    res.writeHead(404);
    return res.end();
  }
  res.writeHead(200, { 'content-type': 'image/png' });
  res.end(readFileSync(file));
});
await new Promise((r) => cellServer.listen(4339, '127.0.0.1', r));
const CELL_ORIGIN = 'http://127.0.0.1:4339';
const ORIGIN = 'http://127.0.0.1:4338';

const browser = await chromium.launch();

async function composeGrid(name, cellW, cellH, cellPaths, labels) {
  const pad = 24;
  const labelH = 36;
  const sheet = await browser.newPage();
  const cols = 3;
  const rows = 2;
  await sheet.setViewportSize({ width: cols * cellW + pad * 2, height: rows * (cellH + labelH) + pad * 2 });
  const figures = cellPaths
    .map(
      (p, i) =>
        `<figure><figcaption>${labels[i]}</figcaption><img src="${CELL_ORIGIN}/${p.split('/').pop()}" width="${cellW}" height="${cellH}" alt=""></figure>`,
    )
    .join('');
  const html = `<!doctype html><style>
    *{box-sizing:border-box;margin:0;font:14px/18px ui-monospace,Menlo,monospace}
    body{background:#111;color:#ccc;padding:${pad}px}
    .grid{display:grid;grid-template-columns:repeat(3,${cellW}px);gap:${pad}px}
    figure{width:${cellW}px}
    figcaption{padding:8px 0 4px;color:#8af}
    img{display:block;width:${cellW}px;height:${cellH}px;object-fit:cover;object-position:top center;background:#fff}
  </style><body><h1 style="margin-bottom:16px;font-size:16px">${name}</h1><div class="grid">${figures}</div></body>`;
  await sheet.goto('about:blank');
  await sheet.setContent(html, { waitUntil: 'load' });
  await sheet.waitForTimeout(200);
  const out = join(ARTIFACTS, `${name}.png`);
  await sheet.screenshot({ path: out, type: 'png' });
  await sheet.close();
  console.log(`wrote ${out}`);
}

async function waitIntroReady(page) {
  await page.waitForFunction(() => document.documentElement.classList.contains('is-scroll-intro-ready'), null, {
    timeout: 25000,
  });
}

async function captureIntroMilestones(page, labels, tmpDir, prefix) {
  const paths = [];
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(80);
  paths.push(await writeSnap(page, join(tmpDir, `${prefix}-0.png`)));
  await page.waitForTimeout(450);
  paths.push(await writeSnap(page, join(tmpDir, `${prefix}-1.png`)));
  await waitIntroReady(page);
  paths.push(await writeSnap(page, join(tmpDir, `${prefix}-2.png`)));
  await page.waitForTimeout(700);
  paths.push(await writeSnap(page, join(tmpDir, `${prefix}-3.png`)));
  await page.waitForTimeout(1600);
  paths.push(await writeSnap(page, join(tmpDir, `${prefix}-4.png`)));
  await page.evaluate(() => scrollTo(0, Math.round(innerHeight * 0.55)));
  await page.waitForTimeout(500);
  paths.push(await writeSnap(page, join(tmpDir, `${prefix}-5.png`)));
  return paths;
}

async function writeSnap(page, path) {
  await page.screenshot({ path, type: 'png' });
  return path;
}

const labelSet = [
  '1 · intro start',
  '2 · mid-letters',
  '3 · letters done',
  '4 · media mid-entrance',
  '5 · media settled',
  '6 · mid-scroll (drum tilt)',
];

for (const [slug, url, vp, cellW, cellH] of [
  ['home-intro-desktop', '/', { width: 1440, height: 900 }, 640, 400],
  ['home-intro-mobile', '/', { width: 390, height: 844, isMobile: true, hasTouch: true }, 390, 520],
  ['atomic-scroll-desktop', '/work/atomic-ski/', { width: 1440, height: 900 }, 640, 400],
  ['atomic-scroll-mobile', '/work/atomic-ski/', { width: 390, height: 844, isMobile: true, hasTouch: true }, 390, 520],
]) {
  const page = await browser.newPage({ viewport: vp, ...(vp.isMobile ? { isMobile: true, hasTouch: true } : {}) });
  await page.goto(`${ORIGIN}${url}`, { waitUntil: 'load' });
  const paths = await captureIntroMilestones(page, labelSet, tmpRoot, slug);
  await composeGrid(slug, cellW, cellH, paths, labelSet);
  await page.close();
}

async function recordMp4(name, url, vp, run) {
  const videoDir = join(ARTIFACTS, 'videos');
  mkdirSync(videoDir, { recursive: true });
  const context = await browser.newContext({
    ...vp,
    recordVideo: { dir: videoDir, size: { width: vp.width, height: vp.height } },
  });
  const page = await context.newPage();
  await page.goto(`${ORIGIN}${url}`, { waitUntil: 'load' });
  await run(page);
  const webmPath = await page.video().path();
  await page.close();
  await context.close();
  const mp4 = join(ARTIFACTS, `${name}.mp4`);
  execFileSync('ffmpeg', ['-y', '-i', webmPath, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4], {
    stdio: 'ignore',
  });
  console.log(`wrote ${mp4}`);
}

await recordMp4('home-intro-desktop', '/', { width: 1440, height: 900 }, async (page) => {
  await page.waitForTimeout(4200);
});

await recordMp4('atomic-scroll-desktop', '/work/atomic-ski/', { width: 1440, height: 900 }, async (page) => {
  await waitIntroReady(page);
  await page.waitForTimeout(1200);
  const max = await page.evaluate(() => Math.min(document.body.scrollHeight - innerHeight, 2400));
  const steps = 40;
  for (let i = 0; i <= steps; i++) {
    await page.evaluate((y) => scrollTo(0, y), Math.round((max * i) / steps));
    await page.waitForTimeout(70);
  }
});

await browser.close();
cellServer.close();
server.close();
