# Motion and haptics

Quiet motion: menu sequence/grow, scroll fade, link press-scale, iOS haptic label overlay. Reduced-motion disables movement.

## Sub-features

- `menu-sequence` @Humansize label fades out, then options fade/grow in.
- `scroll-fade` `.fade-in` blocks opacity-in once via IntersectionObserver.
- `press-scale` links scale to 0.97 on `:active` (not on media cards).
- `haptic-label` coarse pointers get `[data-haptic-overlay]` labels; switch is visibility:hidden.

## How to get to it (user POV)

- Homepage and project pages on a phone or touch emulator.
- Hover/tap `@Humansize` in the header.

## Driving it with verify-humansize

Preconditions:

- Touch context (`hasTouch`) or a real phone; `npm run test:touch-guard` green.

- **Haptic DOM.** On iPhone UA without `navigator.vibrate`, after load, cards expose `label[data-haptic-overlay]` containing `input[switch]` with `visibility: hidden`. Gap `elementFromPoint` must not be `INPUT`.
- **Scroll.** `npm run test:scroll` (see homepage feature).
- **Menu.** Open `@Humansize` on mobile; options appear after the label fades; page still scrolls when swiping the feed.
- **Proof.** Short clip or mid-transition screenshots under `artifacts/verify-humansize/motion-haptics/`.

## Gotchas

- Putting the switch under the finger regresses iPhone scroll (third time is not allowed).
- Desktop cards are `display: contents` — no per-card haptic host.
