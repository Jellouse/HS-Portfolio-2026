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
  css.includes('::view-transition-old(arrow-pill-left)') &&
    /::view-transition-old\(arrow-pill-left\),\s*::view-transition-old\(arrow-pill-right\) \{\s*animation: vt-out var\(--dur-nav\) var\(--ease-nav\) both;/.test(css),
  'pill old snapshots do not crossfade with vt-out',
);
must(
  /::view-transition-new\(arrow-pill-left\),\s*::view-transition-new\(arrow-pill-right\) \{\s*animation: vt-in var\(--dur-nav\) var\(--ease-nav\) both;/.test(css),
  'pill new snapshots do not crossfade with vt-in',
);
must(css.includes('active-view-transition-type(chrome-shrink)'), 'chrome-shrink face morph type is missing');
must(css.includes('active-view-transition-type(chrome-grow)'), 'chrome-grow face morph type is missing');

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

const mid = async (viewport, label) => {
  const shot = await browser.newPage({ viewport, colorScheme: 'light' });
  await shot.route(/\/_vercel\/(insights|speed-insights)\//, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await shot.addInitScript(() => {
    addEventListener('pagereveal', (e) => {
      const vt = e.viewTransition;
      window.__chromeVt = { ran: !!vt, href: location.href };
      if (!vt) return;
      vt.ready.then(() => {
        try {
          const styleOf = (pseudo) => {
            const s = getComputedStyle(document.documentElement, pseudo);
            return { animation: s.animationName, mix: s.mixBlendMode, opacity: s.opacity, width: s.width, height: s.height };
          };
          const anims = document.getAnimations().map((a) => ({
            pseudo: a.effect?.pseudoElement || '',
            name: a.animationName,
          }));
          window.__chromeVt.ready = {
            types: vt.types ? [...vt.types] : [],
            face: styleOf('::view-transition-old(services-face)'),
            faceNew: styleOf('::view-transition-new(services-face)'),
            pill: styleOf('::view-transition-old(arrow-pill-left)'),
            pillNew: styleOf('::view-transition-new(arrow-pill-left)'),
            pairedFace: {
              group: anims.some((a) => a.pseudo === '::view-transition-group(services-face)'),
              old: anims.filter((a) => a.pseudo === '::view-transition-old(services-face)').map((a) => a.name),
              new: anims.filter((a) => a.pseudo === '::view-transition-new(services-face)').map((a) => a.name),
              pillOld: anims.filter((a) => a.pseudo === '::view-transition-old(arrow-pill-left)').map((a) => a.name),
              pillNew: anims.filter((a) => a.pseudo === '::view-transition-new(arrow-pill-left)').map((a) => a.name),
            },
          };
        } catch (err) {
          window.__chromeVt.ready = { error: String(err) };
        }
      }, (err) => { window.__chromeVt.ready = { error: String(err) }; });
    });
  });
  await shot.goto(`${BASE}/#about`, { waitUntil: 'load' });
  await shot.waitForFunction(() => document.querySelector('[data-arrow-nav]')?.dataset.screen === 'about', null, { timeout: 20000 });
  await shot.waitForTimeout(400);
  await Promise.all([
    shot.waitForURL('**/services/**', { timeout: 10000 }),
    shot.evaluate(() => {
      const link = document.createElement('a');
      link.href = '/services/';
      document.body.append(link);
      link.click();
      link.remove();
    }),
  ]);
  try {
    await shot.waitForFunction(() => window.__chromeVt && window.__chromeVt.ready, null, { timeout: 8000 });
  } catch (err) {
    const state = await shot.evaluate(() => ({ href: location.href, vt: window.__chromeVt || null }));
    throw new Error(`${label} never captured the transition: ${JSON.stringify(state)}`);
  }
  const got = await shot.evaluate(() => window.__chromeVt.ready);
  if (got.error) throw new Error(`${label} probe failed: ${got.error}`);
  await shot.close();
  const uaFade = (names) => (names || []).some((n) => String(n).includes('-ua-view-transition-fade') || String(n).includes('plus-lighter'));
  if (!got.pairedFace.group) failures.push(`${label}: services-face group did not pair`);
  if (!got.types.includes('chrome-shrink') && !got.types.includes('chrome-grow')) {
    failures.push(`${label}: missing chrome-shrink/grow type (got ${got.types.join(',') || 'none'})`);
  }
  if (got.face.mix === 'plus-lighter' || got.faceNew.mix === 'plus-lighter') failures.push(`${label}: face still uses plus-lighter`);
  if (got.pill.mix === 'plus-lighter' || got.pillNew.mix === 'plus-lighter') failures.push(`${label}: pills still use plus-lighter`);
  if (uaFade(got.pairedFace.old) || uaFade(got.pairedFace.new)) failures.push(`${label}: face still uses the UA fade (${got.pairedFace.old} / ${got.pairedFace.new})`);
  if (uaFade(got.pairedFace.pillOld) || uaFade(got.pairedFace.pillNew)) failures.push(`${label}: pills still use the UA fade (${got.pairedFace.pillOld} / ${got.pairedFace.pillNew})`);
  const pillHasIn = (got.pairedFace.pillNew || []).includes('vt-in');
  const pillHasOut = (got.pairedFace.pillOld || []).includes('vt-out');
  if (!pillHasOut || !pillHasIn) failures.push(`${label}: pills are not crossfading with vt-out/vt-in`);
  if (got.types.includes('chrome-shrink') && (got.face.opacity !== '1' || got.faceNew.opacity !== '0')) {
    failures.push(`${label}: shrink morph is not holding the old face (old ${got.face.opacity}, new ${got.faceNew.opacity})`);
  }
  if (label.startsWith('desktop') && !got.face.height.startsWith('360')) {
    failures.push(`${label}: face group did not start from the about size (${got.face.width} x ${got.face.height})`);
  }
};

await mid({ width: 1440, height: 900 }, 'desktop about→services');
await mid({ width: 390, height: 844 }, 'phone about→services');

await browser.close();
server.close();
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log('chrome-vt: ok');
