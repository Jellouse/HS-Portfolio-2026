# Humansize

Portfolio site for Johann Schnettker.

Astro, static pages, for Vercel. Content is Markdown-free YAML in the repo. `npm run dev` edits those files locally. On the deployed site, Keystatic commits to `Jellouse/HS-Portfolio-2026` through a GitHub App.

## Scripts

- `npm run dev` starts the site and the CMS at `/keystatic`
- `npm run build` writes `dist/`
- `npm run preview` serves the build

Node 22.

## Vercel

- Framework: Astro
- Build command: `npm run build`
- Output directory: leave this empty. `@astrojs/vercel` publishes the static pages and the Keystatic server routes. A custom `dist` directory drops `/keystatic`.
- Set `SITE_URL` to the production origin when the domain is final. Example: `https://humansize.studio`
- `/keystatic` and `/api/keystatic` run on the server. Every other page is prerendered. The API route is `src/pages/api/keystatic/[...params].ts`. It rebuilds the request URL from `x-forwarded-host` and `x-forwarded-proto` (falling back to `host`) so the GitHub callback uses the public origin.

`npm run dev` uses local storage. The production build uses GitHub storage. `KEYSTATIC_STORAGE=local` or `KEYSTATIC_STORAGE=github` overrides that. Leave `KEYSTATIC_STORAGE` unset on Vercel.

No branch prefix is enforced, so a prefix is allowed. The branch menu opens on the repository default branch, `main`. After this work is merged, edit `main`. Until then, choose `v1`, or open `/keystatic/branch/v1`.

### One-time GitHub setup

Do this once. Keystatic's Create GitHub App screen writes the secrets into a local `.env`, and that callback only completes in development. Copy the values into Vercel yourself. Do not commit `.env`.

1. Deploy the site and copy the public origin, with no trailing slash. Use the stable production host. GitHub matches the OAuth callback exactly, and a per-deployment preview URL changes on every build.
2. From the repo, run `KEYSTATIC_STORAGE=github npm run dev`.
3. Open `http://127.0.0.1:4321/keystatic`.
4. On the setup screen, set Deployed URL to the public origin. Leave the organization field empty while the repo is on your user account.
5. Choose Create GitHub App. Name the app, then install it on `Jellouse/HS-Portfolio-2026` and grant that repository.
6. Keystatic returns to the admin UI and appends these variables to `.env`:
   - `KEYSTATIC_GITHUB_CLIENT_ID`
   - `KEYSTATIC_GITHUB_CLIENT_SECRET`
   - `KEYSTATIC_SECRET`
   - `PUBLIC_KEYSTATIC_GITHUB_APP_SLUG`
7. In the Vercel project settings, add those four variables for Production and Preview. Keep `KEYSTATIC_SECRET` as the long value Keystatic wrote.
8. Redeploy. The public app slug is read at build time.
9. Open `https://<origin>/keystatic` and sign in with a GitHub account that can write to the repo.
10. Pick the branch. Use `main` once this work has merged. Use `v1` while the site still ships from `v1`.

If GitHub says the redirect URI is not registered, open the app settings and add this callback, then save:

`https://<origin>/api/keystatic/github/oauth/callback`

A save on the deployed admin commits through the GitHub App. Vercel rebuilds the static pages from that commit.

## Content

See `AGENTS.md` for the schema, how to add a project, and the house rules.

Email on the site is schnettker.johann@gmail.com.
