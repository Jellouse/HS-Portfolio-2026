---
name: verify-humansize
description: Drive humansize.de (or a local/static build) the way Johann would — homepage scroll, project pages, CMS preview auth, motion sanity — and capture proof. Use when proving a change, before merge, or after deploy.
---

# Verify Humansize

Agent-facing control skill for the Humansize portfolio.

## Launch

1. Prefer a finished build: `npm run build` then serve `.vercel/output/static` (see `tests/mobile-scroll.spec.mjs`) or set `BASE_URL` to a deploy (`https://humansize.de` or a Vercel preview).
2. `astro preview` is **not** supported with `@astrojs/vercel`.
3. CMS preview and Keystatic need the production (or preview) origin with env secrets; local static serve cannot exercise `/preview/*` auth against GitHub unless `BASE_URL` points at a live deploy.
4. Run `npm run test:touch-guard` before any UI drive. It must exit 0.

## Doctor

- Homepage `GET /` returns 200 and contains a `.card .caption`.
- A published project `GET /work/<slug>` returns 200 and contains `.project`.
- `GET /preview/vitra-chairfinder` without a session returns **404** and `Cache-Control: private, no-store`.
- `npm test` (guard + scroll) exits 0. For live scroll: `BASE_URL=<origin> npm run test:scroll`.

## Drive

Read `features/README.md`, then the feature file for the surface you are proving. Capture screenshots under `artifacts/verify-humansize/<feature>/` (create the dirs). Do not delete proof during cleanup.

## Cleanup

Stop any local static server you started. Leave `artifacts/` in place.
