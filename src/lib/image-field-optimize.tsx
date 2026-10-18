// Shrink images in the Keystatic admin before they enter form state / GitHub commits.
// Max 3200px long edge; JPEG q0.82; keep PNG only when pixels have alpha.
import { type ReactNode } from 'react';

const MAX = 3200;
const JPEG_Q = 0.82;

type Asset = {
  data: Uint8Array;
  filename: string;
  extension: string;
};

function canvasToBytes(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      async (blob) => {
        if (!blob) {
          reject(new Error('Image encode failed'));
          return;
        }
        resolve(new Uint8Array(await blob.arrayBuffer()));
      },
      type,
      quality,
    );
  });
}

function hasAlpha(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const { data } = ctx.getImageData(0, 0, w, h);
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 255) return true;
  }
  return false;
}

export async function optimizeImageAsset(value: Asset): Promise<Asset> {
  if (typeof document === 'undefined') return value;
  try {
    const blob = new Blob([value.data.buffer.slice(value.data.byteOffset, value.data.byteOffset + value.data.byteLength) as ArrayBuffer]);
    const bitmap = await createImageBitmap(blob);
    let w = bitmap.width;
    let h = bitmap.height;
    const long = Math.max(w, h);
    if (long > MAX) {
      const scale = MAX / long;
      w = Math.max(1, Math.round(w * scale));
      h = Math.max(1, Math.round(h * scale));
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return value;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    const keepPng = value.extension.toLowerCase() === 'png' && hasAlpha(ctx, w, h);
    if (keepPng) {
      const data = await canvasToBytes(canvas, 'image/png');
      if (data.byteLength >= value.data.byteLength && long <= MAX) return value;
      return {
        data,
        extension: 'png',
        filename: value.filename.replace(/\.[^.]+$/i, '.png'),
      };
    }

    const data = await canvasToBytes(canvas, 'image/jpeg', JPEG_Q);
    // Prefer the smaller result; never grow a JPEG that was already fine.
    if (
      data.byteLength >= value.data.byteLength &&
      long <= MAX &&
      /jpe?g$/i.test(value.extension)
    ) {
      return value;
    }
    return {
      data,
      extension: 'jpg',
      filename: value.filename.replace(/\.[^.]+$/i, '.jpg'),
    };
  } catch {
    return value;
  }
}

export function withImageOptimize(Input: (props: any) => ReactNode) {
  return function OptimizedImageInput(props: any) {
    const onChange = (next: Asset | null) => {
      if (!next?.data) {
        props.onChange(next);
        return;
      }
      void optimizeImageAsset(next).then((optimized) => props.onChange(optimized));
    };
    return <Input {...props} onChange={onChange} />;
  };
}
