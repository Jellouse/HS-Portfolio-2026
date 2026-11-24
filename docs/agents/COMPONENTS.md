# Component map

Pages compose these. Paths are from the repo root. Public routes are the pages a visitor can open. `src/components/sections/registry.mjs` is the same list the dev catalogue and `npm run check:design` read.

The catalogue is `/dev/components` in `astro dev`. It is not part of the production build, the sitemap, or `/canvas`.

## Extracted

These were repeated, or the same menu and price markup copied across pages. The markup and classes are the ones the site already shipped.

| Component | File | Props | Pages |
| --- | --- | --- | --- |
| Prose | `src/components/sections/Prose.astro` | `paragraphs: string[]` | `/`, `/shop/:slug`, `/work/:slug` |
| Price | `src/components/sections/Price.astro` | `slug`, `mode` (`suffix` or `prefix`), `text` | `/shop/:slug` |
| MainMenu | `src/components/sections/MainMenu.astro` | `variant` (`header`, `shop`, or `project`), `home?` | dev catalogue |
| CornerMark | `src/components/sections/CornerMark.astro` | `class`, `href`, `label`, slot for the mark | dev catalogue |
| IntroHero | `src/components/sections/IntroHero.astro` | `variant` (`home` or `shop`), `site?`, illustration slot | dev catalogue |
| ShopIntro | `src/components/sections/ShopIntro.astro` | none | dev catalogue |
| ShopProduct | `src/components/sections/ShopProduct.astro` | `product`, `index`, `sizes` | dev catalogue |
| ShopDetailHead | `src/components/sections/ShopDetailHead.astro` | `title`, `slug`, `eur` | `/shop/:slug` |
| ShopCopy | `src/components/sections/ShopCopy.astro` | `text` | `/shop/:slug` |
| ShopFigure | `src/components/sections/ShopFigure.astro` | `src`, `alt`, `sizes`, `outline?`, `priority?` | `/shop/:slug` |
| ShopDetailSection | `src/components/sections/ShopDetailSection.astro` | `heading?`, `text?`, `sizes`, `image?` | `/shop/:slug` |
| ShopWild | `src/components/sections/ShopWild.astro` | `title?`, `sizes`, `images` | `/shop/:slug` |
| ShopInfo | `src/components/sections/ShopInfo.astro` | `items` | `/shop/:slug` |
| ShopBuyBar | `src/components/sections/ShopBuyBar.astro` | `slug` | `/shop/:slug` |
| NotFound | `src/components/sections/NotFound.astro` | none | `/404` |

`SmallMenu` still exists. It renders `MainMenu` with `variant="project"`.

## Already components

These were already shared. Pages and other components keep using them.

| Component | File | Props | Pages |
| --- | --- | --- | --- |
| About | `src/components/About.astro` | `paragraphs` | `/` |
| Blocks | `src/components/Blocks.astro` | `blocks`, `slug?`, `processFromFolder?`, `processFolderSrcs?`, `info?` | `/work/:slug`, `/preview/:slug` |
| BlurImage | `src/components/BlurImage.astro` | `src`, `alt`, `sizes`, `priority?`, `plain?`, `flush?`, `outline?`, `fade?` defaults to true | `/`, `/shop/:slug`, `/work/:slug` |
| VideoFrame | `src/components/VideoFrame.astro` | `src`, `poster?`, `label?`, `plain?`, `flush?`, `outline?`, `priority?`, `fade?` defaults to true | `/`, `/work/:slug` |
| VideoBlock | `src/components/VideoBlock.astro` | `src`, `poster?`, `label?`, `frame?`, `flush?`, `outline?` | `/work/:slug` |
| ImageBlock | `src/components/ImageBlock.astro` | `src`, `alt`, `frame?`, `priority?`, `flush?`, `outline?` | `/work/:slug` |
| ImagePair | `src/components/ImagePair.astro` | `left`, `leftAlt`, `right`, `rightAlt`, `leftPriority?`, `rightPriority?`, `frame?`, `outline?` | `/work/:slug` |
| ProcessBlock | `src/components/ProcessBlock.astro` | `images` (`src` and/or `video`, `poster?`, `alt`, `flush?`, `outline?`) | `/work/:slug` |
| TextBlock | `src/components/TextBlock.astro` | `text?`, `heading?`, `year?` | `/work/:slug` |
| ProjectHero | `src/components/ProjectHero.astro` | `title`, `years?`, `summary?` | `/work/:slug` |
| ProjectArticle | `src/components/ProjectArticle.astro` | `project`, `processFolderSrcs?` | `/work/:slug`, `/preview/:slug` |
| ProjectCard | `src/components/ProjectCard.astro` | `project`, `priority?` | `/` |
| ProjectFeed | `src/components/ProjectFeed.astro` | `projects`, `about` | `/` |
| Info | `src/components/Info.astro` | `items` | `/work/:slug`, `/shop/:slug` |
| Header | `src/components/Header.astro` | `site` | `/` |
| Footer | `src/components/Footer.astro` | `site` | every page, through Base |
| Seo | `src/components/Seo.astro` | `title`, `description`, `image?`, `type?`, `jsonLd?`, `noindex?` | every page, through Base |
| ContactSheet | `src/components/ContactSheet.astro` | `email` | every page, through Base |
| ContactDrawer | `src/components/ContactDrawer.tsx` | `email` | every page, through ContactSheet. Full-viewport hub reusing arrow face / pill / back chrome. Step hops and About open/close go through `runChromeVt` (`src/lib/chrome-vt.ts`). |
| ContactFace | `src/components/ContactFace.tsx` | `filterId?` | ContactDrawer service step |
| Peeps | `src/components/Peeps.astro` | `maxH?` | every page, through Footer |
| PeepsStatic | `src/components/PeepsStatic.astro` | none | every page, through Peeps |
| HeroBlob | `src/components/HeroBlob.astro` | none | `/` |
| Mark | `src/components/Mark.astro` | none | `/` when `?hero=gradient` |
| MarkFace | `src/components/MarkFace.astro` | none | dev catalogue |
| SmallMenu | `src/components/SmallMenu.astro` | none | dev catalogue |
| LeadCard | `src/components/LeadCard.astro` | none | not mounted |

`BlurImage` and `VideoFrame` add `scroll-media` when `fade` is true. True is the default. Leave it.

## Shop gallery

`/shop` and the homepage Shop screen are the same fullscreen gallery. Both render `src/components/ArrowNav.astro`, which is also the homepage. The slides come from `shopSlides()` in `src/lib/arrow-nav.ts`: one per product with `overview.show` on, in `order`, from the product's `viewer.desktop` and `viewer.mobile` images. `/shop` passes `startScreen="shop"` and `backHref="/"`, so it opens on the gallery and the back control is a plain link home. The `full` flag on the Shop screen in `arrow-nav.yaml` makes it open fullscreen on both.

## Proposed

These look related and stay separate. Folding them into one component would pick one spacing and change the pages. Johann designs that if he wants it.

| Idea | What exists now | Why it stays split |
| --- | --- | --- |
| Centred label | `info-label`, `process-label`, `shop-detail-heading`, `text-block-title` | The margins differ (`60px`, `72px`, `--lh`, and the titled text block). |
| Photo grid | `process-grid` and `shop-wild-grid` | Process uses `--gutter`. The wild grid uses `12px 8px`. |
| Text section | `about`, `shop-intro`, `text-block`, `project-summary` | `Prose` is the shared paragraphs. The shells use `--space-text`, `--space-text-titled`, and the shop intro offset. |
| Media frame | `image-block` and `shop-detail-image` | Project images use the content span. Shop figures use their own bottom margin. |
| Services landing | `services-hub` | Back, the face, and Physical Build / Digital Build. Same controls as the homepage. Contact reuses this chrome in `ContactDrawer`. |
| Services detail | `service-page` | Grey face, process chart, and FAQ. `Prose`, `BlurImage`, and `VideoFrame` are the shared pieces inside it. |
