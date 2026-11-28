import { chromium, webkit } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4',
  '.avif': 'image/avif',
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
await new Promise((r) => server.listen(4351, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:4351';

const failures = [];
const must = (ok, message) => {
  if (!ok) failures.push(message);
};

const ready = (page) =>
  page.waitForFunction(
    () => {
      const nav = document.querySelector('[data-arrow-nav]');
      return nav && nav.classList.contains('is-controls') && !nav.classList.contains('is-intro');
    },
    null,
    { timeout: 25000 },
  );

const stepIs = (page, step) =>
  page.waitForFunction((want) => document.querySelector('.contact-panel')?.dataset.step === want, step, {
    timeout: 6000,
  });

const focusedOn = (page, selector) =>
  page.waitForFunction((want) => !!document.activeElement?.matches(want), selector, { timeout: 6000 });

const openWithKeyboard = async (page) => {
  await page.focus('[data-dir="down"]');
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-contact]', { timeout: 8000 });
  await stepIs(page, '1');
  await focusedOn(page, '.contact-option');
};

const run = async (engine, type, size, label) => {
  const browser = await engine.launch();
  const context = await browser.newContext({
    viewport: size,
    deviceScaleFactor: 2,
    ...(type === 'mobile' ? { isMobile: true, hasTouch: true } : {}),
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const tag = `${label} ${type}`;

  await page.goto(`${BASE}/`, { waitUntil: 'load' });
  await ready(page);

  const down = await page.evaluate(() => {
    const el = document.querySelector('[data-arrow-nav] [data-dir="down"]');
    return el ? el.textContent.replace(/\s+/g, ' ').trim() : null;
  });
  must(down === 'Contact', `${tag}: the landing down button reads ${down}, not Contact`);

  await openWithKeyboard(page);

  const step1 = await page.evaluate(() => {
    const panel = document.querySelector('.contact-panel');
    const rows = [...panel.querySelectorAll('.contact-options-row')];
    const first = rows[0].getBoundingClientRect();
    const last = rows[rows.length - 1].getBoundingClientRect();
    return {
      screen: document.querySelector('[data-arrow-nav]:not(.contact-hub)')?.dataset.screen,
      title: panel.querySelector('.contact-ask-title')?.textContent?.trim(),
      shape: rows.map((row) => row.children.length).join('-'),
      centred: Math.abs(first.left + first.width / 2 - (last.left + last.width / 2)) <= 1,
      labels: [...panel.querySelectorAll('.contact-option')].map((el) => el.textContent.trim()),
      active: document.activeElement?.className || '',
      scrollWidth: document.documentElement.scrollWidth,
      viewport: innerWidth,
      back: !!panel.querySelector('.arrow-back'),
      next: !!panel.querySelector('[data-contact-down]'),
      nextOff: panel.querySelector('[data-contact-down]')?.disabled,
      nextShown: (() => {
        const el = panel.querySelector('[data-contact-down]');
        return el ? getComputedStyle(el).display !== 'none' : false;
      })(),
    };
  });
  must(step1.screen === 'landing', `${tag}: opening Contact left the landing on ${step1.screen}`);
  must(step1.title === 'What can i help you with?', `${tag}: step 1 title is ${step1.title}`);
  must(step1.shape === '3-2-1', `${tag}: step 1 rows are ${step1.shape}, not 3-2-1`);
  must(step1.centred, `${tag}: the pyramid rows are not centred on each other`);
  must(
    step1.labels.join('|') === 'Retail store|Prototype|3D Printing|3D Render|Website|Other',
    `${tag}: options read ${step1.labels.join('|')}`,
  );
  must(step1.active.includes('contact-option'), `${tag}: focus did not land on an option`);
  must(step1.back, `${tag}: step 1 is missing its back control`);
  if (type === 'mobile') {
    must(!step1.nextShown, `${tag}: step 1 still shows Next on mobile`);
  } else {
    must(step1.next && step1.nextShown, `${tag}: step 1 is missing its next control`);
  }
  must(step1.nextOff === false, `${tag}: Next is off while an option is already chosen`);
  must(step1.scrollWidth <= step1.viewport, `${tag}: step 1 overflows sideways (${step1.scrollWidth} > ${step1.viewport})`);

  if (type === 'mobile') {
    const original = page.viewportSize();
    for (const wide of [320, 360, 390, 430]) {
      await page.setViewportSize({ width: wide, height: original.height });
      const fit = await page.evaluate(() => {
        const option = document.querySelector('.contact-option');
        const pills = [...document.querySelectorAll('.contact-option')].map((el) => el.getBoundingClientRect());
        const row = pills.slice(0, 3);
        const left = Math.min(...row.map((p) => p.left));
        const right = Math.max(...row.map((p) => p.right));
        return {
          left,
          right,
          vw: innerWidth,
          fs: getComputedStyle(option).fontSize,
          ok: left >= -0.5 && right <= innerWidth + 0.5 && document.documentElement.scrollWidth <= innerWidth,
        };
      });
      must(fit.ok, `${tag}: step 1 clips at ${wide} (left ${fit.left.toFixed(1)}, right ${fit.right.toFixed(1)}, vw ${fit.vw})`);
      const wantFs = wide <= 329 ? '14px' : wide <= 359 ? '16px' : '18px';
      must(fit.fs === wantFs, `${tag}: step 1 type is ${fit.fs} at ${wide}, not ${wantFs}`);
    }
    await page.setViewportSize(original);
  }

  // Arrow keys walk the pyramid: along a row, then to the nearest button in the row above or below.
  const order = [];
  for (const key of ['ArrowRight', 'ArrowRight', 'ArrowDown', 'ArrowDown', 'ArrowUp', 'ArrowLeft']) {
    await page.keyboard.press(key);
    await page.waitForTimeout(90);
    order.push(await page.evaluate(() => document.activeElement?.textContent?.trim()));
  }
  must(
    order.join('|') === 'Prototype|3D Printing|Website|Other|3D Render|Website',
    `${tag}: arrow keys visited ${order.join('|')}`,
  );

  const focused = await page.evaluate(async () => {
    const el = document.activeElement;
    const settle = () =>
      new Promise((done) => {
        const started = performance.now();
        const tick = () => {
          if (getComputedStyle(el).backgroundColor === 'rgb(183, 6, 6)' || performance.now() - started > 800) done();
          else requestAnimationFrame(tick);
        };
        tick();
      });
    await settle();
    const s = getComputedStyle(el);
    return { bg: s.backgroundColor, color: s.color, focusVisible: el.matches(':focus-visible') };
  });
  must(focused.focusVisible, `${tag}: the walked-to option is not focus-visible`);
  must(
    focused.bg === 'rgb(183, 6, 6)' && focused.color === 'rgb(255, 255, 255)',
    `${tag}: keyboard focus paints ${focused.bg} on ${focused.color}, not red on white`,
  );

  // Enter confirms the highlight and moves on.
  await page.keyboard.press('Enter');
  await stepIs(page, '2');
  await focusedOn(page, '#contact-project');

  // Backspace walks back and puts focus on the chosen option.
  await page.keyboard.press('Backspace');
  await stepIs(page, '1');
  await focusedOn(page, '.contact-option');
  must(
    (await page.evaluate(() => document.activeElement?.textContent?.trim())) === 'Website',
    `${tag}: going back did not return focus to the chosen option`,
  );

  // A click or a tap moves on at once.
  const started = Date.now();
  if (type === 'mobile') await page.tap('[data-service="Other"]');
  else await page.click('[data-service="Other"]');
  await stepIs(page, '2');
  await focusedOn(page, '#contact-project');
  const took = Date.now() - started;
  must(took < 1200, `${tag}: choosing an option took ${took}ms to reach step 2`);

  // Back from step 1 closes.
  await page.keyboard.press('Backspace');
  await stepIs(page, '1');
  await page.click('[data-contact] .arrow-back');
  await page
    .waitForFunction(() => document.querySelector('.contact-panel')?.dataset.state === 'closed', null, { timeout: 8000 });
  must(
    await page.evaluate(() => document.querySelector('.contact-panel')?.dataset.state === 'closed'),
    `${tag}: Back on step 1 left the drawer open`,
  );

  // Services keeps its page and its two build pills.
  await page.goto(`${BASE}/services/`, { waitUntil: 'load' });
  await page.waitForSelector('[data-services-hub] .arrow-face-scale', { timeout: 15000 });
  must(
    !!(await page.evaluate(() => document.querySelector('[data-services-hub] .arrow-pill[data-dir="left"]'))),
    `${tag}: the services hub lost its left control`,
  );
  must(
    (await page.evaluate(() => [...document.querySelectorAll('[data-services-hub] .arrow-pill')].length)) === 2,
    `${tag}: the services hub no longer offers both builds`,
  );

  must(!errors.length, `${tag}: page errors ${errors.join(' | ')}`);
  console.log(`${tag}: ok, arrows ${order.join(' ')}`);
  await context.close();
  await browser.close();
};

const sizes = [
  [{ width: 390, height: 844 }, 'phone'],
  [{ width: 1440, height: 900 }, 'desktop'],
];
for (const [type, engine] of [
  ['desktop', chromium],
  ['mobile', chromium],
  ['desktop', webkit],
  ['mobile', webkit],
].filter(([t]) => !process.env.ONLY || process.env.ONLY === t)) {
  for (const [size, label] of sizes) {
    try {
      await run(engine, type, size, label);
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
console.log('contact-ask: pass');
