# Homepage feed

The homepage is the work. Project cards (image + caption) stack in order; the lead faces block sits in the feed.

## Sub-features

- `feed-cards` shows published projects only.
- `card-caption` labels each project (title + years).
- `scroll-gap` vertical swipes that start on the image, gap, caption, or below the caption scroll the page on iPhone.

## How to get to it (user POV)

- Open `/` on humansize.de or the deploy under test.

## Driving it with verify-humansize

Preconditions:

- Doctor baseline is green.
- At least one `.card .caption` is present (e.g. Industrial Bloom).

- **See cards.** Open `/`. Expect multiple `.card` elements and captions; no unpublished slug as a live `/work/` card.
- **Scroll from the gap.** Run `BASE_URL=<origin> npm run test:scroll`. Homepage spots (image, image-caption gap, caption, below caption) all report OK with Δ scrollY > 24.
- **Proof.** Screenshot `/` at 390×844 and 1280×800 into `artifacts/verify-humansize/homepage/`.

## Gotchas

- Desktop (≥760px) cards use `display: contents`; haptic hosts attach only on the mobile card box.
- Framer drafts stay in the repo with `published: false` and must not appear in the feed.
