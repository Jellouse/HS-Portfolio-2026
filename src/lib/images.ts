import type { ImageMetadata } from 'astro';

const images = import.meta.glob<ImageMetadata>(
  '/src/content/projects/**/*.{jpg,jpeg,png,webp,avif}',
  { eager: true, import: 'default' },
);

export function resolveImage(src: string): ImageMetadata {
  const key = src.startsWith('/src/')
    ? src
    : `/src/content/projects/${src.replace(/^\.\//, '')}`;
  const image = images[key];
  if (!image) {
    throw new Error(
      `Missing image ${key}. Files on disk: ${Object.keys(images).join(', ')}`,
    );
  }
  return image;
}

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

/** All images in src/content/projects/<slug>/process/, natural-sorted by file name. */
export function processFolderImages(slug: string): string[] {
  const prefix = `/src/content/projects/${slug}/process/`;
  return Object.keys(images)
    .filter((key) => key.startsWith(prefix))
    .sort((a, b) => collator.compare(a.slice(prefix.length), b.slice(prefix.length)));
}
