import { chromium, webkit, devices } from 'playwright';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = (process.env.BASE_URL || '').replace(/\/$/, '');
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const root = BASE
  ? ''
  : [join(ROOT, '.vercel', 'output', 'static'), join(ROOT, 'dist', 'client')].find((d) =>
      existsSync(join(d, 'index.html')),
    );
if (!BASE && !root) {
  console.error('Run npm run build first.');
  process.exit(1);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain',
};
const server = BASE
  ? null
  : createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = [join(root, p), join(root, p, 'index.html')].find(
    (path) => path.startsWith(root) && existsSync(path) && statSync(path).isFile(),
  );
  if (!f) {
    r.writeHead(404);
    return r.end();
  }
  r.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' });
  r.end(readFileSync(f));
});
const origin = BASE || 'http://127.0.0.1:4377';
if (server) await new Promise((resolve) => server.listen(4377, '127.0.0.1', resolve));

const shots = process.env.EDGE_DIR || '';
if (shots) mkdirSync(shots, { recursive: true });

function channels(color) {
  const match = String(color).trim().match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?/i);
  if (match) {
    return [Number(match[1]), Number(match[2]), Number(match[3]), match[4] === undefined ? 1 : Number(match[4])];
  }
  const hex = String(color).trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!hex) return null;
  const raw = hex[1].length === 3 ? hex[1].split('').map((c) => c + c).join('') : hex[1];
  const n = Number.parseInt(raw, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
}

function same(a, b) {
  const left = channels(a);
  const right = channels(b);
  if (!left || !right) return false;
  return left[3] > 0.99 && right[3] > 0.99 && left.slice(0, 3).every((v, i) => Math.abs(v - right[i]) <= 1);
}

const failures = [];
function check(ok, message) {
  if (!ok) failures.push(message);
}

async function readEdge(page) {
  return page.evaluate(() => {
    const css = (el) => (el ? getComputedStyle(el).backgroundColor : '');
    const root = document.documentElement;
    return {
      sky: css(document.querySelector('[data-sky]')),
      html: css(root),
      body: css(document.body),
      theme: document.querySelector('meta[name="theme-color"]')?.getAttribute('content') || '',
      viewport: document.querySelector('meta[name="viewport"]')?.getAttribute('content') || '',
      pageBg: getComputedStyle(root).getPropertyValue('--page-bg').trim(),
    };
  });
}

async function overscroll(page, dy) {
  const box = page.viewportSize();
  const x = box.width / 2;
  const y = Math.round(box.height / 2);
  try {
    await page.mouse.wheel(0, dy);
  } catch {
    try {
      const client = await page.context().newCDPSession(page);
      const finger = -dy;
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
      const steps = 10;
      for (let i = 1; i <= steps; i++) {
        await client.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x, y: y + (finger * i) / steps, id: 1 }],
        });
      }
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } catch {
      await page.evaluate((delta) => window.scrollBy(0, delta), dy);
    }
  }
  await page.waitForTimeout(80);
}

const pages = ['/', '/shop/', '/work/industrial-bloom/'];
const times = ['0', '12:00', '16:30', '17:30', '18:30', '19:30'];
const profiles = [
  ['webkit-iphone', webkit, devices['iPhone 13']],
  ['chromium-pixel', chromium, devices['Pixel 7']],
  ['webkit-desktop', webkit, { viewport: { width: 1280, height: 800 } }],
];

for (const [name, engine, device] of profiles) {
  const browser = await engine.launch();
  const context = await browser.newContext({ ...device, reducedMotion: 'reduce' });
  const page = await context.newPage();
  let sawGray = false;
  for (const path of pages) {
    for (const time of times) {
      await page.goto(`${origin}${path}?t=${encodeURIComponent(time)}`, { waitUntil: 'load' });
      await page.waitForSelector('[data-sky][data-ready]', { timeout: 15000 });
      await page.evaluate(() => window.scrollTo(0, 0));
      await overscroll(page, -700);
      const top = await readEdge(page);
      const max = await page.evaluate(() => {
        const y = Math.max(0, document.documentElement.scrollHeight - innerHeight);
        window.scrollTo(0, y);
        return y;
      });
      await overscroll(page, 700);
      const bottom = await readEdge(page);
      const label = `${name} ${path}?t=${time}`;
      for (const edge of [top, bottom]) {
        check(edge.viewport.includes('viewport-fit=cover'), `${label} viewport is ${edge.viewport}`);
        check(same(edge.html, edge.sky), `${label} html ${edge.html} != sky ${edge.sky}`);
        check(same(edge.body, edge.sky), `${label} body ${edge.body} != sky ${edge.sky}`);
        check(same(edge.theme, edge.sky), `${label} theme-color ${edge.theme} != sky ${edge.sky}`);
        check(same(edge.pageBg, edge.sky), `${label} --page-bg ${edge.pageBg} != sky ${edge.sky}`);
        const rgb = channels(edge.sky);
        if (rgb && rgb[0] > 8 && rgb[0] < 247) sawGray = true;
      }
      if (shots && name === 'webkit-iphone' && path === '/' && (time === '0' || time === '12:00')) {
        const height = page.viewportSize().height;
        const width = page.viewportSize().width;
        await page.evaluate(() => window.scrollTo(0, 0));
        await overscroll(page, -700);
        await page.screenshot({ path: join(shots, `${time}-top.png`), clip: { x: 0, y: 0, width, height: 140 } });
        await page.evaluate((y) => window.scrollTo(0, y), max);
        await overscroll(page, 700);
        await page.screenshot({
          path: join(shots, `${time}-bottom.png`),
          clip: { x: 0, y: Math.max(0, height - 160), width, height: 160 },
        });
      }
    }
  }
  check(sawGray, `${name} never painted a mid gray sky`);
  await browser.close();
}

server?.close();
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('edge-bg: html, body, and theme-color follow the sky on iPhone, Pixel, and desktop');
