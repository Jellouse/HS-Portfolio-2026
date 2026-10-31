import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const staticRoot = join(rootDir, '.vercel/output/static');
const baselineDir = join(rootDir, 'tests/visual/baseline');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.txt': 'text/plain',
  '.xml': 'application/xml',
  '.json': 'application/json',
};

const SKIP = new Set(['/keystatic-upload/', '/admin/', '/canvas/', '/dev/components/']);

function pagesFromStatic(root) {
  const found = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '_astro') walk(path);
        continue;
      }
      if (!entry.name.endsWith('.html')) continue;
      const rel = '/' + path.slice(root.length + 1).replaceAll('\\', '/');
      const route = rel === '/404.html' ? '/404' : rel.replace(/index\.html$/, '');
      if (SKIP.has(route.endsWith('/') ? route : `${route}/`) || route.startsWith('/dev/')) continue;
      found.push(route);
    }
  };
  walk(root);
  const rank = (p) => (p === '/' ? 0 : p === '/shop/' ? 1 : p.startsWith('/shop/') ? 2 : p.startsWith('/work/') ? 3 : p === '/404' ? 9 : 5);
  return found.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

function fileName(route, tag) {
  const slug = route === '/' ? 'home' : route.replace(/^\//, '').replace(/\/$/, '').replaceAll('/', '-');
  return `${slug}-${tag}.png`;
}

function serve(root, port) {
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
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(readFileSync(file));
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

const viewports = [
  { tag: '1440', width: 1440, height: 900, mobile: false },
  { tag: '390', width: 390, height: 844, mobile: true },
];

export async function capture(outDir, port = 4377) {
  if (!existsSync(staticRoot)) {
    console.error('missing build output. Run npm run build first.');
    process.exit(1);
  }
  mkdirSync(outDir, { recursive: true });
  const only = new Set((process.env.VISUAL_ONLY || '').split(',').map((item) => item.trim()).filter(Boolean));
  const pages = pagesFromStatic(staticRoot).filter((route) => !only.size || only.has(route));
  const server = await serve(staticRoot, port);
  const browser = await chromium.launch();
  try {
  const tag = process.env.VISUAL_TAG;
  const shots = tag ? viewports.filter((vp) => vp.tag === tag) : viewports;
  for (const vp of shots) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 1,
        reducedMotion: 'reduce',
        isMobile: vp.mobile,
        hasTouch: vp.mobile,
        locale: 'en-US',
      });
      const page = await context.newPage();
      for (const route of pages) {
        const file = join(outDir, fileName(route, vp.tag));
        const url = route === '/404' ? '/404.html' : route;
        await page.goto(`http://127.0.0.1:${port}${url}`, { waitUntil: 'networkidle', timeout: 120000 });
        await page.evaluate(() => document.fonts.ready);
        await page.evaluate(async () => {
          const visible = (img) => {
            if (img.closest('[hidden]')) return false;
            const style = getComputedStyle(img);
            return style.display !== 'none' && style.visibility !== 'hidden';
          };
          const imgs = [...document.querySelectorAll('img')].filter(visible);
          for (const img of imgs) {
            img.loading = 'eager';
            img.scrollIntoView({ block: 'center' });
            for (let attempt = 0; attempt < 3 && (!img.complete || img.naturalWidth === 0); attempt++) {
              await new Promise((resolve) => {
                const done = () => resolve();
                img.addEventListener('load', done, { once: true });
                img.addEventListener('error', done, { once: true });
                setTimeout(done, 5000);
              });
            }
            try { await img.decode(); } catch {}
          }
          scrollTo(0, 0);
        });
        await page.evaluate(() => {
          document.querySelectorAll('.scroll-media, .fade-in').forEach((el) => {
            el.style.opacity = '1';
            el.style.filter = 'none';
          });
          document.querySelectorAll('img').forEach((img) => {
            img.classList.add('is-ready');
            img.style.opacity = '1';
          });
        });
        if (route === '/') await page.waitForSelector('[data-intro-settled]', { timeout: 20000 }).catch(() => {});
        if (route === '/shop/') {
          await page.waitForSelector('[data-ring-settled]', { timeout: 20000 }).catch(() => {});
          await page.waitForFunction(() => {
            const mark = document.querySelector('.shop-mark');
            const canvas = document.querySelector('canvas.shop-ring-canvas');
            if (!mark || !canvas) return false;
            if (!mark.classList.contains('has-canvas') || !mark.classList.contains('at-top') || canvas.width === 0) return false;
            const stamp = canvas.toDataURL();
            const same = canvas.dataset.visualStamp === stamp;
            canvas.dataset.visualStamp = stamp;
            return same;
          }, null, { timeout: 20000, polling: 50 }).catch(() => {});
        }
        await page.evaluate(async () => {
          await document.fonts.ready;
          if (document.fonts.load) {
            await document.fonts.load('23px "ABC Areal"');
            await document.fonts.ready;
          }
          const visible = (img) => {
            if (img.closest('[hidden]')) return false;
            const style = getComputedStyle(img);
            return style.display !== 'none' && style.visibility !== 'hidden';
          };
          await Promise.all([...document.querySelectorAll('img')].filter(visible).map(async (img) => {
            if (!img.complete || img.naturalWidth === 0) {
              await new Promise((resolve) => {
                img.addEventListener('load', () => resolve(), { once: true });
                img.addEventListener('error', () => resolve(), { once: true });
              });
            }
            try { await img.decode(); } catch {}
          }));
          HTMLVideoElement.prototype.play = function play() {
            this.pause();
            return Promise.resolve();
          };
          document.querySelectorAll('video').forEach((video) => {
            video.pause();
            video.removeAttribute('autoplay');
            video.querySelectorAll('source').forEach((source) => source.removeAttribute('src'));
            video.removeAttribute('src');
            video.preload = 'none';
            video.load();
          });
          scrollTo(0, 0);
          const nativeFrame = window.requestAnimationFrame.bind(window);
          window.__visualFrame = nativeFrame;
          const markRest = () => [...document.querySelectorAll('[data-spin-mark]')].every((el) => {
            const angle = Number((el.style.transform.match(/rotate\(([-\d.]+)deg\)/) || [])[1]);
            const anims = el.getAnimations?.() ?? [];
            return angle === 90 && anims.every((anim) => anim.playState === 'finished' || anim.playState === 'idle');
          });
          const deadline = performance.now() + 1600;
          while (performance.now() < deadline && !markRest()) {
            await new Promise((resolve) => nativeFrame(resolve));
          }
          document.querySelectorAll('[data-spin-mark]').forEach((el) => {
            el.getAnimations?.().forEach((anim) => anim.cancel());
            el.style.transform = 'rotate(90deg)';
          });
          await new Promise((resolve) => nativeFrame(() => nativeFrame(resolve)));
        });
        const pending = await page.evaluate(() =>
          [...document.querySelectorAll('img')].filter((img) => {
            if (img.closest('[hidden]')) return false;
            const style = getComputedStyle(img);
            if (style.display === 'none' || style.visibility === 'hidden') return false;
            return !img.complete || img.naturalWidth === 0;
          }).map((img) => img.currentSrc || img.src),
        );
        if (pending.length) console.log('undecoded', route, vp.tag, pending.length);
        let previous = null;
        let shot = null;
        for (let attempt = 0; attempt < 6; attempt++) {
          await page.evaluate(() => new Promise((resolve) => {
            const frame = window.__visualFrame || requestAnimationFrame;
            frame(() => frame(resolve));
          }));
          shot = await page.screenshot({ fullPage: true, animations: 'disabled' });
          if (previous && shot.equals(previous)) break;
          previous = shot;
        }
        writeFileSync(file, shot);
        console.log('shot', file);
      }
      await context.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  return pages;
}

const [mode, arg] = process.argv.slice(2);
const isDirect = process.argv[1] && process.argv[1].endsWith('visual-pages.mjs');
if (isDirect) {
  if (mode === 'capture') {
    const out = arg || baselineDir;
    await capture(out, Number(process.env.VISUAL_PORT || 4377));
  } else if (mode === 'check') {
    const out = join(tmpdir(), `hs-visual-${Date.now()}`);
    await capture(out, Number(process.env.VISUAL_PORT || 4377));
    const diff = spawnSync(process.execPath, ['scripts/visual-diff.mjs', baselineDir, out], {
      cwd: rootDir,
      stdio: 'inherit',
    });
    rmSync(out, { recursive: true, force: true });
    process.exit(diff.status ?? 1);
  } else {
    console.error('usage: node scripts/visual-pages.mjs capture [out-dir] | check');
    process.exit(1);
  }
}
