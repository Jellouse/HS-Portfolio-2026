// About <-> services must fly the pills with travel(), the same live
// animation every other arrow button uses, and never overlay two document
// view-transition snapshots of a pill (the iOS Safari stacked-label bug).
//
// Runs in WebKit and Chromium at a phone and a desktop size.
// npm run build && npm run test:about-services
// EVIDENCE=/some/dir also saves mid-flight screenshots.
import { chromium, webkit } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const EVIDENCE = process.env.EVIDENCE || '';
if (EVIDENCE) mkdirSync(EVIDENCE, { recursive: true });
const failures = [];
const must = (ok, message) => {
  if (!ok) failures.push(message);
};

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
await new Promise((r) => server.listen(4349, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:4349';

// Records every frame: each visible pill or flying clone, its label, opacity
// and box. Also records whether a document view transition actually ran.
const probe = () => {
  window.__vt = [];
  addEventListener('pagereveal', (e) => {
    const vt = e.viewTransition;
    if (!vt) return window.__vt.push('none');
    vt.ready.then(() => window.__vt.push('ran'), () => window.__vt.push('skipped'));
  });
  window.__frames = [];
  window.__sampling = false;
  // Frames from the page just left survive the document swap.
  window.__prevFrames = JSON.parse(sessionStorage.getItem('__frames') || '[]');
  sessionStorage.removeItem('__frames');
  addEventListener('pagehide', () => {
    sessionStorage.setItem('__frames', JSON.stringify(window.__frames));
    window.__sampling = false;
  });
  addEventListener('pageshow', (e) => {
    window.__persisted = e.persisted;
    if (e.persisted && sessionStorage.getItem('__autoSample')) window.__startSampling();
  });
  const sample = () => {
    if (!window.__sampling) return;
    const els = [...document.querySelectorAll('.arrow-nav .arrow-pill, .arrow-nav .arrow-flight')];
    const opacity = (el) => {
      let o = 1;
      for (let n = el; n && n !== document.documentElement; n = n.parentElement) o *= Number(getComputedStyle(n).opacity);
      return o;
    };
    const face = document.querySelector('.arrow-nav .arrow-face-scale')?.getBoundingClientRect();
    const hubX = face ? face.left + face.width / 2 : innerWidth / 2;
    const hubY = face ? face.top + face.height / 2 : innerHeight / 2;
    // travel() clips each control to the half-plane on its side of the face.
    const clip = (side, r) => {
      const b = { l: r.left, t: r.top, r: r.right, b: r.bottom };
      if (side === 'left') b.r = Math.min(b.r, hubX);
      if (side === 'right') b.l = Math.max(b.l, hubX);
      if (side === 'up') b.b = Math.min(b.b, hubY);
      if (side === 'down') b.t = Math.max(b.t, hubY);
      return b;
    };
    const rest = (el) => {
      if (!el || el.hidden) return null;
      const r = el.getBoundingClientRect();
      return { l: Math.round(r.left), t: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), text: el.textContent.replace(/\s+/g, ' ').trim() };
    };
    const nav = document.querySelector('.arrow-nav');
    window.__frames.push({
      t: performance.now(),
      screen: nav?.dataset.screen || '',
      chrome: nav && {
        face: rest(nav.querySelector('.arrow-face-scale')),
        back: rest(nav.querySelector('.arrow-back')),
        left: rest(nav.querySelector('.arrow-pill[data-dir="left"]')),
        right: rest(nav.querySelector('.arrow-pill[data-dir="right"]')),
      },
      pills: els
        .filter((el) => !el.hidden && el.getClientRects().length)
        .map((el) => {
          const r = el.getBoundingClientRect();
          const side = el.dataset.dir || el.dataset.ghostDir || '';
          return {
            side,
            clone: el.classList.contains('arrow-flight'),
            label: [...el.querySelectorAll('[data-nav-label]')].filter((s) => !s.hidden).map((s) => s.textContent.trim()).join('|') || el.textContent.trim(),
            opacity: opacity(el),
            box: clip(side, r),
          };
        }),
    });
    requestAnimationFrame(sample);
  };
  window.__startSampling = () => {
    window.__frames = [];
    window.__sampling = true;
    requestAnimationFrame(sample);
  };
  if (sessionStorage.getItem('__autoSample')) {
    sessionStorage.removeItem('__autoSample');
    window.__startSampling();
  }
};

const chromeRects = (page) =>
  page.evaluate(() => {
    const nav = document.querySelector('[data-arrow-nav], [data-services-hub]');
    const box = (el) => {
      if (!el || el.hidden) return null;
      const r = el.getBoundingClientRect();
      return { l: Math.round(r.left), t: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), text: el.textContent.replace(/\s+/g, ' ').trim() };
    };
    return {
      face: box(nav.querySelector('.arrow-face-scale')),
      back: box(nav.querySelector('.arrow-back')),
      left: box(nav.querySelector('.arrow-pill[data-dir="left"]')),
      right: box(nav.querySelector('.arrow-pill[data-dir="right"]')),
    };
  });

const overlap = (a, b) =>
  a.r <= a.l || a.b <= a.t || b.r <= b.l || b.b <= b.t ? 0 : Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));

// Two different labels, both visible, on top of each other is the bug.
const checkFrames = (frames, tag) => {
  must(frames.length > 5, `${tag}: only ${frames.length} frames sampled`);
  let worst = null;
  let pairs = 0;
  frames.forEach((frame, i) => {
    const seen = frame.pills.filter((p) => p.opacity > 0.08 && p.label);
    for (const p of seen) {
      must(!p.label.includes('|'), `${tag}: one pill shows two labels at frame ${i}: ${p.label}`);
    }
    for (let a = 0; a < seen.length; a++) {
      for (let b = a + 1; b < seen.length; b++) {
        const A = seen[a];
        const B = seen[b];
        if (A.label === B.label) continue;
        if (A.clone || B.clone) pairs += 1;
        const area = overlap(A.box, B.box);
        const smaller = Math.max(1, Math.min(Math.max(0, A.box.r - A.box.l) * Math.max(0, A.box.b - A.box.t), Math.max(0, B.box.r - B.box.l) * Math.max(0, B.box.b - B.box.t)));
        const share = area / smaller;
        if (!worst || share > worst.share) worst = { share, i, a: A.label, b: B.label };
      }
    }
  });
  must(pairs > 0, `${tag}: no departing clone was seen next to an arriving pill, so the pills did not fly with travel()`);
  must(!worst || worst.share < 0.05, `${tag}: "${worst?.a}" and "${worst?.b}" overlap ${Math.round((worst?.share ?? 0) * 100)}% at frame ${worst?.i}`);
  return worst;
};

const near = (a, b, key) => !a || !b || Math.abs(a[key] - b[key]) <= 2;

const tap = async (page, selector) => {
  const box = await page.locator(selector).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.up();
};

const run = async (type, engine, size, label) => {
  const browser = await engine.launch();
  const context = await browser.newContext({
    viewport: size,
    deviceScaleFactor: 2,
    hasTouch: false,
    ...(EVIDENCE ? { recordVideo: { dir: join(EVIDENCE, `${type}-${label}-video`), size } } : {}),
  });
  const page = await context.newPage();
  await page.addInitScript(probe);
  const tag = `${type} ${label}`;
  await page.goto(`${BASE}/#about`, { waitUntil: 'load' });
  await page.waitForSelector('[data-arrow-nav][data-screen="about"].is-controls');
  await page.waitForTimeout(600);
  const about = await chromeRects(page);
  must(about.left?.text === 'Services' && about.right?.text === 'Contact', `${tag}: about pills read ${about.left?.text} / ${about.right?.text}`);

  // About to services.
  await page.evaluate(() => window.__startSampling());
  const left = '[data-arrow-nav] .arrow-pill[data-dir="left"]';
  const t0 = Date.now();
  const navigated = page.waitForURL(/\/services\/$/, { timeout: 8000 });
  await tap(page, left);
  if (EVIDENCE) {
    await page.waitForTimeout(120);
    await page.screenshot({ path: join(EVIDENCE, `${type}-${label}-to-services-120ms.png`) }).catch(() => {});
    await page.waitForTimeout(110);
    await page.screenshot({ path: join(EVIDENCE, `${type}-${label}-to-services-230ms.png`) }).catch(() => {});
  } else await page.waitForTimeout(200);
  await navigated;
  const flightMs = Date.now() - t0;
  must(flightMs >= 350, `${tag}: /services/ opened ${flightMs}ms after the press, before the pills could fly`);
  await page.waitForSelector('[data-services-hub]');
  const frames = await page.evaluate(() => window.__prevFrames);
  checkFrames(frames, `${tag} about->services`);
  await page.waitForTimeout(700);
  const vtTo = await page.evaluate(() => window.__vt);
  must(!vtTo.includes('ran'), `${tag}: a document view transition ran into /services/ (${vtTo.join(',')})`);
  const hub = await chromeRects(page);
  must(!!hub.left?.text && !!hub.right?.text, `${tag}: a hub pill is missing`);

  // Back to about.
  // A back step either restores the page from the bfcache or reloads it.
  // Either way the home page starts sampling as soon as it shows.
  await page.evaluate(() => sessionStorage.setItem('__autoSample', '1'));
  const back = page.waitForURL(/\/#about$/, { timeout: 8000 });
  await tap(page, '[data-services-hub] .arrow-back');
  await back;
  if (EVIDENCE) {
    await page.waitForTimeout(160);
    await page.screenshot({ path: join(EVIDENCE, `${type}-${label}-to-about-mid.png`) }).catch(() => {});
  }
  await page.waitForSelector('[data-arrow-nav][data-screen="about"]', { timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(800);
  const backFrames = await page.evaluate(() => window.__frames);
  const vtBack = await page.evaluate(() => window.__vt);
  const persisted = await page.evaluate(() => window.__persisted);
  must(!vtBack.includes('ran'), `${tag}: a document view transition ran back to about (${vtBack.join(',')})`);
  const screen = await page.evaluate(() => document.querySelector('[data-arrow-nav]')?.dataset.screen);
  must(screen === 'about', `${tag}: back from services landed on ${screen}`);
  const after = await chromeRects(page);
  must(after.left?.text === 'Services' && after.right?.text === 'Contact', `${tag}: after back the pills read ${after.left?.text} / ${after.right?.text}`);
  checkFrames(backFrames, `${tag} services->about`);

  // The home page's services screen is laid out like /services/, so the
  // document swap shows no jump. The last frame before the swap is the
  // home page at rest on that screen.
  const homeHub = frames[frames.length - 1]?.chrome || {};
  must(frames[frames.length - 1]?.screen === 'services', `${tag}: the home page left on ${frames[frames.length - 1]?.screen}, not its services screen`);
  for (const key of ['face', 'back', 'left', 'right']) {
    for (const axis of ['l', 't', 'w', 'h']) {
      must(near(homeHub[key], hub[key], axis), `${tag}: ${key}.${axis} is ${homeHub[key]?.[axis]} on the home services screen but ${hub[key]?.[axis]} on /services/`);
    }
    if (key === 'left' || key === 'right') must(homeHub[key]?.text === hub[key]?.text, `${tag}: ${key} label ${homeHub[key]?.text} vs ${hub[key]?.text}`);
  }
  console.log(`${tag}: ok, ${frames.length} + ${backFrames.length} frames, flight ${flightMs}ms, vt ${vtTo.join(',') || '-'} / ${vtBack.join(',') || '-'}, bfcache ${persisted}`);
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
console.log('about-services flight: pass');
