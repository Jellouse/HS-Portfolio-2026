# Rulebook

Read this before editing the site. The rules are the values and patterns that already show up most often. Anything new reuses a component, a token, or one of those values. If nothing on the site fits, stop. Johann designs it. Agents do not improvise new styles.

`npm run check:design` locks this file. The line-by-line exceptions are `docs/agents/known-drift.json`. The component map is `docs/agents/COMPONENTS.md`.

## Typography

Whole pixels only. Sizes live in `src/styles/type.css`. `src/lib/type-scale.ts` mirrors them for the few inline styles in the Keystatic tools.

| Token | Value | Where it shows up |
| --- | --- | --- |
| `--text` / `--lh` | 23px / 29px | Body, titles, captions, footer, menus. This is the size the public pages use. |
| `--text-lead` / `--lh-lead` | 28px / 35px | Titled text blocks on desktop. Below 760 they alias `--text` / `--lh`. |
| `--text-ui` / `--lh-ui` | 16px / 22px | Admin and utility UI. |
| `--text-meta` / `--lh-meta` | 13px / 16px | Badges, canvas chrome, small CMS labels. |
| `--text-fine` / `--lh-fine` | 11px / 14px | Hero dials (`?dials` only). |
| `--lh-snug` | 20px | Canvas group labels. |
| `--track` | -0.02em | Every line of site text. |
| `--track-none` | 0px | The preview badge. |

New text uses `font-size: var(--text)` and `line-height: var(--lh)`, or another token in this table. A raw `font-size` in pixels is off the scale. A decimal pixel size is off the scale. `--text-title` and `--text-body` alias `--text`. New CSS uses `--text` and `--lh`.

Near sizes already got folded into these tokens (12px and 14px into `--text-meta`, 15px into `--text-ui`, 22px into `--text`). Leave that folding as it is.

## Spacing

The spacing system is the custom properties in `src/styles/global.css`. Use the token when the job already has one.

| Token | Desktop | Below 760 |
| --- | --- | --- |
| `--gutter` | 16px | 16px |
| `--margin` | 160px, clamping down toward 20px below 1440 | the page margin |
| `--pad` | 20px | 20px |
| `--space-title` | 80px | 48px |
| `--space-block` | 84px | `--margin` |
| `--space-text` | 240px | 160px |
| `--space-text-titled` | 150px | 100px |
| `--space-section` | 240px | 160px |
| `--space-2xs` | 8px | 8px |
| `--space-xs` | 15px | 15px |
| `--space-sm` | 24px | 24px |
| `--space-md` | 40px | 40px |
| `--space-lg` | 64px | 64px |
| `--space-xl` | 96px | 96px |
| `--space-2xl` | `--space-section` | `--space-section` |
| `--scroll-nudge` | 100px | 0 on phones |
| `--image-gap` | `--gutter` | `--margin` |

`--space-section` and `--space-text` are the large rhythm (240 desktop, 160 below 760).

Raw pixels that already recur, and are allowed when no token is the job, are 1, 3, 4, 6, 8, 10, 12, 16, 20, 40, and 96. 1px is the link underline and the hairline. 3px is the underline offset. 16px is `--gutter`. 20px is `--pad`. Counts of those raw steps in margin, padding, and gap are the high ones on the site.

Radius uses `--radius` (31px) and `--radius-sm` (15px).

A new margin, padding, gap, or radius pixel that is not in this list waits for Johann.

## Color

Tokens on `:root` in `src/styles/global.css`:

| Token | Value | Role |
| --- | --- | --- |
| `--ink` | `#000` | Text. The common black. |
| `--ink-40` | `rgba(0, 0, 0, 0.4)` | Year lines and quiet text. |
| `--muted` | `var(--ink-40)` | The same quiet text. |
| `--bg` | `#fff` | Page background. The common white. |
| `--bg-mobile` | `#fff` | Same white. |
| `--red` | `#b70606` | The Humansize red. Hover on filled buttons. The mark. |
| `--service-face` | `#b0b0b0` | The services detail face. Same drawing as the homepage mark. |
| `--line` | `#d6d6d6` | Hairline rules. |
| `--image-stroke` | `#e5e5e5` | Image outline. |
| `--button-fill` | `#f2f2f2` | Buy button fill. |
| `--page-bg` | `var(--bg)` | The painted page. |

New color uses a token. A raw hex outside a token declaration is drift.

## Motion

The common pair is `var(--dur-hover)` with `var(--ease-out)`. Opacity on menus often uses `var(--dur-fast)` or `var(--dur-sheet)` with `var(--ease-out)`. Media fades use `var(--dur-media)`.

| Token | Value |
| --- | --- |
| `--ease-out` | `cubic-bezier(0.23, 1, 0.32, 1)` |
| `--ease-out-expo` | `cubic-bezier(0.16, 1, 0.3, 1)` |
| `--ease-out-quad` | `cubic-bezier(0.25, 0.46, 0.45, 0.94)` |
| `--ease-in-out` | `cubic-bezier(0.77, 0, 0.175, 1)` |
| `--ease-in-out-expo` | `cubic-bezier(0.65, 0, 0.15, 1)` |
| `--ease-drawer` | `cubic-bezier(0.32, 0.72, 0, 1)` |
| `--dur-fast` | 150ms |
| `--dur-hover` | 160ms |
| `--dur-ui` | 200ms |
| `--dur-menu` | 240ms |
| `--dur-sheet-out` | 260ms |
| `--dur-media` | 300ms |
| `--dur-sheet` | 400ms |

`linear` is the timing on the delayed visibility handoff (`0s linear`). `30ms` is the reveal stagger already used on text lines. `transition: none` is the reduced-motion stop.

New motion uses these tokens. A new duration or a new cubic-bezier waits for Johann.

`BlurImage` and `VideoFrame` default `fade` to true, which adds `scroll-media`. Keep that default.

## Breakpoints

The site has one layout break.

| Query | Use |
| --- | --- |
| `max-width: 759px` | Mobile and tablet. The common query. |
| `min-width: 760px` | Desktop. |
| `max-width: 1439px` | The margin clamp under the 1440 grid. |

Image `sizes` use 760 and 1440 for the same break. A new width query waits for Johann.

## Components

Reuse a component from `src/components/` or `src/components/sections/` before adding markup. The map is `docs/agents/COMPONENTS.md`. Pages compose those components. A page does not paste a section that already has a root class in the registry.

Styles go in `src/styles/global.css` or `src/styles/type.css`, using the tokens above. A one-off `style` attribute is drift. Two patterns already exist and stay: a custom property only (`--i` on the project menu) and the blur placeholder `background-image` on `BlurImage`.

## Checks

- `npm run check:design` compares the source with this rulebook and fails on anything new.
- `npm run check:visual` screenshots every public page at 1440 and 390 against `tests/visual/baseline`. It needs `npm run build` first. The capture waits for fonts and for every image to decode. Videos stay on their poster still. The shop ring waits until its canvas has painted two identical frames. The spinning mark is locked at its rest angle before the shot, and the shot is kept only once two frames match. A picture may differ by at most 0.01% of its pixels. That budget is the antialiasing on the shop buy button, which settles on one of two edges a level apart. A larger diff fails.
- Both run in `.github/workflows/design.yml`.
- `npm test` runs the design check with the other specs.

Update `docs/agents/known-drift.json` only when Johann has accepted a deviation, with `node scripts/check-design.mjs --update`.

## Known drift

The pages keep these. Changing them would move the picture. They are listed so a later edit does not copy them.

- Raw hex outside the `:root` tokens. The mark and peep SVGs repeat `#b70606` and `#f8f8f8`. Tool pages (canvas, admin, the upload screen, Keystatic fields) use their own greys (`#111`, `#8a8a8a`, `#1a1a1a`, and several near-whites). The contact sheet paints `#fff` again. `#ffffff` on the OG image is the same white as `--bg`.
- Spacing and radius pixels off the scale above. Shop and project sections use one-off distances such as 24, 32, 56, 60, 72, 86, 90, 116, 120, 128, and 136. Tool chrome uses 2px, 10px radius, and 14px padding in places. The full list is the `space` and `radius` rows in `known-drift.json`.
- `max-width: 720px` in `src/scripts/site-scroll-motion.ts`. The layout break everywhere else is 759 / 760.
- Durations outside the table: 350ms on the first-paint reveal, 550ms on the blur-in, 120ms on the upload progress bar, 500ms and 600ms on the mark view transitions, 60ms and 90ms on the menu delay, and the spin and wordmark timings in `src/scripts/spin-mark.ts` and `src/scripts/wordmark-intro.ts`.
- Easings outside the table: `cubic-bezier(0.22, 0.61, 0.36, 1)` on the spinning mark and `cubic-bezier(0.22, 1, 0.36, 1)` on the wordmark.
- Inline styles on the upload screen, the video URL field, the image fields, and the save-budget badge.

The centred labels, the two photo grids, and the text-section shells in the component map are the same kind of drift. They stay separate until Johann designs one.
