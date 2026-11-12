// The /services/ hub face should be the same settled mark as the homepage,
// not the turbulence-displaced intro goo.
//
// npm run build && npm run test:services-face
import { chromium, devices } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2', '.mp4': 'video/mp4' };
const root = [join(ROOT, '.vercel', 'output', 'static'), join(ROOT, 'dist', 'client')].find((d) => existsSync(join(d, 'index.html')));
if (!root) { console.error('Run npm run build first.'); process.exit(1); }
const server = createServer((req, res) => {
  let path = decodeURIComponent((req.url || '/').split('?')[0]);
  if (path.endsWith('/')) path += 'index.html';
  const file = [join(root, path), join(root, path, 'index.html')].find((f) => f.startsWith(root) && existsSync(f) && statSync(f).isFile());
  if (!file) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(4339, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:4339/';
const SHOTS = process.env.ARROW_SHOTS || join(ROOT, 'docs/agents/evidence');
mkdirSync(SHOTS, { recursive: true });

const failures = [];
const browser = await chromium.launch();

const faceInfo = async (page) => page.evaluate(() => {
  const svg = document.querySelector('.arrow-face-blob');
  const group = svg?.querySelector('g');
  const style = svg ? getComputedStyle(svg) : null;
  const box = svg?.getBoundingClientRect();
  return {
    hasSvg: !!svg,
    filter: group?.getAttribute('filter') || '',
    hasTurbulence: !!svg?.querySelector('feTurbulence'),
    viewBox: svg?.getAttribute('viewBox') || '',
    color: style?.color || '',
    width: box ? Math.round(box.width) : 0,
    height: box ? Math.round(box.height) : 0,
    box: box ? { x: box.x, y: box.y, width: box.width, height: box.height } : null,
  };
});

const cropFace = async (page, name, box) => {
  const buf = await page.screenshot({ scale: 'css' });
  const pad = 80;
  const left = Math.max(0, Math.floor(box.x - pad));
  const top = Math.max(0, Math.floor(box.y - pad));
  await sharp(buf).extract({
    left,
    top,
    width: Math.ceil(box.width + pad * 2),
    height: Math.ceil(box.height + pad * 2),
  }).toFile(join(SHOTS, name));
};

const open = async (url, ready) => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
  await page.route(/\/_vercel\/(insights|speed-insights)\//, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(ready, null, { timeout: 20000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  return page;
};

const home = await open(`${BASE}#digital`, () => {
  const nav = document.querySelector('[data-arrow-nav]');
  const svg = document.querySelector('.arrow-face-blob');
  if (!nav || !svg || !nav.classList.contains('is-controls') || nav.classList.contains('is-intro')) return false;
  const box = svg.getBoundingClientRect();
  return Math.abs(box.width - box.height) < 1 && box.width >= 48 && box.width <= 64;
});
const homeFace = await faceInfo(home);
if (!homeFace.hasSvg) failures.push('homepage face is missing');
if (homeFace.filter) failures.push(`homepage settled face still has a filter (${homeFace.filter})`);
if (homeFace.color !== 'rgb(183, 6, 6)') failures.push(`homepage face color ${homeFace.color}`);
await home.close();

const services = await open(`${BASE}services/`, () => document.querySelector('.services-hub .arrow-face-blob'));
const hub = await faceInfo(services);
if (!hub.hasSvg) failures.push('services hub face is missing');
if (hub.filter) failures.push(`services hub face still has a filter (${hub.filter})`);
if (hub.hasTurbulence) failures.push('services hub face still includes the turbulence filter');
if (hub.viewBox !== '0 0 70 70') failures.push(`services hub face viewBox ${hub.viewBox}`);
if (hub.color !== 'rgb(183, 6, 6)') failures.push(`services hub face color ${hub.color}, expected the homepage red`);
if (hub.width !== hub.height) failures.push(`services hub face is not square (${hub.width}x${hub.height})`);
if (hub.width < 48 || hub.width > 64) failures.push(`services hub face size ${hub.width}x${hub.height}, expected the 48 or 64 arrow face`);
if (homeFace.width !== homeFace.height) failures.push(`homepage settled face is not square (${homeFace.width}x${homeFace.height})`);
if (hub.box) {
  await services.screenshot({ path: join(SHOTS, 'services-hub-face-after.png'), scale: 'css' });
  await cropFace(services, 'services-hub-face-after-crop.png', hub.box);
}

const phone = await browser.newPage({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, colorScheme: 'light' });
await phone.route(/\/_vercel\/(insights|speed-insights)\//, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
await phone.goto(`${BASE}services/`, { waitUntil: 'load' });
await phone.waitForSelector('.services-hub .arrow-face-blob');
const mobile = await faceInfo(phone);
if (mobile.filter) failures.push(`mobile services hub face still has a filter (${mobile.filter})`);
if (mobile.color !== 'rgb(183, 6, 6)') failures.push(`mobile services hub face color ${mobile.color}`);
if (mobile.box) await cropFace(phone, 'services-hub-face-after-mobile.png', mobile.box);
await phone.close();
await services.close();

await browser.close();
server.close();
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log('services-hub-face: ok');
