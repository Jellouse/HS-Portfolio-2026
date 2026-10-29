
import { chromium } from 'playwright';
import { readFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const ROOT = new URL('..', import.meta.url).pathname;
const EXTERNAL = (process.env.BASE_URL || process.env.PREVIEW_BASE || '').replace(/\/$/, '');
const DEV_PORT = Number(process.env.KEYSTATIC_SMOKE_PORT || 4339);

async function runModuleHarness(page) {
  const { build } = await import('esbuild');
  const tmpDir = join(ROOT, 'tests/.tmp-keystatic-smoke');
  mkdirSync(tmpDir, { recursive: true });
  const outfile = join(tmpDir, 'image-field-optimize.js');
  await build({
    entryPoints: [join(ROOT, 'src/lib/image-field-cms.tsx')],
    bundle: true,
    format: 'esm',
    outfile,
    jsx: 'transform',
    jsxFactory: 'React.createElement',
    jsxFragment: 'React.Fragment',
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

  rmSync(tmpDir, { recursive: true, force: true });

  if (!result.ok) {
    throw new Error(`image-field-optimize failed to evaluate: ${result.error}`);
  }
  if (!result.keys.includes('withImageCms')) {
    throw new Error(`withImageCms not exported (got ${result.keys.join(',')})`);
  }
  if (errors.length) {
    throw new Error(errors.join('\n'));
  }
  console.log('keystatic-module harness OK (withImageCms exports)');
}

async function waitForUrl(url, attempts = 60) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { redirect: 'manual' });
      if (res.status > 0) return;
    } catch {

    }
    await sleep(500);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function startAstroDev() {
  const child = spawn(
    process.execPath,
    [
      join(ROOT, 'node_modules/astro/astro.js'),
      'dev',
      '--host',
      '127.0.0.1',
      '--port',
      String(DEV_PORT),
    ],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        ASTRO_TELEMETRY_DISABLED: '1',
        KEYSTATIC_STORAGE: 'local',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let log = '';
  child.stdout.on('data', (d) => {
    log += d.toString();
  });
  child.stderr.on('data', (d) => {
    log += d.toString();
  });
  const base = `http://127.0.0.1:${DEV_PORT}`;
  try {
    await waitForUrl(base + '/keystatic');
  } catch (e) {
    child.kill('SIGTERM');
    throw new Error(`${e.message}\n--- astro dev log ---\n${log.slice(-4000)}`);
  }
  return {
    url: base,
    async close() {
      child.kill('SIGTERM');
      await sleep(300);
      if (!child.killed) child.kill('SIGKILL');
    },
    log: () => log,
  };
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
  const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });

  await page.waitForTimeout(3500);

  const bad = errors.filter((e) => /React is not defined|is not defined/i.test(e));

  const hard = errors.filter((e) => e.startsWith('pageerror:'));
  await browser.close();

  if (bad.length || hard.length) {
    throw new Error(`Keystatic page errors at ${url}:\n${[...new Set([...bad, ...hard])].join('\n')}`);
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
  const svc = await startAstroDev();
  try {
    await runKeystaticPage(svc.url);
  } finally {
    await svc.close();
  }
}

console.log('keystatic-smoke OK');
