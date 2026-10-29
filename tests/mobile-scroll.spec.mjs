
import { webkit, chromium, devices } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = (process.env.BASE_URL || '').replace(/\/$/, '');
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const iphone = devices['iPhone 13'];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
};

function staticRoot() {
  const candidates = [
    join(ROOT, '.vercel', 'output', 'static'),
    join(ROOT, 'dist', 'client'),
    join(ROOT, 'dist'),
  ];
  for (const dir of candidates) {
    if (existsSync(join(dir, 'index.html'))) return dir;
  }
  return null;
}

async function ensureServer() {
  if (BASE) return { url: BASE, stop: async () => {} };
  const root = staticRoot();
  if (!root) {
    console.error('No built static files and no BASE_URL. Run npm run build first, or set BASE_URL.');
    process.exit(1);
  }
  const server = createServer((req, res) => {
    let path = decodeURIComponent((req.url || '/').split('?')[0]);
    if (path.endsWith('/')) path += 'index.html';
    const tryFiles = [
      join(root, path),
      join(root, path + '.html'),
      join(root, path, 'index.html'),
      join(root, path.replace(/\/$/, '') + '/index.html'),
    ];
    const file = tryFiles.find((f) => f.startsWith(root) && existsSync(f) && statSync(f).isFile());
    if (!file) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  await new Promise((resolve) => server.listen(4325, '127.0.0.1', resolve));
  console.log('serving', root, 'on http://127.0.0.1:4325');
  return {
    url: 'http://127.0.0.1:4325',
    stop: async () =>
      new Promise((resolve) => server.close(() => resolve())),
  };
}

async function launchTouchBrowser() {
  const opts = { ...iphone, hasTouch: true, isMobile: true };
  const hideVibrate = () => {
    try {
      Object.defineProperty(navigator, 'vibrate', { configurable: true, value: undefined });
    } catch {

    }
  };
  try {
    const browser = await webkit.launch();
    const context = await browser.newContext(opts);
    await context.addInitScript(hideVibrate);
    const page = await context.newPage();
    try {
      await page.context().newCDPSession(page);
      console.log('browser: webkit (iPhone 13, CDP touch)');
      return { browser, page, engine: 'webkit' };
    } catch {
      await browser.close();
    }
  } catch (err) {
    console.log('webkit unavailable:', err.message);
  }
  const browser = await chromium.launch();
  const context = await browser.newContext(opts);
  await context.addInitScript(hideVibrate);
  const page = await context.newPage();
  console.log('browser: chromium (iPhone 13, hasTouch, CDP touch, iOS haptic path)');
  return { browser, page, engine: 'chromium' };
}

async function swipe(page, x, y, dy = -520) {
  const startY = await page.evaluate(() => scrollY);
  const client = await page.context().newCDPSession(page);
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y, id: 1 }],
  });
  const steps = 16;
  for (let i = 1; i <= steps; i++) {
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y: y + (dy * i) / steps, id: 1 }],
    });
    await wait(12);
  }
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await wait(400);
  const after = await page.evaluate(() => scrollY);
  try {
    await client.detach();
  } catch {

  }
  return { startY, after, delta: after - startY };
}

async function boxOf(page, selector) {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`no box for ${selector}`);
  return box;
}

async function hitInfo(page, x, y) {
  return page.evaluate(
    ({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      if (!el) return { tag: null, switch: false };
      const input = el instanceof HTMLInputElement ? el : null;
      return {
        tag: el.tagName,
        switch: Boolean(input && input.hasAttribute('switch') && getComputedStyle(input).visibility !== 'hidden'),
      };
    },
    { x, y },
  );
}

async function run() {
  const server = await ensureServer();
  const { browser, page } = await launchTouchBrowser();
  const failures = [];

  try {
    await page.goto(server.url + '/', { waitUntil: 'networkidle', timeout: 120000 });
    await page.waitForSelector('.card .caption', { timeout: 30000 });
    await wait(500);

    const bloom = page.locator('.card', { has: page.locator('.caption', { hasText: 'Industrial Bloom' }) });
    const card = (await bloom.count()) ? bloom.first() : page.locator('.card:has(.caption)').first();
    await card.evaluate((el) => el.setAttribute('data-scroll-test', '1'));
    const cardSel = '.card[data-scroll-test="1"]';

    await page.locator(cardSel).scrollIntoViewIfNeeded();
    await wait(300);

    const frame = await boxOf(page, `${cardSel} .frame`);
    const caption = await boxOf(page, `${cardSel} .caption`);
    const gap = {
      x: caption.x + caption.width / 2,
      y: (frame.y + frame.height + caption.y) / 2,
    };
    const hit = await hitInfo(page, gap.x, gap.y);
    console.log(`  gap hit-test: <${hit.tag}> switchUnderFinger=${hit.switch}`);
    if (hit.switch) failures.push('image-caption gap has a checkbox switch under the finger');
    if (hit.tag === 'INPUT') failures.push(`image-caption gap hit INPUT`);

    const spots = ['image', 'image-caption gap', 'caption text', 'below caption'];
    for (const name of spots) {
      await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
      await page.locator(cardSel).scrollIntoViewIfNeeded();
      await wait(200);
      const frame2 = await boxOf(page, `${cardSel} .frame`);
      const caption2 = await boxOf(page, `${cardSel} .caption`);
      const c2 = {
        image: [frame2.x + frame2.width / 2, frame2.y + frame2.height * 0.55],
        'image-caption gap': [
          caption2.x + caption2.width / 2,
          (frame2.y + frame2.height + caption2.y) / 2,
        ],
        'caption text': [caption2.x + caption2.width / 2, caption2.y + caption2.height / 2],
        'below caption': [caption2.x + caption2.width / 2, caption2.y + caption2.height + 36],
      }[name];

      const result = await swipe(page, c2[0], c2[1], -520);
      const ok = Math.abs(result.delta) > 24;
      console.log(
        `  homepage ${name}: scrollY ${result.startY.toFixed(0)} → ${result.after.toFixed(0)} (Δ ${result.delta.toFixed(1)}) ${ok ? 'OK' : 'FAIL'}`,
      );
      if (!ok) failures.push(`homepage ${name} did not scroll`);
      if (!/\/$/.test(new URL(page.url()).pathname) && !page.url().includes('/?')) {
        await page.goto(server.url + '/', { waitUntil: 'networkidle' });
        await page.waitForSelector(cardSel);
        await wait(300);
      }
    }

    const href = await page.locator(`${cardSel} a[href^="/work/"]`).first().getAttribute('href');
    await page.goto(server.url + href, { waitUntil: 'networkidle', timeout: 120000 });
    await page.waitForSelector('.project');

    for (const [name, sel, bias] of [
      ['project image', '.project .frame', 0.4],
      ['project text', '.project .summary, .project-hero .summary, .project-hero', 0.5],
    ]) {
      await page.evaluate(() => scrollTo({ top: 60, behavior: 'instant' }));
      await wait(100);
      const b = await boxOf(page, sel);
      const result = await swipe(page, b.x + b.width / 2, b.y + b.height * bias, -520);
      const ok = Math.abs(result.delta) > 24;
      console.log(
        `  ${name}: scrollY ${result.startY.toFixed(0)} → ${result.after.toFixed(0)} (Δ ${result.delta.toFixed(1)}) ${ok ? 'OK' : 'FAIL'}`,
      );
      if (!ok) failures.push(`${name} did not scroll`);
    }
  } finally {
    await browser.close();
    await server.stop();
  }

  if (failures.length) {
    console.error('mobile-scroll FAILED:');
    for (const f of failures) console.error('  -', f);
    process.exit(1);
  }
  console.log('mobile-scroll OK');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
