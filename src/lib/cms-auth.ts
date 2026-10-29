

const REPO = 'Jellouse/HS-Portfolio-2026';
const COOKIE = 'keystatic-gh-access-token';

export function cmsTokenFromRequest(request: Request): string | undefined {
  const header = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  if (header) return header;

  const raw = request.headers.get('cookie') || '';
  for (const part of raw.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === COOKIE) {
      try {
        return decodeURIComponent(rest.join('='));
      } catch {
        return rest.join('=');
      }
    }
  }
  return undefined;
}

export async function hasRepoPushAccess(token: string): Promise<boolean> {
  const gh = await fetch(`https://api.github.com/repos/${REPO}`, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'user-agent': 'humansize',
    },
  });
  if (!gh.ok) return false;
  const repo = (await gh.json()) as { permissions?: { push?: boolean } };
  return Boolean(repo.permissions?.push);
}

export { REPO as CMS_REPO, COOKIE as CMS_TOKEN_COOKIE };
