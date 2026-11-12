// Shared chrome view-transition names: about text pills, services hub
// text pills, and service-steps icon pills stay on the same contract.
//
// npm run build && npm run test:chrome-vt
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const failures = [];
const css = readFileSync(join(ROOT, 'src/styles/global.css'), 'utf8');
const hub = readFileSync(join(ROOT, 'src/pages/services/index.astro'), 'utf8');
const steps = readFileSync(join(ROOT, 'src/components/ServicePage.astro'), 'utf8');

const must = (ok, message) => {
  if (!ok) failures.push(message);
};

must(hub.includes('data-chrome-vt'), 'services hub is missing data-chrome-vt');
must(steps.includes('data-chrome-vt'), 'service-steps is missing data-chrome-vt');
must(
  /data-mode="icon"/.test(steps) && /class="arrow-pill" data-dir="left" data-mode="icon"/.test(steps),
  'service-steps left control is not an icon pill',
);
must(
  /class="arrow-pill" data-dir="right" data-mode="icon"/.test(steps),
  'service-steps right control is not an icon pill',
);
must(
  css.includes("[data-chrome-vt] .arrow-pill[data-dir='left']:not([data-mode='icon'])"),
  'left pill name is not gated on data-chrome-vt and is missing the icon exclusion',
);
must(
  css.includes("[data-chrome-vt] .arrow-pill[data-dir='right']:not([data-mode='icon'])"),
  'right pill name is not gated on data-chrome-vt and is missing the icon exclusion',
);
must(css.includes("view-transition-name: arrow-pill-left"), 'arrow-pill-left name is missing');
must(css.includes("view-transition-name: arrow-pill-right"), 'arrow-pill-right name is missing');
must(
  /::view-transition-image-pair\(arrow-pill-left\),\s*::view-transition-image-pair\(arrow-pill-right\) \{[^}]*background: transparent;/.test(css),
  'pill image-pairs are not transparent',
);
must(
  /::view-transition-image-pair\(services-back\),\s*::view-transition-image-pair\(services-face\) \{[^}]*background: transparent;/.test(css),
  'face/back image-pairs are not transparent',
);
must(!/::view-transition-image-pair\(arrow-pill-(?:left|right)\) \{[^}]*var\(--page-bg\)/.test(css), 'pill image-pairs use page-bg');
must(
  css.includes('::view-transition-old(arrow-pill-left):only-child') &&
    css.includes('::view-transition-new(arrow-pill-left):only-child'),
  'unpaired pill snapshots do not fade with only-child',
);

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

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
await new Promise((r) => server.listen(4347, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:4347';

const namesOf = (page, selectors) => page.evaluate((sels) => {
  const out = {};
  for (const [key, sel] of Object.entries(sels)) {
    const el = document.querySelector(sel);
    out[key] = el ? getComputedStyle(el).viewTransitionName : null;
  }
  return out;
}, selectors);

const expectNames = (label, got, want) => {
  for (const [key, name] of Object.entries(want)) {
    if (got[key] !== name) failures.push(`${label} ${key}: got ${got[key]}, expected ${name}`);
  }
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
await page.route(/\/_vercel\/(insights|speed-insights)\//, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));

await page.goto(`${BASE}/`, { waitUntil: 'load' });
await page.waitForSelector('[data-arrow-nav].is-controls');
const landing = await namesOf(page, {
  face: '[data-arrow-nav] .arrow-face-scale',
  back: '[data-arrow-nav] .arrow-back',
  left: '[data-arrow-nav] .arrow-pill[data-dir="left"]',
  right: '[data-arrow-nav] .arrow-pill[data-dir="right"]',
});
expectNames('landing', landing, { face: 'none', back: 'none', left: 'none', right: 'none' });

await page.goto(`${BASE}/#about`, { waitUntil: 'load' });
await page.waitForFunction(() => document.querySelector('[data-arrow-nav]')?.dataset.screen === 'about');
const about = await namesOf(page, {
  face: '[data-arrow-nav][data-screen="about"] .arrow-face-scale',
  back: '[data-arrow-nav][data-screen="about"] .arrow-back',
  left: '[data-arrow-nav][data-screen="about"] .arrow-pill[data-dir="left"]',
  right: '[data-arrow-nav][data-screen="about"] .arrow-pill[data-dir="right"]',
});
expectNames('about', about, {
  face: 'services-face',
  back: 'services-back',
  left: 'arrow-pill-left',
  right: 'arrow-pill-right',
});

await page.goto(`${BASE}/services/`, { waitUntil: 'load' });
await page.waitForSelector('[data-chrome-vt][data-services-hub]');
const hubNames = await namesOf(page, {
  face: '[data-services-hub] .arrow-face-scale',
  back: '[data-services-hub] .arrow-back',
  left: '[data-services-hub] .arrow-pill[data-dir="left"]',
  right: '[data-services-hub] .arrow-pill[data-dir="right"]',
});
expectNames('services hub', hubNames, {
  face: 'services-face',
  back: 'services-back',
  left: 'arrow-pill-left',
  right: 'arrow-pill-right',
});

await page.goto(`${BASE}/services/physical-build/`, { waitUntil: 'load' });
await page.waitForSelector('[data-chrome-vt][data-service-steps]');
const detail = await namesOf(page, {
  back: '[data-service-steps] .arrow-back',
  left: '[data-service-steps] .arrow-pill[data-dir="left"]',
  right: '[data-service-steps] .arrow-pill[data-dir="right"]',
});
expectNames('service-steps', detail, {
  back: 'services-back',
  left: 'none',
  right: 'none',
});

await browser.close();
server.close();
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log('chrome-vt: ok');
