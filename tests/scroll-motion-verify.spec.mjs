/**
 * Scroll motion verification: intro letter stagger (incl. nav) + media fade-in on scroll.
 *   npm run build && ARTIFACTS=/opt/cursor/artifacts node tests/scroll-motion-verify.spec.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

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
const ORIGIN = 'http://127.0.0.1:4338';

const browser = await chromium.launch();

async function composeGrid(name, cellW, cellH, cellPaths, labels) {
  const pad = 24;
  const labelH = 36;
  const sheet = await browser.newPage();
  const cols = 3;
  await sheet.setViewportSize({ width: cols * cellW + pad * 2, height: 2 * (cellH + labelH) + pad * 2 + 40 });
  const figures = cellPaths
    .map((p, i) => {
      const b64 = readFileSync(p).toString('base64');
      return `<figure><figcaption>${labels[i]}</figcaption><img src="data:image/png;base64,${b64}" width="${cellW}" height="${cellH}" alt=""></figure>`;
    })
    .join('');
  const html = `<!doctype html><style>
    *{box-sizing:border-box;margin:0;font:14px/18px ui-monospace,Menlo,monospace}
    body{background:#111;color:#ccc;padding:${pad}px}
    .grid{display:grid;grid-template-columns:repeat(3,${cellW}px);gap:${pad}px}
    figure{width:${cellW}px}
    figcaption{padding:8px 0 4px;color:#8af;min-height:${labelH}px}
    img{display:block;width:${cellW}px;height:${cellH}px;object-fit:cover;object-position:top center;background:#fff}
  </style><body><h1 style="margin-bottom:16px;font-size:16px">${name}</h1><div class="grid">${figures}</div></body>`;
  await sheet.setContent(html, { waitUntil: 'load' });
  await sheet.waitForTimeout(150);
  await sheet.screenshot({ path: join(ARTIFACTS, `${name}.png`), type: 'png' });
  await sheet.close();
  console.log(`wrote ${join(ARTIFACTS, `${name}.png`)}`);
}

async function headerClip(page, path) {
  const box = await page.locator('.site-header').boundingBox();
  if (!box) throw new Error('no header');
  await page.screenshot({ path, clip: box });
  return path;
}

async function captureHomeIntroGrid(page, tmpDir, prefix, cellW, cellH) {
  const labels = [
    '1 · intro start',
    '2 · mid Humansize letters',
    '3 · Humansize done',
    '4 · nav letters starting',
    '5 · mid nav stagger',
    '6 · all intro letters done',
  ];
  const paths = [];
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(80);
  paths.push(await headerClip(page, join(tmpDir, `${prefix}-0.png`)));
  await page.waitForTimeout(420);
  paths.push(await headerClip(page, join(tmpDir, `${prefix}-1.png`)));
  await page.waitForTimeout(380);
  paths.push(await headerClip(page, join(tmpDir, `${prefix}-2.png`)));
  await page.waitForTimeout(350);
  paths.push(await headerClip(page, join(tmpDir, `${prefix}-3.png`)));
  await page.waitForTimeout(450);
  paths.push(await headerClip(page, join(tmpDir, `${prefix}-4.png`)));
  await page.waitForFunction(() => document.documentElement.classList.contains('is-letter-intro-done'), null, {
    timeout: 20000,
  });
  await page.waitForTimeout(200);
  paths.push(await headerClip(page, join(tmpDir, `${prefix}-5.png`)));
  await composeGrid(prefix, cellW, cellH, paths, labels);
}

async function captureMediaScrollGrid(page, tmpDir, name, url, cellW, cellH) {
  const labels = [
    '1 · before scroll (hidden)',
    '2 · approaching',
    '3 · entering viewport',
    '4 · mid fade-in',
    '5 · fully visible',
    '6 · still visible (no fade-out)',
  ];
  await page.goto(`${ORIGIN}${url}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.classList.contains('is-letter-intro-done'), null, {
    timeout: 25000,
  });
  await page.waitForTimeout(400);

  const frameIndex = url === '/' ? 0 : 2;
  const scrollYs = await page.evaluate((idx) => {
    const frame = document.querySelectorAll('main .frame')[idx];
    if (!frame) return [0, 0, 0, 0, 0, 0];
    const centre = frame.getBoundingClientRect().top + scrollY + frame.getBoundingClientRect().height / 2;
    const vh = innerHeight;
    return [
      0,
      Math.max(0, Math.round(centre - vh * 1.05)),
      Math.max(0, Math.round(centre - vh * 0.85)),
      Math.max(0, Math.round(centre - vh * 0.65)),
      Math.max(0, Math.round(centre - vh * 0.45)),
      Math.max(0, Math.round(centre - vh * 0.45)),
    ];
  }, frameIndex);

  const paths = [];
  for (let i = 0; i < scrollYs.length; i++) {
    await page.evaluate((y) => scrollTo(0, y), scrollYs[i]);
    await page.waitForTimeout(i === 0 ? 100 : 450);
    const out = join(tmpDir, `${name}-${i}.png`);
    await page.screenshot({ path: out, fullPage: false });
    paths.push(out);
  }
  await composeGrid(name, cellW, cellH, paths, labels);
}

for (const [slug, vp, cellW, cellH] of [
  ['home-intro-desktop', { width: 1440, height: 900 }, 640, 400],
  ['home-intro-mobile', { width: 390, height: 844, isMobile: true, hasTouch: true }, 390, 520],
]) {
  const page = await browser.newPage({ viewport: vp, ...(vp.isMobile ? { isMobile: true, hasTouch: true } : {}) });
  await page.goto(`${ORIGIN}/`, { waitUntil: 'load' });
  await captureHomeIntroGrid(page, tmpRoot, slug, cellW, cellH);
  await page.close();
}

for (const [name, url, vp, cellW, cellH] of [
  ['home-media-scroll-desktop', '/', { width: 1440, height: 900 }, 640, 400],
  ['atomic-media-scroll-desktop', '/work/atomic-ski/', { width: 1440, height: 900 }, 640, 400],
]) {
  const page = await browser.newPage({ viewport: vp });
  await captureMediaScrollGrid(page, tmpRoot, name, url, cellW, cellH);
  await page.close();
}

await browser.close();
server.close();
