

import { createHash } from 'node:crypto';

export const CANVAS_REPO = 'Jellouse/HS-Portfolio-2026';
export const TOKEN_COOKIE = 'keystatic-gh-access-token';
export const RETURN_COOKIE = 'canvas-return';
const TTL_MS = 5 * 60 * 1000;
const cache = new Map();

export async function checkCanvasAccess(token, fetchImpl = fetch) {
  if (!token) return { status: 'unauthenticated' };
  const key = createHash('sha256').update(token).digest('hex');
  const hit = cache.get(key);
  if (hit && hit.until > Date.now()) return hit.result;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'humansize-canvas',
  };
  let result;
  try {
    const user = await fetchImpl('https://api.github.com/user', { headers });
    if (!user.ok) {
      result = { status: 'unauthenticated' };
    } else {
      const { login } = await user.json();
      const repo = await fetchImpl(`https://api.github.com/repos/${CANVAS_REPO}`, { headers });
      const data = repo.ok ? await repo.json() : null;
      result = data?.permissions?.push ? { status: 'ok', login } : { status: 'forbidden', login };
    }
  } catch {
    return { status: 'unauthenticated' };
  }
  cache.set(key, { result, until: Date.now() + TTL_MS });
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  return result;
}

export function _clearCanvasAuthCache() {
  cache.clear();
}
