import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ARTIFACTS = process.env.ARTIFACTS || join(ROOT, 'artifacts');
const BASE = process.env.BASE_URL?.replace(/\/$/, '');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.woff2': 'font/woff2',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

let server;
let origin = BASE;
if (!BASE) {
  const root = [join(ROOT, '.vercel', 'output', 'static'), join(ROOT, 'dist', 'client')].find((d) =>
    existsSync(join(d, 'index.html')),
  );
  if (!root) {
    console.error('Run npm run build first or set BASE_URL');
    process.exit(1);
  }
  server = createServer((req, res) => {
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
  await new Promise((r) => server.listen(4337, '127.0.0.1', r));
  origin = 'http://127.0.0.1:4337';
}

mkdirSync(ARTIFACTS, { recursive: true });
const stripDir = join(ARTIFACTS, 'scroll-motion-strips');
mkdirSync(stripDir, { recursive: true });

const browser = await chromium.launch();
const scenes = [
  { name: 'home-intro', url: `${origin}/`, scroll: false },
  { name: 'atomic-scroll', url: `${origin}/work/atomic-ski/`, scroll: true },
];

for (const [label, vp] of [
  ['desktop', { width: 1440, height: 900 }],
  ['mobile', { width: 390, height: 844, isMobile: true, hasTouch: true }],
]) {
  for (const scene of scenes) {
    const page = await browser.newPage({ viewport: vp });
    await page.goto(scene.url, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => document.documentElement.classList.contains('is-scroll-intro-ready'), null, {
      timeout: 20000,
    });
    const frames = [];
    const capture = async () => frames.push(await page.screenshot({ type: 'png' }));

    if (!scene.scroll) {
      await page.evaluate(() => scrollTo(0, 0));
      await page.waitForTimeout(600);
      const introMs = 2400;
      for (let t = 0; t <= introMs; t += 100) {
        await page.waitForTimeout(100);
        await capture();
      }
    } else {
      await page.waitForTimeout(800);
      const max = await page.evaluate(() => Math.min(document.body.scrollHeight - innerHeight, 3200));
      for (let y = 0; y <= max; y += Math.max(80, Math.round(max / 18))) {
        await page.evaluate((y) => scrollTo(0, y), y);
        await page.waitForTimeout(100);
        await capture();
      }
    }

    const dir = join(stripDir, `${scene.name}-${label}`);
    mkdirSync(dir, { recursive: true });
    const b64 = [];
    frames.forEach((buf, i) => {
      writeFileSync(join(dir, `${String(i).padStart(3, '0')}.png`), buf);
      b64.push(buf.toString('base64'));
    });
    const sheet = join(ARTIFACTS, `${scene.name}-${label}-contact.png`);
    const sheetPage = await browser.newPage();
    const w = vp.width;
    const h = vp.height;
    await sheetPage.setViewportSize({ width: w * frames.length, height: h });
    await sheetPage.setContent(
      `<style>*{margin:0}body{display:flex;background:#fff}img{width:${w}px;height:${h}px}</style>${b64.map((s) => `<img src="data:image/png;base64,${s}">`).join('')}`,
    );
    await sheetPage.screenshot({ path: sheet, type: 'png' });
    await sheetPage.close();
    console.log(`wrote ${sheet} (${frames.length} frames @10fps)`);
    await page.close();
  }
}

await browser.close();
server?.close();
console.log(`artifacts in ${ARTIFACTS}`);
