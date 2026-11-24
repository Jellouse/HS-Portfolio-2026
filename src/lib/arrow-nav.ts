import { getImage } from 'astro:assets';
import type { ImageMetadata } from 'astro';
import { getCollection, getEntry, type CollectionEntry } from 'astro:content';
import { getProjects, getSite, renderInline } from './content';
import { galleryCategoryValues } from './gallery-categories';
import { isProcessVideo, processVideoPoster, processVideoSrc } from './project-blocks.mjs';
import { imageHasAlpha } from './image-alpha';
import { resolveImage } from './images';
import { getProducts, type ProductEntry } from './shop';

export type ArrowDir = 'left' | 'right' | 'up' | 'down';

export type ArrowSlide = {
  src: string;
  mobile: string;
  poster: string;
  blur: string;
  alt: string;
  title: string;
  caption: string;
  product: string;
  alpha: boolean;
  kind: 'image' | 'video';
  width: number;
  height: number;
  slug: string;
  href: string;
  action: string;
};

const GALLERY_MAX = 2000;
// The shop fills the viewport, so it keeps the 2x export. A 1600px desktop at 2x is 3200.
const SHOP_MAX = 3200;

async function galleryStill(
  file: ImageMetadata,
  alpha: boolean,
  quality?: number,
  maxWidth = GALLERY_MAX,
  format?: 'webp' | 'png' | 'avif',
) {
  const display = await getImage({
    src: file,
    width: Math.min(maxWidth, file.width),
    format: format ?? (alpha ? 'png' : 'webp'),
    ...(quality ? { quality } : {}),
  });
  const blur = alpha
    ? ''
    : (
        await getImage({
          src: file,
          width: 24,
          format: 'webp',
          quality: 40,
        })
      ).src;
  return { src: display.src, blur };
}

export type ArrowNode = {
  id: string;
  parent: string;
  dir: ArrowDir;
  label: string;
  title: string;
  body: string;
  kind: 'branch' | 'gallery' | 'placeholder';
  full?: boolean;
  slides: ArrowSlide[];
  paragraphs: string[];
  href?: string;
};

export type ArrowTree = {
  landing: { title: string; body: string; hint: string };
  nodes: ArrowNode[];
};

type GalleryId = (typeof galleryCategoryValues)[number];

type Piece = { gallery: GalleryId; src: string; alt: string; video?: string; poster?: string };

const galleryIds = new Set<string>(galleryCategoryValues);

function isGallery(value: string | undefined): value is GalleryId {
  return !!value && galleryIds.has(value);
}

function projectPieces(data: CollectionEntry<'projects'>['data']): Piece[] {
  const pieces: Piece[] = [];
  const add = (gallery: string | undefined, piece: Omit<Piece, 'gallery'>) => {
    if (!isGallery(gallery) || !piece.src) return;
    pieces.push({ gallery, ...piece });
  };
  for (const block of data.blocks) {
    const value = block.value;
    if (block.discriminant === 'image') add(value.gallery, { src: value.src, alt: value.alt });
    else if (block.discriminant === 'video' && value.src) {
      add(value.gallery, { src: value.src, alt: value.alt || '', video: value.src, poster: value.poster || '' });
    } else if (block.discriminant === 'pair') {
      add(value.leftGallery, { src: value.left, alt: value.leftAlt });
      add(value.rightGallery, { src: value.right, alt: value.rightAlt });
    } else if (block.discriminant === 'process') {
      for (const image of value.images) {
        if (isProcessVideo(image)) {
          const video = processVideoSrc(image);
          const poster = processVideoPoster(image);
          add(image.gallery, { src: poster || video, alt: image.alt, video, poster });
        } else {
          add(image.gallery, { src: image.src, alt: image.alt });
        }
      }
    }
  }
  return pieces;
}

async function imageSlide(piece: Piece, title: string, caption: string, slug: string, href: string, action: string): Promise<ArrowSlide> {
  if (piece.video) {
    const poster = piece.poster ? resolveImage(piece.poster) : null;
    const still = poster ? await galleryStill(poster, false) : { src: '', blur: '' };
    return {
      src: piece.video,
      mobile: '',
      poster: still.src,
      blur: still.blur,
      alt: piece.alt,
      title,
      caption,
      product: '',
      alpha: false,
      kind: 'video',
      width: poster?.width || 16,
      height: poster?.height || 10,
      slug,
      href,
      action,
    };
  }
  const file = resolveImage(piece.src);
  const alpha = await imageHasAlpha(file);
  const still = await galleryStill(file, alpha);
  return {
    src: still.src,
    mobile: '',
    poster: '',
    blur: still.blur,
    alt: piece.alt,
    title,
    caption,
    product: '',
    alpha,
    kind: 'image',
    width: file.width,
    height: file.height,
    slug,
    href,
    action,
  };
}

async function viewerSlide(
  product: ProductEntry,
  desktop: { src?: string | null; alt?: string },
  mobile?: { src?: string | null; alt?: string },
): Promise<ArrowSlide> {
  const file = resolveImage(desktop.src!);
  // The shop frames are cut out, so the page background shows around the vase.
  const alpha = await imageHasAlpha(file);
  const still = await galleryStill(file, alpha, 62, SHOP_MAX, 'avif');
  const phone = mobile?.src ? resolveImage(mobile.src) : null;
  const phoneAlpha = phone ? await imageHasAlpha(phone) : false;
  return {
    src: still.src,
    mobile: phone ? (await galleryStill(phone, phoneAlpha, 62, SHOP_MAX, 'avif')).src : '',
    poster: '',
    blur: still.blur,
    alt: desktop.alt || mobile?.alt || product.data.name,
    title: product.data.name,
    caption: '',
    product: '',
    alpha,
    kind: 'image',
    width: file.width,
    height: file.height,
    slug: '',
    href: `/shop/${product.id}/`,
    action: 'Learn more',
  };
}

async function shopSlides(): Promise<ArrowSlide[]> {
  const products = (await getProducts()).filter((product) => product.data.overview.show !== false);
  const slides: ArrowSlide[] = [];
  for (const product of products) {
    const viewer = product.data.viewer;
    if (viewer?.desktop?.src) {
      slides.push(await viewerSlide(product, viewer.desktop, viewer.mobile));
      continue;
    }
    const seen = new Set<string>();
    const detail = product.data.detail;
    const images = [
      product.data.overview.left,
      product.data.overview.right,
      ...detail.images,
      ...detail.sections.map((section) => section.image),
      ...detail.wild,
    ];
    for (const image of images) {
      if (!image?.src || image.gallery !== 'shop' || seen.has(image.src)) continue;
      seen.add(image.src);
      const file = resolveImage(image.src);
      const alpha = await imageHasAlpha(file);
      const still = await galleryStill(file, alpha);
      slides.push({
        src: still.src,
        mobile: '',
        poster: '',
        blur: still.blur,
        alt: image.alt || product.data.name,
        title: product.data.name,
        caption: '',
        product: '',
        alpha,
        kind: 'image',
        width: file.width,
        height: file.height,
        slug: '',
        href: `/shop/${product.id}/`,
        action: 'Learn more',
      });
    }
  }
  return slides;
}

export function serviceButtonLabel(title: string) {
  const lower = title.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

async function serviceNodes(): Promise<ArrowNode[]> {
  const services = (await getCollection('services')).sort((a, b) => a.data.order - b.data.order);
  const [left, right] = services;
  const base = { title: '', body: '', kind: 'branch' as const, slides: [], paragraphs: [] };
  const hub: ArrowNode = { ...base, id: 'services', parent: 'about', dir: 'left', label: 'Services', href: '/services/' };
  const pills = ([['left', left], ['right', right]] as const).flatMap(([dir, entry]) =>
    entry
      ? [
          {
            ...base,
            id: `services-${entry.id}`,
            parent: 'services',
            dir,
            label: serviceButtonLabel(entry.data.title),
            href: `/services/${entry.id}/`,
          } satisfies ArrowNode,
        ]
      : [],
  );
  return [hub, ...pills];
}

export async function getArrowNav(): Promise<ArrowTree> {
  const entry = await getEntry('arrowNav', 'arrow-nav');
  if (!entry) throw new Error('Missing src/content/site/arrow-nav.yaml');
  const { landing, nodes } = entry.data;
  const site = await getSite();
  const projects = await getProjects();
  return {
    landing,
    nodes: await Promise.all(
      nodes.map(async (node) => {
        const slides =
          node.kind !== 'gallery'
            ? []
            : node.id === 'shop'
              ? await shopSlides()
              : (
                  await Promise.all(
                    projects.map(async (project) => {
                      const caption = renderInline(project.data.summary.replace(/\s+/g, ' ').trim());
                      const mine = projectPieces(project.data).filter((piece) => piece.gallery === node.id);
                      return Promise.all(
                        mine.map((piece) => imageSlide(piece, project.data.title, caption, project.id, `/work/${project.id}/`, 'View project')),
                      );
                    }),
                  )
                ).flat();
        return {
          id: node.id,
          parent: node.parent,
          dir: node.dir,
          label: node.label,
          title: node.title,
          body: node.body,
          kind: node.kind,
          full: node.full === true,
          paragraphs: node.id === 'about' ? site.about.map((paragraph) => renderInline(paragraph)) : [],
          slides,
        };
      }),
    ).then(async (list) => [...list, ...(await serviceNodes())]),
  };
}

// /shop renders the shop gallery on its own. Same slides, same controls, no landing behind it.
export async function getShopNav(): Promise<ArrowTree> {
  const entry = await getEntry('arrowNav', 'arrow-nav');
  if (!entry) throw new Error('Missing src/content/site/arrow-nav.yaml');
  const node = entry.data.nodes.find((item) => item.id === 'shop');
  if (!node) throw new Error('Missing the shop screen in src/content/site/arrow-nav.yaml');
  return {
    landing: entry.data.landing,
    nodes: [
      {
        id: node.id,
        parent: node.parent,
        dir: node.dir,
        label: node.label,
        title: node.title,
        body: node.body,
        kind: node.kind,
        full: node.full === true,
        paragraphs: [],
        slides: await shopSlides(),
      },
    ],
  };
}
