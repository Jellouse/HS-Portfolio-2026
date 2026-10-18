// Hands out a one-time presigned PUT URL for uploading a video straight to Cloudflare R2.
// Only for people with push access to the repo: the caller sends the GitHub token that
// Keystatic already holds in their browser, and we check it against GitHub.
import type { APIRoute } from 'astro';
import { S3Client, PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { cmsTokenFromRequest, hasRepoPushAccess } from '../../lib/cms-auth';

export const prerender = false;

const TYPES: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};

// Stay inside Cloudflare R2's free tier (10 GB): cap single files and the whole bucket.
const MAX_FILE = 200 * 1024 * 1024;
const MAX_BUCKET = 8 * 1024 * 1024 * 1024;
const mb = (n: number) => `${Math.round(n / 1024 / 1024)} MB`;

// R2_PUBLIC_URL may be set without a scheme (e.g. "x.workers.dev"); always return an absolute URL
const publicBase = (v: string) => {
  const base = String(v).trim().replace(/\/+$/, '');
  return /^https?:\/\//i.test(base) ? base : `https://${base}`;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export const POST: APIRoute = async ({ request }) => {
  const env = import.meta.env;
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL } = env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET || !R2_PUBLIC_URL) {
    return json({ error: 'Video storage is not set up yet (R2 env vars missing).' }, 500);
  }

  const token = cmsTokenFromRequest(request);
  if (!token) return json({ error: 'Not signed in to the CMS.' }, 401);
  if (!(await hasRepoPushAccess(token))) {
    // Mirror the old split: invalid token vs no push. Re-check with a cheap user call only when needed.
    const probe = await fetch('https://api.github.com/user', {
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'user-agent': 'humansize',
      },
    });
    if (!probe.ok) return json({ error: 'GitHub session not valid. Sign in to the CMS again.' }, 401);
    return json({ error: 'No write access to the site.' }, 403);
  }

  const { name = '', type = '', folder = '', size = 0 } = await request.json().catch(() => ({}));
  const bytes = Number(size);
  if (!Number.isFinite(bytes) || bytes <= 0) return json({ error: 'Could not read the file size.' }, 400);
  if (bytes > MAX_FILE) {
    return json({ error: `This video is ${mb(bytes)}. The limit is 200 MB, so please export it smaller.` }, 413);
  }
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

  // bucket jurisdiction: 'eu' unless R2_JURISDICTION says otherwise ('default' = no jurisdiction)
  const jurisdiction = String(env.R2_JURISDICTION ?? 'eu').trim().toLowerCase() || 'eu';
  const jurisdictionHost = jurisdiction === 'default' ? '' : `.${jurisdiction}`;
  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}${jurisdictionHost}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  });
  // total bucket size, so we never leave the free tier
  let used = 0;
  let ContinuationToken: string | undefined;
  do {
    const page = await s3.send(new ListObjectsV2Command({ Bucket: R2_BUCKET, ContinuationToken }));
    for (const o of page.Contents ?? []) used += o.Size ?? 0;
    ContinuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (ContinuationToken);
  if (used + bytes > MAX_BUCKET) {
    return json(
      { error: `Video storage is nearly full (${mb(used)} of 8 GB used). Remove old videos in Cloudflare R2 first.` },
      507,
    );
  }

  // ContentLength is signed, so a different (bigger) file can't be uploaded with this URL
  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, ContentType: contentType, ContentLength: bytes, CacheControl: 'public, max-age=31536000, immutable' }),
    { expiresIn: 3600 },
  );
  return json({ uploadUrl, contentType, publicUrl: `${publicBase(R2_PUBLIC_URL)}/${key}` });
};
