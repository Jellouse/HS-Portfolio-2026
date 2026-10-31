# Humansize

Portfolio and shop for Johann Schnettker. Static Astro 5 site. Content lives in the repo. Keystatic edits it locally, and on the deployed site through GitHub. The shop (Industrial Bloom) reads price and stock from Neon (`DATABASE_URL`) and checks out with Stripe.

Read [docs/agents/RULEBOOK.md](docs/agents/RULEBOOK.md) before any edit. It is mandatory. The rules are whatever this site already does most often. Anything new reuses that, or waits for Johann. Agents do not improvise new styles. The component map is [docs/agents/COMPONENTS.md](docs/agents/COMPONENTS.md).

## Structure

- `src/pages/index.astro` is the homepage. It opts into `Header`. The first project peeks above the fold.
- `src/pages/work/[slug].astro` builds every published project from its block list. New projects do not need a new page.
- `src/pages/shop/index.astro` and `src/pages/shop/[slug].astro` are the vase shop.
- `src/pages/canvas.astro` is the review board. `src/pages/admin.astro` is shop admin. `src/pages/preview/[slug].astro` is the CMS preview.
- `src/content.config.ts` is the typed schema. `keystatic.config.ts` edits the same files. Keep the two in step.
- `src/styles/type.css` is the only place font size, line height, and tracking are defined. `src/lib/type-scale.ts` mirrors those values for inline styles. `tests/type-scale.spec.mjs` fails if they drift.
- `src/styles/global.css` is the layout. It imports `type.css`.
- `src/components/` is the UI. Repeated page sections live in `src/components/sections/`. `src/scripts/` is the page behaviour, one module per behaviour. `src/lib/` is shared server and content code. `src/lib/shop/` is Neon, Stripe, and stock.
- Images live next to their project and go through `astro:assets` (`src/lib/images.ts`, `BlurImage.astro`).
- `@astrojs/vercel` is the adapter. `output` stays `static`. Pages and the `llms.txt` and `robots.txt` endpoints export `prerender = true`. `@keystatic/astro` injects `/keystatic` with `prerender: false`. The API is `src/pages/api/keystatic/[...params].ts` (`prerender = false`). CMS project preview checks the Keystatic GitHub cookie (or `Authorization: Bearer`) for push access, reads the entry live from GitHub, and sends `noindex` plus `Cache-Control: private, no-store`. On Vercel, Astro's `request.url` host is localhost, and Keystatic builds the GitHub `redirect_uri` from that URL. The route rebuilds it from `x-forwarded-host` and `x-forwarded-proto`, falling back to `host`. Leave Vercel's output directory empty so the adapter can publish both.

File names are kebab-case. A module that both pages use lives in `src/lib/` or `src/scripts/`, not copied into the page.

## Where content lives

- Site copy, email, about, socials: `src/content/site/site.yaml`
- One folder per project: `src/content/projects/<slug>/index.yaml` plus images in that folder
- Products: `src/content/products/<slug>/index.yaml`
- Image paths in YAML are absolute from the repo, like `/src/content/projects/atomic-ski/cover.jpg`

## Add a project

1. `npm run dev` and open `/keystatic`, or duplicate a project folder.
2. Set title, caption (`Name, Year`), order, summary (two or three sentences), cover, alt text, info lines (`Key: Value`, optional link on the value), and blocks. Leave out unknown info lines.
3. Blocks are `text`, `image`, `pair`, `video`, or `process`. `process` is an optional centred Process label and a two-column grid of photos. The project page ends with a centred Info label and the info list, aligned to the image column.
4. Leave `published` off until the cover image and alt text exist.
5. Put unknowns in `todo`. Those notes are not rendered.
6. Update `src/pages/llms.txt.ts` only if you want a line the generator does not already build. It reads the collection.

## Type tokens

Defined in `src/styles/type.css`. Whole pixels. Use the variables. Do not write a raw `font-size`, `line-height`, or `letter-spacing` in a page.

| Token | Value | Use |
| --- | --- | --- |
| `--text` / `--lh` | 23px / 29px | Body, titles, captions, footer, menus |
| `--text-lead` / `--lh-lead` | 28px / 35px | Titled text blocks on desktop. Below 760 they alias `--text` / `--lh` |
| `--text-ui` / `--lh-ui` | 16px / 22px | Admin and utility UI |
| `--text-meta` / `--lh-meta` | 13px / 16px | Badges, canvas chrome, small CMS labels |
| `--text-fine` / `--lh-fine` | 11px / 14px | Hero dials (`?dials` only) |
| `--lh-snug` | 20px | Canvas group labels |
| `--track` | -0.02em | Every line of site text |
| `--track-none` | 0px | The preview badge, which opts out |

`--text-title`, `--text-body`, `--lh-title`, and `--lh-body` alias `--text` and `--lh`. New CSS should use `--text` and `--lh`.

`--track` stays `-0.02em`. A whole-pixel tracking value would reflow body copy. Inline styles in the Keystatic admin read the same numbers from `src/lib/type-scale.ts`.

Sizes folded into the scale (these surfaces are tools, not the public pages):

- 12px and its 1.4 line-height became `--text-meta` / `--lh-meta` (13px / 16px): canvas labels and the save-budget badge
- 14px became `--text-meta` (13px): canvas sign-in and the upload status line
- 15px with a 1.5 line-height (22.5px) became `--text-ui` / `--lh-ui` (16px / 22px): the process-photo upload page
- 22px became `--text` (23px): that page's heading

## Locked behaviour

Do not change these. They are the design.

- Scroll-linked blur reveal: `animation-range: cover 0px cover 15vh` on `.reveal-word` (`src/scripts/text-reveal.ts`).
- Links: 1px underline, 3px offset (`text-underline-offset: 3px`).
- `@Humansize` on desktop hover: the `@` fades in and the word slides so the pair stays centred on the same point. The shift is `translateX(-50%)` of the `@` itself (`Header.astro`, `.brand-shift`). No measured width.
- Homepage face and shop ring: size and scroll distance come from `src/lib/intro-layout.ts` and `src/lib/viewport-layout.ts`. The face scales as one layer. Touch uses a scroll-driven animation. Desktop uses one rAF.
- View transitions: `hs-mark` between home and a project, `ib-mark` between `/shop` and a product. The root transition fades the new page in over the old one.

## Layout grid

Defined in `src/styles/global.css`:

- **Desktop (≥760):** `--cols: 10`, `--margin: 160px` (it clamps down to 20px below 1440), `--gutter: 16px`.
- **Content span:** main images and body copy share `--content-span: 6`. Image pairs and process grids use it too.
- **Wide span:** image and pair blocks with the Keystatic "Large" checkbox use `--wide-span: 8`.
- **Mobile/tablet (<760):** 4 cols, 20px margins, 16px gutters. Copy and images take the full content width.
- Don't add ad-hoc max-widths for these blocks. Change the span tokens.
- Press G to toggle the column overlay, in dev or on `/canvas` frames (`?canvas=1`). `?grid=1` also shows it.
- Case page spacing: `--space-block` (84px desktop, the margin on mobile), `--space-text` (240 / 160), `--space-section` (240 / 160). Pair and process gaps use `--gutter`. Paragraph gaps inside text use `--lh`.

`--scroll-nudge` (100px desktop, 0 on phones) is how far About scrolls above the text. `src/scripts/scroll-to-id.ts` reads it.

## Commands

- `npm run dev` local site and CMS at `/keystatic` (local storage)
- `KEYSTATIC_STORAGE=github npm run dev` local CMS in GitHub mode, for the one-time app setup
- `npm run build` static pages plus the Keystatic server routes
- `npm run preview` serve the build
- `npm test` builds, then runs every spec in `tests/run.mjs`. It must pass before any merge.
- `npm run test:quick` runs the specs without rebuilding. Filter with `node tests/run.mjs intro shop`.

Set `SITE_URL` to the production origin (no trailing slash). On Vercel it falls back to `VERCEL_PROJECT_PRODUCTION_URL`.

## Verification

- `npm test` is the behaviour check: touch scroll, reveal, intro face, shop ring, view transitions, underlines, canvas auth, shop grid.
- Pixel check, after two builds: `node scripts/visual-capture.mjs <static-root> <out-dir> <port>` then `node scripts/visual-diff.mjs <before-dir> <after-dir>`. Static root is `.vercel/output/static`. Captures `/`, `/shop/`, `/work/industrial-bloom/`, and `/work/tonys-chocolonely/` at 1440 and 390, full page, reduced motion, so the idle face and footer loop do not move between shots.
- `node scripts/brand-hover-crops.mjs` checks the `@Humansize` hover does not overlap.
- `BASE_URL=https://humansize.de npm run test:scroll` runs the touch scroll spec against a deployed site.

## Keystatic storage

`keystatic.config.ts` picks the storage kind from the environment.

- `npm run dev` uses local storage and writes the YAML in this repo.
- A production build uses GitHub storage on `Jellouse/HS-Portfolio-2026`.
- `KEYSTATIC_STORAGE=local` or `KEYSTATIC_STORAGE=github` overrides that. Restart `npm run dev` after changing it. Leave it unset on Vercel.

No `branchPrefix` is set, so a prefix is allowed and `main` stays selectable. The branch menu opens on the repository default branch, which is `main`.

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

If GitHub says the redirect URI is not registered, add this callback on the GitHub App and save:

`https://<origin>/api/keystatic/github/oauth/callback`

The local setup adds that callback when Deployed URL is filled in. Add another callback only for a host you actually sign in from.

A save commits through the GitHub App. Vercel rebuilds the static pages from that commit.

Shop env on Vercel: `DATABASE_URL` (Neon), `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`. Contact mail uses `RESEND_API_KEY` and optional `CONTACT_FROM` / `CONTACT_TO`.

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
- Whole pixels for type. Scroll and intro code writes whole pixels too.

## Design canvas (`/canvas`)

`/canvas` is a pan-and-zoom board of every page (home, every published case, shop, 404) as live iframes at 1440 and 390 wide. Pages sit side by side (each page's 1440 frame, then its 390 frame, top-aligned). Compared hosts are extra rows below in the same column order. It is open in `astro dev` and on Vercel previews. On production it requires GitHub sign-in:

- It reuses Keystatic's GitHub session: the `keystatic-gh-access-token` cookie.
- `src/lib/canvas-auth.mjs` checks that token against GitHub (`GET /user`, then the repo) and requires `permissions.push`. Cached 5 minutes per token hash. The token never goes into the page.
- Not signed in: 401 with "Sign in with GitHub". `src/middleware.ts` sends you from `/keystatic` back to `/canvas` (10-minute `canvas-return` cookie).
- Signed in without push access: 403.
- `/canvas` is noindex, disallowed in robots, and excluded from the sitemap and llms.txt.

Frames load public pages with `?canvas=1`. That param only changes layout and adds noindex.

Controls: frames ignore the pointer so the board always pans and zooms. Turn on Interact (or I) or hold Alt/Option to use a frame. Esc turns it off. `0` fits all, `1` is 100%.

## UI and motion skills

Emil Kowalski's skills (github.com/emilkowalski/skills, commit 2d22863, MIT, see `.agents/skills/LICENSE-emilkowalski-skills`) are vendored in `.agents/skills/`. Load the relevant SKILL.md before any UI, animation, drawer, transition, or polish work:

- `animate` (+ RECIPES.md) to build motion, `review-animations` to critique it, `improve-animations` for an audit, `animation-performance` for jank.
- `emil-design-eng`, `apple-design`, `break-ui`, `find-animation-opportunities`, `animation-vocabulary`.

Site rules still win: whole pixels, keep link underlines, scroll-linked blur reveal.
