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
