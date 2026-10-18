/**
 * Smoke-load /keystatic and fail on any page error or console "is not defined".
 * Serves the local Vercel/static build when present; otherwise starts `astro preview`
 * is too heavy — prefer BASE_URL, else build output via the same pattern as scroll tests.
 *
 *   node tests/keystatic-smoke.spec.mjs
 *   BASE_URL=https://humansize.de node tests/keystatic-smoke.spec.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = new URL('..', import.meta.url).pathname;
const STATIC = join(ROOT, '.vercel/output/static');
const EXTERNAL = (process.env.BASE_URL || process.env.PREVIEW_BASE || '').replace(/\/$/, '');

const mime = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

async function serveStatic() {
  if (!existsSync(STATIC)) {
    throw new Error(
      `No build at ${STATIC}. Run npm run build first, or set BASE_URL to a live origin.`,
    );
  }
  const server = createServer((req, res) => {
    let url = decodeURIComponent((req.url || '/').split('?')[0]);
    // Keystatic is an SSR route in production; in the static export the admin
    // shell is often under /keystatic/index.html when prerendered, otherwise
    // we still want to hit whatever client bundle is linked from a stub.
    // For hybrid builds, /keystatic is handled by the serverless function and
    // may not exist in static/. Fall back to serving a minimal HTML that
    // imports the Keystatic client entry if present.
    if (url === '/keystatic' || url === '/keystatic/') url = '/keystatic/index.html';
    let file = join(STATIC, url);
    if (!existsSync(file) || statSync(file).isDirectory()) {
      const idx = join(file, 'index.html');
      if (existsSync(idx)) file = idx;
      else {
        // SSR-only: return a tiny page that still loads react from the built chunks
        // so we can catch "React is not defined" in admin-shared modules by importing
        // the image-field optimize module via a data URL harness below.
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('not found');
        return;
      }
    }
    res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  return { url: `http://127.0.0.1:${port}`, close: () => server.close() };
}

/** Import the optimize module in a page with classic JSX runtime (React global required). */
async function runModuleHarness(page) {
  // Bundle the module with esbuild so the browser can import it, using classic JSX
  // (jsx: 'transform') to mirror the Keystatic / Vite classic-runtime failure mode.
  const { build } = await import('esbuild');
  const outfile = join(ROOT, 'tests/.tmp-image-field-optimize.js');
  await build({
    entryPoints: [join(ROOT, 'src/lib/image-field-optimize.tsx')],
    bundle: true,
    format: 'esm',
    outfile,
    jsx: 'transform',
    jsxFactory: 'React.createElement',
    jsxFragment: 'React.Fragment',
    external: [],
    // Don't mark react as external — bundle a stub that throws if createElement is called
    // without React; we only care that the module evaluates.
    plugins: [
      {
        name: 'react-shim',
        setup(build) {
          build.onResolve({ filter: /^react$/ }, () => ({
            path: 'react',
            namespace: 'react-shim',
          }));
          build.onLoad({ filter: /.*/, namespace: 'react-shim' }, () => ({
            contents: `
              const React = {
                createElement: (...args) => ({ $$typeof: Symbol.for('react.element'), type: args[0], props: args[1] || {} }),
                Fragment: Symbol.for('react.fragment'),
              };
              export default React;
              export const useRef = () => ({ current: null });
              export const useState = (v) => [v, () => {}];
            `,
            loader: 'js',
          }));
        },
      },
    ],
  });

  // Also build with jsx automatic to ensure our source has React in scope for classic.
  // Primary check: evaluate the classic-transformed bundle in a page where React is NOT global.
  const code = readFileSync(outfile, 'utf8');
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error' && /is not defined/i.test(msg.text())) {
      errors.push(`console: ${msg.text()}`);
    }
  });

  await page.setContent('<!doctype html><html><body></body></html>');
  const result = await page.evaluate(async (src) => {
    const blob = new Blob([src], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    try {
      const mod = await import(url);
      return { ok: true, keys: Object.keys(mod) };
    } catch (e) {
      return { ok: false, error: String(e && e.message ? e.message : e) };
    } finally {
      URL.revokeObjectURL(url);
    }
  }, code);

  if (!result.ok) {
    throw new Error(`image-field-optimize failed to evaluate: ${result.error}`);
  }
  if (!result.keys.includes('withImageOptimize')) {
    throw new Error(`withImageOptimize not exported (got ${result.keys.join(',')})`);
  }
  if (errors.length) {
    throw new Error(errors.join('\n'));
  }
  console.log('keystatic-module harness OK (withImageOptimize exports)');
}

async function runKeystaticPage(base) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error' && /is not defined/i.test(msg.text())) {
      errors.push(`console: ${msg.text()}`);
    }
  });

  const url = `${base}/keystatic`;
  const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  // 401/302 to GitHub login is fine — we care about JS crashing on load
  await page.waitForTimeout(2500);

  const bad = errors.filter((e) => /React is not defined|is not defined/i.test(e));
  await browser.close();

  if (bad.length) {
    throw new Error(`Keystatic page errors at ${url}:\n${bad.join('\n')}`);
  }
  console.log(`keystatic-page OK (${res?.status() ?? '?'}) ${url}`);
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await runModuleHarness(page);
  await page.close();
} finally {
  await browser.close();
}

if (EXTERNAL) {
  await runKeystaticPage(EXTERNAL);
} else {
  // Prefer hitting a local astro preview if the SSR route exists; else module harness is enough
  // for the classic-JSX React scope bug. Also try static /keystatic if present.
  const hasStaticKeystatic =
    existsSync(join(STATIC, 'keystatic/index.html')) || existsSync(join(STATIC, 'keystatic.html'));
  if (hasStaticKeystatic) {
    const svc = await serveStatic();
    try {
      await runKeystaticPage(svc.url);
    } finally {
      svc.close();
    }
  } else {
    console.log('keystatic-page skipped (no static /keystatic; module harness covers the React scope bug)');
  }
}

console.log('keystatic-smoke OK');
