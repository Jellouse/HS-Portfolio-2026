import sharp from 'sharp';
import type { ImageMetadata } from 'astro';

const cache = new Map<string, Promise<boolean>>();

function fileOf(src: ImageMetadata) {
  return (src as ImageMetadata & { fsPath?: string }).fsPath;
}

export function imageHasAlpha(src: ImageMetadata): Promise<boolean> {
  const file = fileOf(src);
  if (!file) return Promise.resolve(false);
  const hit = cache.get(file);
  if (hit) return hit;
  const pending = (async () => {
    let hasAlpha = false;
    try {
      hasAlpha = (await sharp(file).metadata()).hasAlpha === true;
    } catch {
      return false;
    }
    if (!hasAlpha) return false;
    try {
      const { data } = await sharp(file).extractChannel('alpha').raw().toBuffer({ resolveWithObject: true });
      for (let i = 0; i < data.length; i++) {
        if (data[i] !== 255) return true;
      }
      return false;
    } catch {
      return true;
    }
  })();
  cache.set(file, pending);
  return pending;
}
