import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ARTIFACTS = process.env.ARTIFACTS || join(ROOT, 'artifacts');
const root = [join(ROOT, '.vercel', 'output', 'static'), join(ROOT, 'dist', 'client')].find((d) =>
  existsSync(join(d, 'index.html')),
);
if (!root) {
  console.error('Run npm run build first.');
  process.exit(1);
}
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.webp': 'image/webp', '.png': 'image/png' };
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
await new Promise((r) => server.listen(4345, '127.0.0.1', r));
mkdirSync(ARTIFACTS, { recursive: true });
const browser = await chromium.launch();

async function record(name, url, width, height) {
  const dir = join(ARTIFACTS, 'videos');
  mkdirSync(dir, { recursive: true });
  const ctx = await browser.newContext({
    viewport: { width, height },
    isMobile: width < 700,
    hasTouch: width < 700,
    reducedMotion: 'no-preference',
    recordVideo: { dir, size: { width, height } },
  });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:4345${url}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.classList.contains('is-letter-intro-done'), null, { timeout: 20000 });
  await page.waitForTimeout(400);
  const max = await page.evaluate((narrow) => Math.min(document.documentElement.scrollHeight - innerHeight, narrow ? 2200 : 1800), width < 700);
  const steps = 36;
  for (let i = 0; i <= steps; i++) {
    await page.evaluate((y) => scrollTo(0, y), Math.round((max * i) / steps));
    await page.waitForTimeout(90);
  }
  const webm = await page.video().path();
  await page.close();
  await ctx.close();
  const mp4 = join(ARTIFACTS, `${name}.mp4`);
  execFileSync('ffmpeg', ['-y', '-i', webm, '-t', '6', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4], { stdio: 'ignore' });
  console.log(`wrote ${mp4}`);
}

await record('home-scroll-390', '/', 390, 844);
await record('home-scroll-1440', '/', 1440, 900);
await record('atomic-scroll-390', '/work/atomic-ski/', 390, 844);
await record('atomic-scroll-1440', '/work/atomic-ski/', 1440, 900);

await browser.close();
server.close();
