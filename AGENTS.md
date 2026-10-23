# Humansize

Portfolio for Johann Schnettker. Static Astro site, content in the repo. Keystatic edits that content locally, and on the deployed site through GitHub.

## Architecture

- `src/pages/index.astro` is the homepage. The work is the page. The first project peeks above the fold.
- `src/pages/work/[slug].astro` builds every published project from its block list. New projects do not need a new page. The mark at the top returns to the homepage.
- `src/content.config.ts` is the typed schema. `keystatic.config.ts` edits the same files. Keep the two in step.
- `src/components/` holds the UI. Header, Mark, ProjectFeed, ProjectCard, About, ProjectHero, TextBlock, ImageBlock, ImagePair, Info, Footer.
- Images live next to their project and go through `astro:assets` (`src/lib/images.ts`, `BlurImage.astro`).
- `@astrojs/vercel` is the adapter. `output` stays `static`. Pages and the `llms.txt` and `robots.txt` endpoints export `prerender = true`. `@keystatic/astro` injects `/keystatic` with `prerender: false`. The API is `src/pages/api/keystatic/[...params].ts` (`prerender = false`). CMS project preview is `src/pages/preview/[slug].astro` (`prerender = false`): Keystatic `previewUrl` opens it; the route checks the Keystatic GitHub cookie (or `Authorization: Bearer`) for push access to this repo, reads the entry live from GitHub, and sends `noindex` plus `Cache-Control: private, no-store`. The integration would inject the same path, so `astro.config.mjs` drops that inject. On Vercel, Astro's `request.url` host is localhost, and Keystatic builds the GitHub `redirect_uri` from that URL. The route rebuilds it from `x-forwarded-host` and `x-forwarded-proto`, falling back to `host`. Leave Vercel's output directory empty so the adapter can publish both.

## Where content lives

- Site copy, email, about, socials: `src/content/site/site.yaml`
- One folder per project: `src/content/projects/<slug>/index.yaml` plus images in that folder
- Image paths in YAML are absolute from the repo, like `/src/content/projects/atomic/cover.jpg`

## Add a project

1. `npm run dev` and open `/keystatic`, or duplicate a project folder.
2. Set title, caption (`Name, Year`), order, summary (two or three sentences), cover, alt text, info lines (`Key: Value`, optional link on the value), and blocks. Leave out unknown info lines.
3. Blocks are `text`, `image`, `pair`, or `process`. `process` is an optional centred Process label and a two-column grid of photos. The project page ends with a centred Info label and the info list, aligned to the image column.
4. Leave `published` off until the cover image and alt text exist.
5. Put unknowns in `todo`. Those notes are not rendered.
6. Update `src/pages/llms.txt.ts` only if you want a line the generator does not already build. It reads the collection.

## Keystatic storage

`keystatic.config.ts` picks the storage kind from the environment.

- `npm run dev` uses local storage and writes the YAML in this repo.
- A production build uses GitHub storage on `Jellouse/HS-Portfolio-2026`.
- `KEYSTATIC_STORAGE=local` or `KEYSTATIC_STORAGE=github` overrides that. Restart `npm run dev` after changing it. Leave it unset on Vercel.

No `branchPrefix` is set, so a prefix is allowed and `main` and `v1` both stay selectable. The branch menu opens on the repository default branch, which is `main`. After this work is merged, edit `main`. Until then, choose `v1` in the menu, or open `/keystatic/branch/v1`.

### One-time GitHub setup

Keystatic's Create GitHub App screen writes the secrets into a local `.env`, and it only finishes that callback in development. Run it once on your machine, with the deployed origin filled in, then copy the values into Vercel. Do not commit `.env`.

1. Deploy the site and note the public origin, with no trailing slash. Use the stable production host. GitHub matches the OAuth callback exactly, and a per-deployment preview URL changes on every build.
2. From the repo, run `KEYSTATIC_STORAGE=github npm run dev`.
3. Open `http://127.0.0.1:4321/keystatic`.
4. On the setup screen, set Deployed URL to the public origin. Leave the organization field empty while the repo is on the user account.
5. Choose Create GitHub App. Name the app, then install it on `Jellouse/HS-Portfolio-2026` and grant that repository.
6. Keystatic returns to the admin UI and appends four variables to `.env`:
   - `KEYSTATIC_GITHUB_CLIENT_ID`
   - `KEYSTATIC_GITHUB_CLIENT_SECRET`
   - `KEYSTATIC_SECRET`
   - `PUBLIC_KEYSTATIC_GITHUB_APP_SLUG`
7. In the Vercel project, add those four for Production and Preview. Keep `KEYSTATIC_SECRET` as the long value Keystatic generated.
8. Redeploy. Astro inlines `PUBLIC_KEYSTATIC_GITHUB_APP_SLUG` at build time.
9. Open `https://<origin>/keystatic` on the deploy and sign in with a GitHub account that can write to the repo.
10. Pick the branch. Use `main` once this work has merged. Use `v1` while the site still ships from `v1`.

If GitHub says the redirect URI is not registered, add this callback on the GitHub App and save:

`https://<origin>/api/keystatic/github/oauth/callback`

The local setup adds that callback when Deployed URL is filled in. Add another callback only for a host you actually sign in from.

A save commits through the GitHub App. Vercel rebuilds the static pages from that commit.

## Commands

- `npm run dev` local site and CMS at `/keystatic` (local storage)
- `KEYSTATIC_STORAGE=github npm run dev` local CMS in GitHub mode, for the one-time app setup
- `npm run build` static pages plus the Keystatic server routes
- `npm run preview` serve the build
- `npm test` must pass before any merge: static touch-scroll guard plus iPhone WebKit swipe scroll test
- `npm run test:touch-guard` / `npm run test:scroll` run each part alone. For live: `BASE_URL=https://humansize.de npm run test:scroll`

Set `SITE_URL` to the production origin (no trailing slash). On Vercel it falls back to `VERCEL_PROJECT_PRODUCTION_URL`.

## House rules

- Mobile scroll is sacred. Never put an `<input type=checkbox switch>` under the finger (WebKit 321591): use a label overlay with a visibility:hidden switch. No non-passive touch listeners on content. No `touch-action: none` on cards or captions. `npm test` must stay green.
- Johann's voice is plain, direct, and short. No fluff.
- No em dashes.
- No colon reveals and no "X, not Y" constructions in new copy. The about text is an exception: keep it verbatim.
- Email is `schnettker.johann@gmail.com` only.
- Do not invent clients, numbers, quotes, or credits. Mark gaps as `TODO` in the content file.
- Bodil Ouédraogo: the scans already exist. Johann makes sculptures from them. He does not do the scanning.
- The design typeface is ABC Areal, self-hosted from `public/fonts`.
- Spell Tony's Chocolonely with the h and the apostrophe.

## Type scale

One size for the whole site: 23px, line-height 29px. Hierarchy comes from spacing.

## Design canvas (`/canvas`)

`/canvas` is a pan-and-zoom board of every page (home, every published case, 404) as live iframes at 1440 and 390 wide. Pages sit side by side (each page's 1440 frame, then its 390 frame, top-aligned); compared hosts are extra rows below in the same column order. It is open in `astro dev` and on Vercel previews (which already sit behind Vercel login). On production (humansize.de/canvas) it requires GitHub sign-in:

- It reuses Keystatic's GitHub session: the `keystatic-gh-access-token` cookie that Keystatic sets after `/keystatic` login.
- `src/lib/canvas-auth.mjs` checks that token server-side against GitHub. It calls `GET /user`, then `GET /repos/Jellouse/HS-Portfolio-2026`, and requires `permissions.push`. The result is cached for 5 minutes per token hash. The token never goes into the page.
- Not signed in (or token expired): a 401 page with "Sign in with GitHub". That link starts Keystatic's login, and `src/middleware.ts` sends you from `/keystatic` back to `/canvas` (via a 10-minute `canvas-return` cookie).
- Signed in without push access: 403.
- /canvas is noindex (meta and X-Robots-Tag), disallowed in robots, and excluded from the sitemap and llms.txt (`tests/canvas-auth.spec.mjs`).
- Frames load public pages with `?canvas=1`. That param only changes layout and adds noindex, nothing secret.

- Controls: frames ignore the pointer so the board always pans and zooms. Turn on Interact (bottom-left button or I) or hold Alt/Option to scroll, click or hover inside frames; Esc turns it off. Drag, trackpad or space+drag to pan; ctrl/cmd+wheel, pinch or `+`/`-` to zoom; `0` fits all, `1` is 100%. Click a label to open that page in a new tab.
- Frames load `<path>?canvas=1&vh=900` (desktop) or `vh=844` (mobile). The inline script in `src/layouts/Base.astro` then re-bases vh/svh units on that height, shows reveals in their final state and posts the page height to the board. Without `?canvas=1` it does nothing.
- Compare mode: `/canvas?compare=<url1>,<url2>` adds a row per URL loading the same paths from other Vercel preview hosts, labelled by host, e.g. `/canvas?compare=https://hs-portfolio-2026-git-foo-jellouse.vercel.app`. The other host needs the same canvas script (any branch with this change) for full height, and you must be logged in to Vercel in the same browser for protected previews.
- The page list is built from the Keystatic projects collection, so new cases appear automatically.

## Layout grid

Defined as custom properties in `src/styles/global.css`:

- **Desktop (≥760):** `--cols: 10`, `--margin: 160px` (it clamps down to 20px below 1440), `--gutter: 16px`, columns stretch (`--col` ≈ 97.6px at 1440).
- **Content span:** main images and all body copy share ONE centred span, `--content-span: 6` (`--content-width` ≈ 666px at 1440, left edge 387). Image pairs and process grids use it too. This covers case text, the summary and info, homepage about and captions, and the footer text.
- **Wide span:** image and pair blocks with the Keystatic "Large" checkbox and homepage wide cards use `--wide-span: 8` (≈ 893px).
- **Mobile/tablet (<760):** 4 cols, 20px margins, 16px gutters. Copy and images both take the full content width.
- Don't add ad-hoc max-widths for these blocks; change the span tokens instead.
- Press G to toggle the column overlay, in dev or on `/canvas` frames (`?canvas=1`). `?grid=1` also shows it.
- Case page spacing tokens: `--space-block` (between images and pairs; 84px desktop, 56px mobile), `--space-text` (visible gap around text blocks; 240 / 160), `--space-section` (before Process and Info; 240 / 160). Pair and process inner gaps use `--gutter` (16px). Change the tokens, not per-block margins.
