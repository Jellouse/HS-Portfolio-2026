import type { ImageMetadata } from 'astro';
import { contentPathFromSrc } from './github-content';

const images = import.meta.glob<ImageMetadata>(
  '/src/content/{projects,products}/**/*.{jpg,jpeg,png,webp,avif}',
  { eager: true, import: 'default' },
);

// Alt text for process-folder images: process/alts.json maps file name to alt.
const folderAlts = import.meta.glob<Record<string, string>>('/src/content/projects/*/process/alts.json', {
  eager: true,
  import: 'default',
});

export function processFolderAlt(src: string): string {
  const m = src.match(/^\/src\/content\/projects\/([^/]+)\/process\/([^/]+)$/);
  if (!m) return '';
  return folderAlts[`/src/content/projects/${m[1]}/process/alts.json`]?.[m[2]] ?? '';
}

/** When set (preview SSR), missing build images use the auth image proxy. */
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

/** Authenticated CMS preview proxy (browser sends Keystatic cookie / Bearer). */
export function previewImageProxyUrl(src: string, ref: string): string {
  const path = contentPathFromSrc(src);
  const params = new URLSearchParams({ path, branch: ref });
  return `/api/preview-image?${params}`;
}

/**
 * Local ImageMetadata on the static site.
 * In CMS preview SSR, Astro's /_image endpoint 404s on this deploy, so return the
 * already-built /_astro URL (or an auth proxy for files not in this build).
 */
export function resolveImageSource(src: string): ImageMetadata | string {
  const local = tryResolveImage(src);
  if (local) {
    if (previewRef) return local.src;
    return local;
  }
  if (previewRef) return previewImageProxyUrl(src, previewRef);
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
