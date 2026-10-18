# Humansize verification map

Maintained recipes for proving user-facing behaviour. Read this index, then the feature file.

## Baseline preconditions

- Built site available via `BASE_URL` or a static server of `.vercel/output/static` after `npm run build`.
- `npm run test:touch-guard` is green.
- Do not treat unpublished Framer drafts (`published: false`) as missing homepage bugs.

## Driving conventions

- Prefer stable selectors: `.card`, `.caption`, `.project`, `.contact-label`, `[data-haptic-overlay]`.
- Touch scroll proof uses `npm run test:scroll` (CDP touch, not wheel).
- CMS preview proof needs a live origin and a GitHub token with push access (cookie or Bearer).

## Features

- [Homepage feed](./homepage.md)
- [Project page](./project-page.md)
- [CMS preview](./cms-preview.md)
- [Motion and haptics](./motion-haptics.md)
