

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { canvasMode } from '../src/lib/canvas-env.mjs';
import { checkCanvasAccess, _clearCanvasAuthCache } from '../src/lib/canvas-auth.mjs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

assert.equal(canvasMode({ VERCEL_ENV: 'production' }), 'auth');
assert.equal(canvasMode({ VERCEL_ENV: 'production', NODE_ENV: 'development' }), 'auth');
assert.equal(canvasMode({ VERCEL_ENV: 'preview', NODE_ENV: 'production' }), 'open');
assert.equal(canvasMode({ NODE_ENV: 'development' }), 'open');
assert.equal(canvasMode({ NODE_ENV: 'production' }), 'auth');

const fake = (user, repo) => {
  const calls = [];
  const f = async (url, init) => {
    calls.push([url, init.headers.Authorization]);
    const body = url.endsWith('/user') ? user : repo;
    return { ok: body !== null, json: async () => body };
  };
  f.calls = calls;
  return f;
};
_clearCanvasAuthCache();
assert.deepEqual(await checkCanvasAccess(undefined, fake(null, null)), { status: 'unauthenticated' });
assert.deepEqual(await checkCanvasAccess('bad', fake(null, null)), { status: 'unauthenticated' });
assert.deepEqual(await checkCanvasAccess('reader', fake({ login: 'r' }, { permissions: { push: false } })), { status: 'forbidden', login: 'r' });
const ok = fake({ login: 'jo' }, { permissions: { push: true } });
assert.deepEqual(await checkCanvasAccess('editor', ok), { status: 'ok', login: 'jo' });
assert.equal(ok.calls[1][0], 'https://api.github.com/repos/Jellouse/HS-Portfolio-2026');
assert.equal(ok.calls[0][1], 'Bearer editor');
await checkCanvasAccess('editor', ok);
assert.equal(ok.calls.length, 2, 'result cached');

const page = read('../src/pages/canvas.astro');
assert.match(page, /prerender = false/);
assert.match(page, /name="robots" content="noindex/);
assert.match(read('../astro.config.mjs'), /path === '\/canvas'\) return false/, 'sitemap filter');
assert.match(read('../src/pages/robots.txt.ts'), /Disallow: \/canvas/, 'robots');
assert.doesNotMatch(read('../src/pages/llms.txt.ts'), /canvas/, 'not in llms.txt');

const PORT = 4361;
const server = spawn('node', ['node_modules/astro/astro.js', 'dev', '--host', '127.0.0.1', '--port', String(PORT)], {
  cwd: new URL('..', import.meta.url).pathname,
  env: { ...process.env, VERCEL_ENV: 'production' },
  stdio: 'ignore',
});
try {
  let res;
  for (let i = 0; i < 60; i++) {
    try { res = await fetch(`http://127.0.0.1:${PORT}/canvas`, { redirect: 'manual' }); break; } catch { await sleep(500); }
  }
  assert.ok(res, 'dev server up');
  for (const cookie of [undefined, 'keystatic-gh-access-token=not-a-real-token']) {
    const r = await fetch(`http://127.0.0.1:${PORT}/canvas`, { redirect: 'manual', headers: cookie ? { cookie } : {} });
    const body = await r.text();
    assert.ok([401, 302, 303].includes(r.status), `unauthenticated prod /canvas is ${r.status}`);
    assert.doesNotMatch(body, /canvas-data/, 'no board markup');
    assert.match(body, /Sign in with GitHub/);
    assert.match(r.headers.get('x-robots-tag') || '', /noindex/);
    assert.match(r.headers.get('set-cookie') || '', /canvas-return=1/);
  }
} finally {
  server.kill();
}
console.log('canvas auth: ok');
