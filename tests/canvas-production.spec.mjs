// /canvas must never exist on production (humansize.de): 404, no sitemap, no llms.txt, noindex.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canvasEnabled } from '../src/lib/canvas-env.mjs';

assert.equal(canvasEnabled({ VERCEL_ENV: 'production' }), false, 'off on Vercel production');
assert.equal(canvasEnabled({ VERCEL_ENV: 'production', NODE_ENV: 'development' }), false);
assert.equal(canvasEnabled({ VERCEL_ENV: 'preview', NODE_ENV: 'production' }), true, 'on for previews');
assert.equal(canvasEnabled({ NODE_ENV: 'development' }), true, 'on in dev');
assert.equal(canvasEnabled({ NODE_ENV: 'production' }), false, 'off in any other production build');

const page = readFileSync(new URL('../src/pages/canvas.astro', import.meta.url), 'utf8');
assert.match(page, /prerender = false/, 'gated at request time');
assert.match(page, /status: 404/);
assert.match(page, /name="robots" content="noindex/);
assert.match(readFileSync(new URL('../astro.config.mjs', import.meta.url), 'utf8'), /path === '\/canvas'\) return false/, 'sitemap filter');
assert.doesNotMatch(readFileSync(new URL('../src/pages/llms.txt.ts', import.meta.url), 'utf8'), /canvas/, 'not in llms.txt');
console.log('canvas production exclusion: ok');
