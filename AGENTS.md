# Humansize

Portfolio for Johann Schnettker (humansize.de). Static Astro site; content lives in the repo. Keystatic edits it locally and on the deploy via GitHub.

## Map

| Path | Role |
| --- | --- |
| `src/pages/index.astro` | Homepage / work feed |
| `src/pages/work/[slug].astro` | Published project pages (static) |
| `src/pages/preview/[slug].astro` | CMS live preview (SSR, auth) |
| `src/pages/api/keystatic/[...params].ts` | Keystatic GitHub OAuth + API |
| `src/pages/api/video-upload.ts` | R2 presign for CMS video upload |
| `src/content.config.ts` | Astro content schema |
| `keystatic.config.ts` | CMS schema + `previewUrl` |
| `src/lib/` | content, images, preview, cms-auth, seo |
| `src/components/` | UI blocks |
| `src/scripts/` | haptics, chrome, scroll-fade, text-reveal, faces, input |
| `src/styles/` | `global.css` imports `tokens.css`, `layout.css`, `motion.css` |
| `tests/` | touch-scroll guard + iPhone swipe scroll test |
| `.cursor/skills/verify-humansize/` | Agent verification skill + feature map |

Adapter: `@astrojs/vercel`, `output: 'static'`. Keystatic admin and preview/API routes set `prerender = false`. Leave Vercel output directory empty.

## Locks (do not break)

- **Mobile scroll.** Never put `<input type=checkbox switch>` under the finger (WebKit 321591). Use a `<label>` overlay with a `visibility:hidden` switch. No non-passive touch listeners on content. No `touch-action: none` on cards or captions. `npm test` must stay green before merge.
- **Native press-and-hold save** on images/videos (media stacked above haptic label).
- **WebHaptics** on taps (iOS label→switch; Android `vibrate`).
- **No bright flash** on view transitions.
- **Faces / little-man tilt** only after a tap on iOS (permission).
- **Menu** stays grey, turns black on hover; sequenced opacity (+ subtle grow), no blur.
- **`prefers-reduced-motion`** honoured.
- **Whole-px font sizes.** One type size: 23px / 29px line-height.
- **Drafts** stay out of static builds (`published: false`). Preview route is the only way to see them on the live origin.
- **Voice:** plain, short, no em dashes, no colon-reveals / "X, not Y" in new copy. Email `schnettker.johann@gmail.com` only. Tony's Chocolonely (with h and apostrophe). Bodil: scans exist; Johann sculpts, does not scan.

## CMS

- Projects: `src/content/projects/<slug>/index.yaml` + images. Required for publish: cover (+ alt) or cover video, summary.
- Site: `src/content/site/site.yaml`. Order: `project-order.yaml`.
- Storage: local in `npm run dev`; GitHub on production. Override with `KEYSTATIC_STORAGE`.
- Preview button uses `previewUrl: /preview/{slug}?branch={branch}`. Access = Keystatic cookie `keystatic-gh-access-token` or `Authorization: Bearer`, plus GitHub `permissions.push` on `Jellouse/HS-Portfolio-2026`. Response: `noindex`, `Cache-Control: private, no-store`. Excluded from sitemap / robots / llms project list.
- Video upload: R2; 200 MB/file, ~8 GB bucket cap. Same push-access check.
- After deploy, hard-refresh `/keystatic` if the Preview control is missing.

## Motion taste

Quiet only. Opacity / transform / color. No upward flourish, no blur on UI chrome. Scroll fade ~400ms `--ease-out`. Menu grow from ~0.95→1, ~200ms. Link press-scale 0.97 on fine pointers.

## Commands

| Script | What it does |
| --- | --- |
| `npm run dev` | Local site + CMS (`/keystatic`, local storage) |
| `npm run build` | Static pages + serverless Keystatic/preview routes |
| `npm run preview` | Not supported with the Vercel adapter; use `npm test` or deploy |
| `npm test` | **Must pass before merge:** touch-scroll static guard + iPhone swipe scroll |
| `npm run test:touch-guard` | Fail on `passive:false` touch listeners / `touch-action:none` / switch-under-finger |
| `npm run test:scroll` | Real touch swipes (image, gap, caption, project page). Live: `BASE_URL=https://humansize.de npm run test:scroll` |
| `KEYSTATIC_STORAGE=github npm run dev` | One-time GitHub App setup only |

`SITE_URL` = production origin, no trailing slash (else `VERCEL_PROJECT_PRODUCTION_URL`).

## Content notes

Framer-era drafts may sit unpublished in `src/content/projects/*` (`published: false`). They must not appear in the feed, sitemap, or llms project list. Use CMS Preview to review them.
