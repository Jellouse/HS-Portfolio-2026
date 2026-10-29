/**
 * Accessibility: axe on every page, keyboard menus and dialog, scroll lock,
 * and the project textarea never clips a line (typing, wrapping, Shift+Enter, paste).
 *
 *   npm run build && npm run test:shop-intro
 */
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
await new Promise((r) => server.listen(4336, '127.0.0.1', r));
const browser = await chromium.launch();
import AxeBuilder from '@axe-core/playwright';
import { readdirSync } from 'node:fs';
const failures = [];
const check = (ok, label) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`); if (!ok) failures.push(label); };
const B = 'http://127.0.0.1:4336';
const work = readdirSync(join(root, 'work')).filter((d) => existsSync(join(root, 'work', d, 'index.html')));
const shop = readdirSync(join(root, 'shop')).filter((d) => existsSync(join(root, 'shop', d, 'index.html')));
const pages = ['/', '/shop/', '/404.html', ...work.map((d) => `/work/${d}/`), ...shop.map((d) => `/shop/${d}/`)];
const desk = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const contrast = new Map();
for (const path of pages) {
  const p = await desk.newPage();
  await p.route('**/api/**', (r) => r.fulfill({ json: {} }));
  await p.goto(B + path, { waitUntil: 'load' });
  await p.waitForTimeout(600);
  const r = await new AxeBuilder({ page: p }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const bad = r.violations.filter((v) => v.id !== 'color-contrast' && ['serious', 'critical'].includes(v.impact));
  for (const v of r.violations.filter((v) => v.id === 'color-contrast')) for (const n of v.nodes) contrast.set(n.target.join(' '), n.any[0]?.data?.contrastRatio);
  check(!bad.length, `axe ${path}${bad.length ? ': ' + bad.map((v) => `${v.id} (${v.nodes.length})`).join(', ') : ''}`);
  await p.close();
}
console.log(`  contrast notes (not failing): ${[...new Set(contrast.values())].join(', ') || 'none'} on ${contrast.size} nodes`);

// No skip link (removed in round 7: the menus are short).
let p = await desk.newPage();
await p.goto(B + '/work/' + work[0] + '/', { waitUntil: 'load' });
check(!(await p.evaluate(() => document.querySelector('.skip'))), 'no skip link');

// Project menu: Tab opens it, items reachable, closed items not tabbable, Esc closes + returns focus.
await p.keyboard.press('Tab');
check(await p.evaluate(() => document.activeElement.matches('[data-project-face]') && document.querySelector('[data-project-menu]').classList.contains('is-open')), 'Tab onto the icon opens the menu');
await p.keyboard.press('Tab');
check(await p.evaluate(() => document.activeElement.closest('.project-menu') !== null), 'next Tab lands on a menu item');
await p.keyboard.press('Escape');
check(await p.evaluate(() => document.activeElement.matches('[data-project-face]') && !document.querySelector('[data-project-menu]').classList.contains('is-open')), 'Esc closes the menu and returns focus');
check(await p.evaluate(() => document.querySelector('.project-menu').inert), 'closed menu is inert');

// Dialog: role, initial focus, trap, Esc returns focus.
await p.goto(B + '/', { waitUntil: 'load' });
await p.waitForTimeout(400);
await p.focus('.site-menu [data-contact-open]');
await p.keyboard.press('Enter');
await p.waitForTimeout(600);
check(await p.evaluate(() => document.activeElement.matches('[data-service]')), 'dialog: initial focus on the first option');
for (let i = 0; i < 8; i++) await p.keyboard.press('Tab');
check(await p.evaluate(() => !!document.activeElement.closest('.contact-panel')), 'dialog: Tab stays inside');
const y0 = await p.evaluate(() => scrollY);
await p.mouse.move(720, 200);
await p.mouse.wheel(0, 600);
await p.waitForTimeout(300);
check((await p.evaluate(() => scrollY)) === y0, 'dialog: page does not scroll (desktop)');
await p.keyboard.press('Escape');
await p.waitForTimeout(100);
check(await p.evaluate(() => document.activeElement.matches('.site-menu [data-contact-open]')), 'dialog: Esc returns focus to Contact');

// Textarea never clips: long wrap, Shift+Enter lines, paste, delete; desktop and phone.
for (const [label, opt] of [['desktop', { viewport: { width: 1440, height: 900 } }], ['mobile', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }]]) {
  const ctx = await browser.newContext(opt);
  const q = await ctx.newPage();
  await q.goto(B + '/', { waitUntil: 'load' });
  await q.waitForTimeout(400);
  await q.evaluate(() => document.querySelector('.site-menu [data-contact-open]').click());
  await q.waitForTimeout(600);
  await q.evaluate(() => document.querySelector('[data-service="Physical Build"]').click());
  await q.waitForTimeout(300);
  const fits = () => q.evaluate(() => { const t = document.querySelector('#contact-project'); return t.scrollHeight <= t.clientHeight + 1 || t.clientHeight >= t.parentElement.clientHeight - 29; });
  let ok = true;
  const word = 'wrapping ';
  for (let i = 0; i < 18; i++) { await q.keyboard.type(word); if (!(await fits())) ok = false; }
  check(ok, `${label}: typed wrap never clips`);
  ok = true;
  for (let i = 0; i < 2; i++) { await q.keyboard.press('Shift+Enter'); if (!(await fits())) ok = false; await q.keyboard.type('x'); if (!(await fits())) ok = false; }
  check(ok && (await q.isVisible('#contact-project')), `${label}: Shift+Enter adds lines, no clip`);
  await q.evaluate(() => { const t = document.querySelector('#contact-project'); t.focus(); t.setRangeText(' pasted '.repeat(40), t.value.length, t.value.length, 'end'); t.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste' })); });
  check(await q.evaluate(() => { const t = document.querySelector('#contact-project'); return t.clientHeight <= t.parentElement.clientHeight && t.scrollTop + t.clientHeight >= t.scrollHeight - 1; }), `${label}: paste past the max scrolls inside, caret line visible`);
  await q.evaluate(() => { const t = document.querySelector('#contact-project'); t.value = 'one'; t.dispatchEvent(new InputEvent('input', { bubbles: true })); });
  check(await q.evaluate(() => Math.round(document.querySelector('#contact-project').clientHeight) === 29 && getComputedStyle(document.querySelector('#contact-project')).textAlign === 'center'), `${label}: back to one centred line after delete`);
  if (label === 'mobile') {
    const y0 = await q.evaluate(() => scrollY);
    const cdp = await q.context().newCDPSession(q);
    await cdp.send('Input.synthesizeScrollGesture', { x: 195, y: 700, yDistance: -400, gestureSourceType: 'touch', speed: 1200 });
    await q.waitForTimeout(300);
    const y1 = await q.evaluate(() => scrollY);
    check(y1 === y0, `mobile: touch swipe does not scroll the page while open (${y0} -> ${y1})`);
  }
  await ctx.close();
}

await browser.close();
server.close();
if (failures.length) { console.error('a11y FAIL'); process.exit(1); }
console.log('a11y: ok');
