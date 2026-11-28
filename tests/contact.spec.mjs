import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2' };
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
await new Promise((r) => server.listen(4355, '127.0.0.1', r));
const browser = await chromium.launch();
const failures = [];
const check = (ok, label) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`); if (!ok) failures.push(label); };
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
let posted = null;
await page.route('**/api/contact', (route) => { posted = JSON.parse(route.request().postData()); route.fulfill({ json: { ok: true } }); });
await page.goto('http://127.0.0.1:4355/', { waitUntil: 'load' });
await page.waitForFunction(() => {
  const nav = document.querySelector('[data-arrow-nav]');
  return nav && nav.classList.contains('is-controls') && !nav.classList.contains('is-intro');
}, null, { timeout: 25000 });
await page.waitForTimeout(500);
const layoutBefore = await page.evaluate(() => {
  const grid = document.querySelector('.page-grid');
  return grid ? Math.round(grid.getBoundingClientRect().left) : 0;
});
await page.click('[data-arrow-nav] [data-dir="down"]');
await page.waitForSelector('[data-contact]', { timeout: 8000 });
await page.waitForTimeout(400);
const layoutAfter = await page.evaluate(() => {
  const grid = document.querySelector('.page-grid');
  return grid ? Math.round(grid.getBoundingClientRect().left) : 0;
});
check(Math.abs(layoutBefore - layoutAfter) <= 1, `opening contact does not shift page (was ${layoutBefore}, now ${layoutAfter})`);
const panel = await page.evaluate(() => {
  const el = document.querySelector('.contact-panel');
  const r = el.getBoundingClientRect();
  return {
    top: Math.round(r.top),
    height: Math.round(r.height),
    question: el.querySelector('.contact-ask-title')?.textContent?.trim(),
    options: el.querySelectorAll('.contact-option').length,
    rows: [...el.querySelectorAll('.contact-options-row')].map((row) => row.children.length),
  };
});
check(panel.top === 0 && panel.height === 900, `hub fills the viewport (y=${panel.top}, h=${panel.height})`);
check(panel.question === 'What can i help you with?', `step 1 asks the question (${panel.question})`);
check(panel.options === 6 && panel.rows.join('') === '321', `step 1 is a 3-2-1 pyramid (${panel.rows.join('-')})`);

const chrome = await page.evaluate(() => {
  const mid = (el) => {
    const b = el.getBoundingClientRect();
    return b.top + b.height / 2;
  };
  const back = document.querySelector('.contact-hub .arrow-back');
  const next = document.querySelector('.contact-hub .arrow-pill[data-dir="down"]');
  const ask = document.querySelector('.contact-ask');
  const askBox = ask.getBoundingClientRect();
  return {
    back: mid(back),
    next: mid(next),
    above: askBox.top / 2,
    below: (askBox.bottom + innerHeight) / 2,
  };
});
check(
  Math.abs(chrome.back - chrome.above) <= 2,
  `Back sits in the middle of the space above the ask (${chrome.back.toFixed(1)} vs ${chrome.above.toFixed(1)})`,
);
check(
  Math.abs(chrome.next - chrome.below) <= 2,
  `Next sits in the middle of the space below the ask (${chrome.next.toFixed(1)} vs ${chrome.below.toFixed(1)})`,
);

// The options are the same pill as Next: full control height, full radius.
const sizes = await page.evaluate(() => {
  const round = (n) => Math.round(n);
  const read = (el) => {
    const b = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return { w: round(b.width), h: round(b.height), radius: round(parseFloat(cs.borderRadius)) };
  };
  const options = [...document.querySelectorAll('.contact-option')].map(read);
  const next = read(document.querySelector('.contact-hub .arrow-pill[data-dir="down"]'));
  return { options, next };
});
check(
  sizes.options.every((o) => o.h === sizes.next.h),
  `options are the control height, like Next (${sizes.options.map((o) => o.h).join(',')} vs ${sizes.next.h})`,
);
check(
  sizes.options.every((o) => o.radius * 2 === o.h) && sizes.next.radius * 2 === sizes.next.h,
  `options are true pills, half the height (r ${sizes.options[0].radius}, h ${sizes.options[0].h})`,
);

// The selected option keeps those rounded ends: a global focus rule used to
// square it to 2px.
await page.focus('[data-service="Prototype"]');
await page.keyboard.press('ArrowRight');
await page.keyboard.press('ArrowLeft');
// The fill crossfades over --dur-hover, so let it land before reading the colour.
await page.waitForTimeout(320);
const selected = await page.evaluate(() => {
  const el = document.activeElement;
  const cs = getComputedStyle(el);
  const b = el.getBoundingClientRect();
  return {
    isOption: el.classList.contains('contact-option'),
    radius: Math.round(parseFloat(cs.borderRadius)),
    h: Math.round(b.height),
    bg: cs.backgroundColor,
  };
});
check(
  selected.isOption && selected.radius * 2 === selected.h,
  `the selected option keeps its rounded ends (r ${selected.radius}, h ${selected.h})`,
);
check(selected.bg === 'rgb(183, 6, 6)', `the selected option is filled red (${selected.bg})`);

// Nothing is chosen on open, so Next is off until you pick. Checked on a fresh
// open, because the checks above have already moved the selection.
await page.keyboard.press('Escape');
await page.waitForFunction(() => document.querySelector('.contact-panel')?.dataset.state === 'closed', null, { timeout: 5000 }).catch(() => {});
await page.click('[data-arrow-nav] [data-dir="down"]');
await page.waitForFunction(() => document.querySelector('.contact-panel')?.dataset.state === 'open', null, { timeout: 8000 });
await page.waitForTimeout(600);
const fresh = await page.evaluate(() => ({
  disabled: document.querySelector('[data-contact-down]').disabled,
  chosen: document.querySelectorAll('.contact-option[data-chosen]').length,
}));
check(fresh.disabled && fresh.chosen === 0, 'Next is off until an option is picked');

// Every option starts plain. The pointer is still over the landing's Down
// button when the form opens, and that used to light up the option underneath.
// Opened with the keyboard above, so focus is visible; that ring is correct and
// is not the "part selected" state. What must not happen is a fill.
const landing = await page.evaluate(() => {
  const opts = [...document.querySelectorAll('.contact-option')];
  return {
    filled: opts.filter((o) => o.hasAttribute('data-chosen')).length,
    hoverArmed: document.querySelector('.contact-hub').hasAttribute('data-pointer'),
  };
});
check(landing.filled === 0, 'no option starts filled in');
check(!landing.hoverArmed, 'hover is not armed until the pointer moves in the form');

// Opened by a plain mouse click, nothing is even tinted.
const clean = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await clean.goto('http://127.0.0.1:4355/', { waitUntil: 'load' });
await clean.waitForFunction(() => {
  const nav = document.querySelector('[data-arrow-nav]');
  return nav && nav.classList.contains('is-controls') && !nav.classList.contains('is-intro');
}, null, { timeout: 25000 });
await clean.waitForTimeout(500);
await clean.click('[data-arrow-nav] [data-dir="down"]');
await clean.waitForSelector('[data-contact]');
await clean.waitForTimeout(900);
const plain = await clean.evaluate(() => {
  const opts = [...document.querySelectorAll('.contact-option')];
  return {
    bgs: [...new Set(opts.map((o) => getComputedStyle(o).backgroundColor))],
    focusVisible: opts.filter((o) => o.matches(':focus-visible')).length,
  };
});
check(plain.bgs.length === 1, `a mouse open shows every option in the default state (${plain.bgs.join(' | ')})`);
check(plain.focusVisible === 0, `a mouse open shows no focus ring (${plain.focusVisible})`);
await clean.close();

// The ask box has to be as wide as its own pills, or the step transition
// snapshot clips their ends.
const fit = await page.evaluate(() => {
  const ask = document.querySelector('.contact-ask').getBoundingClientRect();
  const pills = [...document.querySelectorAll('.contact-option')].map((p) => p.getBoundingClientRect());
  return {
    left: Math.round(ask.left - Math.min(...pills.map((p) => p.left))),
    right: Math.round(Math.max(...pills.map((p) => p.right)) - ask.right),
  };
});
check(
  fit.left <= 0 && fit.right <= 0,
  `no pill hangs outside the box the transition snapshots (left ${fit.left}, right ${fit.right})`,
);

// Left and Right walk every option in reading order, carrying on into the next
// row once a row runs out, and wrapping at the ends. Landing on one picks it.
const walk = async (key, steps) => {
  const seen = [];
  for (let i = 0; i < steps; i++) {
    await page.keyboard.press(key);
    await page.waitForTimeout(60);
    seen.push(await page.evaluate(() => `${document.activeElement.textContent}|${document.activeElement.dataset.row}`));
  }
  return seen;
};
await page.evaluate(() => document.querySelector('[data-service="Retail store"]').focus());
const order = await page.evaluate(() => [...document.querySelectorAll('.contact-option')].map((o) => `${o.textContent}|${o.dataset.row}`));
const forwards = await walk('ArrowRight', order.length - 1);
check(
  forwards.join(',') === order.slice(1).join(','),
  `Right takes every option in reading order, row to row (${forwards.length} steps)`,
);
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(60);
const wrapped = await page.evaluate(() => `${document.activeElement.textContent}|${document.activeElement.dataset.row}`);
check(wrapped === order[0], `Right wraps from the last option to the first (${wrapped})`);

const backwards = await walk('ArrowLeft', order.length - 1);
check(
  backwards.join(',') === order.slice(1).reverse().join(','),
  `Left retraces the same order (${backwards.length} steps to ${backwards[backwards.length - 1]})`,
);
// From the first option, one Left wraps straight to the last.
await page.evaluate(() => document.querySelector('[data-service="' + [...document.querySelectorAll('.contact-option')][0].dataset.service + '"]').focus());
await page.keyboard.press('ArrowLeft');
await page.waitForTimeout(60);
const wrappedBack = await page.evaluate(() => `${document.activeElement.textContent}|${document.activeElement.dataset.row}`);
check(wrappedBack === order[order.length - 1], `Left wraps back to the last option (${wrappedBack})`);

// Up and Down never change the choice. They press the Back and Next controls.
const chosenBefore = await page.evaluate(() => document.querySelector('.contact-option[data-chosen]')?.textContent);
await page.keyboard.down('ArrowUp');
await page.waitForTimeout(100);
const upPressed = await page.evaluate(() => document.querySelector('.is-pressed')?.className);
await page.keyboard.up('ArrowUp');
await page.waitForTimeout(300);
// Up on step 1 is the way out of the form, so reopen if it closed.
const afterUpOpen = await page.evaluate(() => document.querySelector('.contact-panel')?.dataset.state);
check(
  String(upPressed).includes('arrow-back'),
  `Up presses Back (${upPressed})`,
);
if (afterUpOpen !== 'open') {
  await page.click('[data-arrow-nav] [data-dir="down"]');
  await page.waitForFunction(() => document.querySelector('.contact-panel')?.dataset.state === 'open', null, { timeout: 8000 });
  await page.waitForTimeout(300);
}
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(200);
const chosenNow = await page.evaluate(() => document.querySelector('.contact-option[data-chosen]')?.textContent);
check(chosenNow !== chosenBefore || chosenNow !== null, `Right picks an option (${chosenNow})`);
check(
  !(await page.isDisabled('[data-contact-down]')),
  'Next comes alive once an option is picked',
);
await page.keyboard.down('ArrowDown');
await page.waitForTimeout(100);
const downPressed = await page.evaluate(() => document.querySelector('.is-pressed')?.className);
await page.keyboard.up('ArrowDown');
await page.waitForFunction(() => !document.documentElement.hasAttribute('data-chrome-vt-run'), null, { timeout: 2000 }).catch(() => {});
await page.waitForTimeout(300);
check(String(downPressed).includes('arrow-pill'), `Down presses Next (${downPressed})`);
check(await page.isVisible('#contact-project'), 'Down goes on to step 2');

// Going back remembers what was picked.
await page.keyboard.down('ArrowUp');
await page.waitForTimeout(80);
await page.keyboard.up('ArrowUp');
await page.waitForFunction(() => !document.documentElement.hasAttribute('data-chrome-vt-run'), null, { timeout: 2000 }).catch(() => {});
await page.waitForTimeout(300);
check(
  (await page.evaluate(() => document.querySelector('.contact-option[data-chosen]')?.textContent)) === chosenNow,
  'coming back keeps the choice',
);

// Park the pointer clear of the options: it was left over "Other" by the clicks
// above, and a later click lands on whichever option is under it.
await page.mouse.move(5, 880);

// Opening fades in. The panel used to appear at full opacity because it was
// created hidden, so its animation never started.
await page.keyboard.press('Escape');
await page.waitForFunction(() => document.querySelector('.contact-panel')?.dataset.state === 'closed', null, { timeout: 5000 }).catch(() => {});
await page.click('[data-arrow-nav] [data-dir="down"]');
const fade = await page.evaluate(async () => {
  const seen = [];
  for (let i = 0; i < 24; i++) {
    await new Promise((r) => requestAnimationFrame(r));
    const el = document.querySelector('.contact-panel');
    if (!el) continue;
    seen.push(Number(getComputedStyle(el).opacity));
  }
  return seen;
});
const faded = fade.some((o) => o < 0.95) && fade[fade.length - 1] > 0.95;
check(faded, `the panel fades in (${fade.slice(0, 5).map((o) => o.toFixed(2)).join(' ')} ...)`);

await page.click('[data-service="Retail store"]');
await page.waitForFunction(() => !document.documentElement.hasAttribute('data-chrome-vt-run'), null, { timeout: 2000 }).catch(() => {});
check(await page.isVisible('#contact-project'), 'picking an option goes to step 2');
check(await page.isDisabled('[data-contact-down]'), 'Next is off while the project is empty');
check(await page.isVisible('[data-contact-back]'), 'Back control is visible on step 2');

// A one-line field is the control height with half that as its radius, so the
// ends are fully round like the buttons.
const field = await page.evaluate(() => {
  const el = document.querySelector('.contact-field:not([hidden])');
  const b = el.getBoundingClientRect();
  return { h: Math.round(b.height), r: Math.round(parseFloat(getComputedStyle(el).borderRadius)) };
});
check(
  field.r * 2 === field.h,
  `the project field is a pill at one line (h ${field.h}, r ${field.r})`,
);
await page.fill('#contact-project', 'A shop fit-out');
await page.keyboard.press('Enter');
await page.waitForFunction(() => !document.documentElement.hasAttribute('data-chrome-vt-run'), null, { timeout: 2000 }).catch(() => {});
check(await page.isVisible('#contact-email'), 'Enter goes to step 3');
await page.fill('#contact-email', 'a@b.co');
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
check(posted?.service === 'Retail store' && posted?.project === 'A shop fit-out' && posted?.email === 'a@b.co', 'submit posts all answers');
check((await page.textContent('[data-contact-msg]')).includes('Thank you'), 'thank-you shows');
check(await page.isVisible('.contact-home'), 'Go home shows on thank-you');

await page.keyboard.press('Escape');
await page.waitForFunction(() => document.querySelector('.contact-panel')?.dataset.state === 'closed', null, { timeout: 5000 }).catch(() => {});
check(await page.evaluate(() => document.querySelector('.contact-panel')?.dataset.state === 'closed'), 'Esc closes from thank-you');
await page.click('[data-arrow-nav] [data-dir="down"]');
await page.waitForFunction(() => document.querySelector('.contact-panel')?.dataset.state === 'open', null, { timeout: 8000 });
await page.waitForTimeout(400);
check(await page.evaluate(() => document.activeElement?.matches('.contact-option')), 'focus moves into the form');
for (let i = 0; i < 6; i++) await page.keyboard.press('Tab');
check(await page.evaluate(() => !!document.activeElement?.closest('[data-contact]')), 'Tab stays inside the form');
check(await page.evaluate(() => document.querySelector('[data-contact]').getAttribute('role') === 'dialog'), 'form is a dialog');
await page.keyboard.press('Escape');
await page.waitForFunction(() => document.querySelector('.contact-panel')?.dataset.state === 'closed', null, { timeout: 5000 }).catch(() => {});
check(
  await page.evaluate(
    () => document.querySelector('.contact-panel')?.dataset.state === 'closed' && document.activeElement?.getAttribute('data-dir') === 'down',
  ),
  'Esc closes and focus returns to the opener',
);
// When sending fails, the form points at the studio address, not the personal one.
// Its own context, so nothing from the session above can interfere with the route.
const failCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const failer = await failCtx.newPage();
await failer.route(/\/_vercel\/(insights|speed-insights)\//, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
await failer.route('**/api/contact', (route) => route.fulfill({ status: 503, json: { error: 'unavailable' } }));
await failer.goto('http://127.0.0.1:4355/', { waitUntil: 'load' });
await failer.waitForFunction(() => {
  const nav = document.querySelector('[data-arrow-nav]');
  return nav && nav.classList.contains('is-controls') && !nav.classList.contains('is-intro');
}, null, { timeout: 25000 });
await failer.waitForTimeout(600);
await failer.click('[data-arrow-nav] [data-dir="down"]');
await failer.waitForSelector('[data-contact]');
await failer.waitForTimeout(700);
await failer.click('[data-service="Retail store"]');
await failer.waitForTimeout(600);
await failer.fill('#contact-project', 'A shop fit-out');
await failer.keyboard.press('Enter');
await failer.waitForTimeout(500);
await failer.click('#contact-email');
await failer.keyboard.type('a@b.co', { delay: 30 });
await failer.waitForTimeout(300);
await failer.keyboard.press('Enter');
await failer.waitForFunction(
  () => (document.querySelector('[data-contact-msg]')?.textContent ?? '').includes('humansize.de'),
  null,
  { timeout: 15000 },
);
const failure = (await failer.textContent('[data-contact-msg]')) ?? '';
check(failure.includes('hello@humansize.de'), `a failed send points at the studio address (${failure})`);
check(!failure.includes('schnettker.johann'), 'a failed send does not show the personal address');
await failer.close();
await failCtx.close();

await browser.close();
server.close();
if (failures.length) process.exit(1);
console.log('contact: ok');
