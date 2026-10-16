// Hands out a one-time presigned PUT URL for uploading a video straight to Cloudflare R2.
// Only for people with push access to the repo: the caller sends the GitHub token that
// Keystatic already holds in their browser, and we check it against GitHub.
import type { APIRoute } from 'astro';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const prerender = false;

const REPO = 'Jellouse/HS-Portfolio-2026';
const TYPES: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export const POST: APIRoute = async ({ request }) => {
  const env = import.meta.env;
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL } = env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET || !R2_PUBLIC_URL) {
    return json({ error: 'Video storage is not set up yet (R2 env vars missing).' }, 500);
  }

  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Not signed in to the CMS.' }, 401);
  const gh = await fetch(`https://api.github.com/repos/${REPO}`, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'user-agent': 'humansize' },
  });
  if (!gh.ok) return json({ error: 'GitHub session not valid. Sign in to the CMS again.' }, 401);
  const repo = await gh.json();
  if (!repo.permissions?.push) return json({ error: 'No write access to the site.' }, 403);

  const { name = '', type = '', folder = '' } = await request.json().catch(() => ({}));
  const ext = TYPES[type] ?? (String(name).toLowerCase().match(/\.(mp4|webm|mov)$/)?.[1] ?? '');
  if (!ext) return json({ error: 'Use an mp4, webm or mov file.' }, 400);
  const base =
    String(name)
      .replace(/\.[^.]+$/, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'video';
  const dir = String(folder).toLowerCase().replace(/[^a-z0-9-]+/g, '') || 'misc';
  const key = `projects/${dir}/${base}-${Date.now().toString(36)}.${ext}`;
  const contentType = type || (ext === 'mov' ? 'video/quicktime' : `video/${ext}`);

  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  });
  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, ContentType: contentType, CacheControl: 'public, max-age=31536000, immutable' }),
    { expiresIn: 3600 },
  );
  return json({ uploadUrl, contentType, publicUrl: `${String(R2_PUBLIC_URL).replace(/\/$/, '')}/${key}` });
};
