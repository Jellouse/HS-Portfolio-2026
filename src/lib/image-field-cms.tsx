

import React, { type ReactNode } from 'react';
import { withImageOptimize } from './image-field-optimize';
import { CMS_TOKEN_COOKIE } from './cms-auth';
import { typePx } from './type-scale';

type Asset = {
  data: Uint8Array;
  filename: string;
  extension: string;
};

function mimeFor(extension: string) {
  const ext = extension.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'avif') return 'image/avif';
  if (ext === 'gif') return 'image/gif';
  return 'image/jpeg';
}

function cmsToken(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${CMS_TOKEN_COOKIE}=([^;]+)`),
  );
  if (!match) return undefined;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function branchFromLocation(): string {
  if (typeof location === 'undefined') return 'main';
  const m = location.pathname.match(/\/keystatic\/branch\/([^/]+)/);
  return m ? decodeURIComponent(m[1]) : 'main';
}

function downloadFromAsset(value: Asset) {
  const blob = new Blob([value.data.buffer.slice(
    value.data.byteOffset,
    value.data.byteOffset + value.data.byteLength,
  ) as ArrayBuffer], { type: mimeFor(value.extension) });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = value.filename || `image.${value.extension}`;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function downloadCmsImage(opts: {
  asset?: Asset | null;

  storedPath?: string | null;
}) {
  const { asset, storedPath } = opts;
  if (storedPath && /^\/?src\/content\//.test(storedPath)) {
    const path = storedPath.replace(/^\//, '');
    const params = new URLSearchParams({
      path,
      branch: branchFromLocation(),
      download: '1',
    });
    const headers: HeadersInit = {};
    const token = cmsToken();
    if (token) headers.authorization = `Bearer ${token}`;
    const res = await fetch(`/api/preview-image?${params}`, {
      credentials: 'same-origin',
      headers,
    });
    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = path.split('/').pop() || asset?.filename || 'image.jpg';
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      return;
    }
  }
  if (asset?.data) {
    downloadFromAsset(asset);
  }
}

const linkStyle: React.CSSProperties = {
  display: 'inline-block',
  marginTop: 8,
  padding: 0,
  border: 0,
  background: 'none',
  color: 'var(--ks-colors-accent, #2563eb)',
  font: 'inherit',
  fontSize: typePx('text-meta'),
  textDecoration: 'underline',
  cursor: 'pointer',
};

export function withImageCms(Input: (props: any) => ReactNode) {
  const Optimized = withImageOptimize(Input);
  return function ImageCmsInput(props: any) {
    const value = props.value as Asset | null;
    return (
      <div>
        <Optimized {...props} />
        {value?.data ? (
          <button
            type="button"
            style={linkStyle}
            onClick={() => {
              void downloadCmsImage({ asset: value });
            }}
          >
            Download
          </button>
        ) : null}
      </div>
    );
  };
}
