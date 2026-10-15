# Humansize

Portfolio for Johann Schnettker. Static Astro site, content in the repo, Keystatic for local editing.

## Architecture

- `src/pages/index.astro` is the homepage. The work is the page. The first project peeks above the fold.
- `src/pages/work/[slug].astro` builds every published project from its block list. New projects do not need a new page. Close returns to the homepage.
- `src/content.config.ts` is the typed schema. `keystatic.config.ts` edits the same files. Keep the two in step.
- `src/components/` holds the UI. Header, Mark, ProjectFeed, ProjectCard, About, ProjectHero, TextBlock, ImageBlock, ImagePair, Info, Footer.
- Images live next to their project and go through `astro:assets` (`src/lib/images.ts`, `BlurImage.astro`).
- Keystatic is mounted only during `npm run dev`. Its admin routes are server routes, and the Vercel build stays `output: 'static'`.

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

## Commands

- `npm run dev` local site and CMS at `/keystatic`
- `npm run build` static build to `dist/`
- `npm run preview` serve the build

Set `SITE_URL` to the production origin (no trailing slash). On Vercel it falls back to `VERCEL_PROJECT_PRODUCTION_URL`.

## House rules

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
