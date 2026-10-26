/**
 * Contact sheet: opens from the menu, Next stays off on an empty step, Enter advances, Back
 * works, submit posts the three answers and shows the thank-you; outside click closes.
 *
 *   npm run build && npm run test:contact
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
await new Promise((r) => server.listen(4334, '127.0.0.1', r));
const browser = await chromium.launch();
const failures = [];
const check = (ok, label) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`); if (!ok) failures.push(label); };
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
let posted = null;
await page.route('**/api/contact', (route) => { posted = JSON.parse(route.request().postData()); route.fulfill({ json: { ok: true } }); });
await page.goto('http://127.0.0.1:4334/', { waitUntil: 'load' });
await page.waitForTimeout(500);
await page.click('.site-menu [data-contact-open]');
await page.waitForTimeout(700);
const panelY = await page.evaluate(() => Math.round(document.querySelector('.contact-panel').getBoundingClientRect().top));
check(panelY === 465, `sheet slides up to y=465 (${panelY})`);
await page.click('[data-service="Retail"]');
check(await page.isVisible('#contact-project'), 'picking a service goes to step 2');
await page.hover('.contact-dots');
await page.waitForTimeout(300);
check(await page.isDisabled('[data-contact-next]'), 'Next is off while the project is empty');
check(await page.isVisible('[data-contact-back]'), 'hovering the dots shows Back');
await page.fill('#contact-project', 'A shop fit-out');
await page.keyboard.press('Enter');
check(await page.isVisible('#contact-email'), 'Enter goes to step 3');
await page.fill('#contact-email', 'a@b.co');
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
check(posted?.service === 'Retail' && posted?.project === 'A shop fit-out' && posted?.email === 'a@b.co', 'submit posts all answers');
check((await page.textContent('[data-contact-msg]')).includes('Thank you'), 'thank-you shows');
await page.mouse.click(700, 100);
await page.waitForTimeout(700);
check(await page.evaluate(() => document.querySelector('[data-contact]').hidden), 'outside click closes');
await browser.close();
server.close();
if (failures.length) process.exit(1);
console.log('contact: ok');
