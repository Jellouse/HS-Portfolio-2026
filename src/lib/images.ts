import type { ImageMetadata } from 'astro';
import { githubRawUrl } from './github-content';

const images = import.meta.glob<ImageMetadata>(
  '/src/content/projects/**/*.{jpg,jpeg,png,webp,avif}',
  { eager: true, import: 'default' },
);

/** When set (preview SSR), missing build images fall back to GitHub raw URLs. */
let previewRef: string | null = null;

export function setPreviewImageRef(ref: string | null) {
  previewRef = ref;
}

export function tryResolveImage(src: string): ImageMetadata | undefined {
  const key = src.startsWith('/src/')
    ? src
    : `/src/content/projects/${src.replace(/^\.\//, '')}`;
  return images[key];
}

export function resolveImage(src: string): ImageMetadata {
  const image = tryResolveImage(src);
  if (!image) {
    throw new Error(
      `Missing image ${src}. Files on disk: ${Object.keys(images).join(', ')}`,
    );
  }
  return image;
}

/** Local ImageMetadata when present; otherwise a raw GitHub URL in preview mode. */
export function resolveImageSource(src: string): ImageMetadata | string {
  const local = tryResolveImage(src);
  if (local) return local;
  if (previewRef) return githubRawUrl(src, previewRef);
  throw new Error(
    `Missing image ${src}. Files on disk: ${Object.keys(images).join(', ')}`,
  );
}

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

/** All images in src/content/projects/<slug>/process/, natural-sorted by file name. */
export function processFolderImages(slug: string): string[] {
  const prefix = `/src/content/projects/${slug}/process/`;
  return Object.keys(images)
    .filter((key) => key.startsWith(prefix))
    .sort((a, b) => collator.compare(a.slice(prefix.length), b.slice(prefix.length)));
}
