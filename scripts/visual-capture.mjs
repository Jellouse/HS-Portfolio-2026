import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { join, extname } from 'node:path';

const root = process.argv[2];
const outDir = process.argv[3];
const port = Number(process.argv[4] || 4341);
if (!root || !outDir) {
  console.error('usage: node scripts/visual-capture.mjs <static-root> <out-dir> [port]');
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.txt': 'text/plain',
  '.xml': 'application/xml',
  '.json': 'application/json',
};

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
  res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(port, '127.0.0.1', r));

const pages = ['/', '/shop/', '/work/industrial-bloom/', '/work/tonys-chocolonely/'];
const viewports = [
  { tag: '1440', width: 1440, height: 900, mobile: false },
  { tag: '390', width: 390, height: 844, mobile: true },
];

const browser = await chromium.launch();

for (const vp of viewports) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
    isMobile: vp.mobile,
    hasTouch: vp.mobile,
  });
  const page = await context.newPage();
  for (const path of pages) {
    const slug = path.replace(/\//g, '') || 'home';
    const file = join(outDir, `${slug}-${vp.tag}.png`);
    await page.goto(`http://127.0.0.1:${port}${path}`, { waitUntil: 'networkidle', timeout: 120000 });
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(async () => {
      const height = document.documentElement.scrollHeight;
      for (let y = 0; y < height; y += 600) {
        scrollTo(0, y);
        await new Promise((resolve) => setTimeout(resolve, 40));
      }
      scrollTo(0, 0);
    });
    await page.waitForFunction(() => {
      const imgs = [...document.querySelectorAll('img')];
      return imgs.every((img) => {
        if (img.closest('[hidden]')) return true;
        const style = getComputedStyle(img);
        if (style.display === 'none' || style.visibility === 'hidden') return true;
        if (!img.complete || img.naturalWidth === 0) return false;
        if (img.closest('.frame') && !img.classList.contains('is-ready')) return false;
        return parseFloat(style.opacity) > 0.99;
      });
    }, { timeout: 30000 }).catch(() => {});
    await page.evaluate(() => {
      document.querySelectorAll('video').forEach((video) => {
        video.pause();
        video.currentTime = 0;
      });
    });
    if (path === '/') await page.waitForSelector('[data-intro-settled]', { timeout: 20000 }).catch(() => {});
    if (path === '/shop/') await page.waitForSelector('[data-ring-settled]', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(200);
    await page.screenshot({ path: file, fullPage: true });
    const box = await page.evaluate(() => ({
      w: document.documentElement.scrollWidth,
      h: document.documentElement.scrollHeight,
    }));
    console.log('shot', file, box.w, box.h);
  }
  await context.close();
}

await browser.close();
server.close();
