# Project page

A published project renders hero, blocks (text, image, video, pair, process), info list, and site footer. The mark links home.

## Sub-features

- `hero` title + summary.
- `blocks` media and text from the YAML block list.
- `info` key/value list with optional links.
- `scroll-media` swipes on project images and text scroll the page.

## How to get to it (user POV)

- Tap a homepage card/caption.
- Open `/work/<slug>` for a published slug (e.g. `/work/atomic`).

## Driving it with verify-humansize

Preconditions:

- Homepage doctor green; pick a published href from a card.

- **Open project.** Go to `/work/<slug>`. Expect `.project`, `.project-hero`, `.info`.
- **Scroll.** Covered by `npm run test:scroll` project image/text cases.
- **Proof.** Screenshot mid-page at 390 and 1280 under `artifacts/verify-humansize/project-page/`.

## Gotchas

- Unpublished slugs 404 on `/work/*`; use CMS preview instead.
- Process-from-folder images come from `process/` at build time on static pages.
