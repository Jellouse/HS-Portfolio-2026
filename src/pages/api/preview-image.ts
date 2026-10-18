// Streams a content image for the CMS preview route. Browser requests carry the
// Keystatic GitHub cookie; we re-fetch from GitHub with that token so private
// branches and files missing from this build still render.
import type { APIRoute } from 'astro';
import { cmsTokenFromRequest, hasRepoPushAccess, CMS_REPO } from '../../lib/cms-auth';
import { normalizePreviewRef } from '../../lib/preview';

export const prerender = false;

const SAFE_PATH =
  /^src\/content\/projects\/[A-Za-z0-9._/-]+\.(jpe?g|png|webp|avif)$/i;

const TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
};

export const GET: APIRoute = async ({ request, url }) => {
  const token = cmsTokenFromRequest(request);
  if (!token || !(await hasRepoPushAccess(token))) {
    return new Response('Not found', {
      status: 404,
      headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' },
    });
  }

  const rawPath = (url.searchParams.get('path') || '').replace(/^\//, '');
  if (!SAFE_PATH.test(rawPath) || rawPath.includes('..')) {
    return new Response('Bad path', { status: 400, headers: { 'Cache-Control': 'private, no-store' } });
  }

  const ref = normalizePreviewRef(url.searchParams.get('branch'));
  const refPath = ref.split('/').map(encodeURIComponent).join('/');
  const gh = `https://raw.githubusercontent.com/${CMS_REPO}/${refPath}/${rawPath
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;

  const upstream = await fetch(gh, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github.raw',
      'user-agent': 'humansize-preview-image',
    },
  });

  if (!upstream.ok) {
    return new Response('Not found', {
      status: 404,
      headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' },
    });
  }

  const ext = rawPath.split('.').pop()?.toLowerCase() || 'jpg';
  const type = TYPES[ext] || upstream.headers.get('content-type') || 'application/octet-stream';
  const body = await upstream.arrayBuffer();

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': type,
      'Cache-Control': 'private, max-age=300',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
};
