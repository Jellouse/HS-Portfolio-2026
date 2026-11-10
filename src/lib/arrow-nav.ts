import { getEntry, type CollectionEntry } from 'astro:content';
import { getProjects, getSite, renderInline } from './content';
import { galleryCategoryValues } from './gallery-categories';
import { imageHasAlpha } from './image-alpha';
import { resolveImage } from './images';
import { getProducts } from './shop';

export type ArrowDir = 'left' | 'right' | 'up' | 'down';

export type ArrowSlide = {
  src: string;
  poster: string;
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

export type ArrowNode = {
  id: string;
  parent: string;
  dir: ArrowDir;
  label: string;
  title: string;
  body: string;
  kind: 'branch' | 'gallery' | 'placeholder';
  slides: ArrowSlide[];
  paragraphs: string[];
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
  if (data.cover) add(data.coverGallery, { src: data.cover, alt: data.coverAlt || data.title });
  if (data.coverVideo) {
    add(data.coverVideoGallery, {
      src: data.coverVideo,
      alt: data.coverAlt || data.title,
      video: data.coverVideo,
      poster: data.cover || '',
    });
  }
  for (const block of data.blocks) {
    const value = block.value;
    if (block.discriminant === 'image') add(value.gallery, { src: value.src, alt: value.alt });
    else if (block.discriminant === 'video' && value.src) {
      add(value.gallery, { src: value.src, alt: value.alt || '', video: value.src, poster: value.poster || '' });
    } else if (block.discriminant === 'pair') {
      add(value.leftGallery, { src: value.left, alt: value.leftAlt });
      add(value.rightGallery, { src: value.right, alt: value.rightAlt });
    } else if (block.discriminant === 'process') {
      for (const image of value.images) add(image.gallery, { src: image.src, alt: image.alt });
    }
  }
  return pieces;
}

async function imageSlide(piece: Piece, title: string, caption: string, slug: string, href: string, action: string): Promise<ArrowSlide> {
  if (piece.video) {
    const poster = piece.poster ? resolveImage(piece.poster) : null;
    return {
      src: piece.video,
      poster: poster?.src || '',
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
  return {
    src: file.src,
    poster: '',
    alt: piece.alt,
    title,
    caption,
    product: '',
    alpha: await imageHasAlpha(file),
    kind: 'image',
    width: file.width,
    height: file.height,
    slug,
    href,
    action,
  };
}

async function shopSlides(): Promise<ArrowSlide[]> {
  const products = (await getProducts()).filter((product) => product.data.overview.show !== false);
  const slides: ArrowSlide[] = [];
  for (const product of products) {
    const seen = new Set<string>();
    const images = [product.data.overview.left, product.data.overview.right, ...product.data.detail.images];
    for (const image of images) {
      if (!image?.src || seen.has(image.src)) continue;
      seen.add(image.src);
      const file = resolveImage(image.src);
      slides.push({
        src: file.src,
        poster: '',
        alt: image.alt || product.data.name,
        title: product.data.name,
        caption: '',
        product: '',
        alpha: await imageHasAlpha(file),
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
          paragraphs: node.id === 'about' ? site.about.map((paragraph) => renderInline(paragraph)) : [],
          slides,
        };
      }),
    ),
  };
}
