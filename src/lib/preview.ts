import { createGitHubReader } from '@keystatic/core/reader/github';
import config from '../../keystatic.config';
import { CMS_REPO } from './cms-auth';
import type { ProjectEntry } from './content';

const SAFE_REF = /^[A-Za-z0-9._\/-]{1,200}$/;

export function normalizePreviewRef(raw: string | null | undefined): string {
  const value = (raw || 'main').trim();
  if (!SAFE_REF.test(value) || value.includes('..')) return 'main';
  return value;
}

export async function listProcessFolderFromGitHub(
  slug: string,
  token: string,
  ref: string,
): Promise<string[]> {
  const api = `https://api.github.com/repos/${CMS_REPO}/contents/src/content/projects/${encodeURIComponent(slug)}/process?ref=${encodeURIComponent(ref)}`;
  const res = await fetch(api, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'user-agent': 'humansize',
    },
  });
  if (!res.ok) return [];
  const items = (await res.json()) as Array<{ type?: string; name?: string; path?: string }>;
  if (!Array.isArray(items)) return [];
  const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
  return items
    .filter((item) => item.type === 'file' && item.name && /\.(jpe?g|png|webp|avif)$/i.test(item.name))
    .map((item) => `/${item.path}`)
    .sort((a, b) => collator.compare(a, b));
}

export function toProjectEntry(slug: string, data: Record<string, unknown>): ProjectEntry {
  const info = Array.isArray(data.info) ? data.info : [];
  return {
    id: slug,
    data: {
      title: String(data.title ?? ''),
      year: typeof data.year === 'number' ? data.year : undefined,
      yearEnd: typeof data.yearEnd === 'number' ? data.yearEnd : undefined,
      published: data.published !== false,
      summary: String(data.summary ?? ''),
      cover: typeof data.cover === 'string' ? data.cover : undefined,
      coverVideo: typeof data.coverVideo === 'string' ? data.coverVideo : undefined,
      coverAlt: typeof data.coverAlt === 'string' ? data.coverAlt : undefined,
      coverFrame: (data.coverFrame === 'wide' ? 'wide' : 'default') as 'default' | 'wide',
      coverFlush: Boolean(data.coverFlush),
      rounded: data.rounded !== false,
      info: info.map((item: { label?: string; value?: string; href?: string }) => ({
        label: String(item.label ?? ''),
        value: String(item.value ?? ''),
        href: item.href ? String(item.href) : undefined,
      })),
      processFromFolder: Boolean(data.processFromFolder),
      blocks: (Array.isArray(data.blocks) ? data.blocks : []) as ProjectEntry['data']['blocks'],
      todo: [],
    },
  } as ProjectEntry;
}

export async function loadPreviewProject(
  slug: string,
  token: string,
  ref: string,
): Promise<ProjectEntry | null> {
  const reader = createGitHubReader(config, {
    repo: CMS_REPO as `${string}/${string}`,
    ref,
    token,
  });
  const entry = await reader.collections.projects.read(slug);
  if (!entry) return null;
  return toProjectEntry(slug, entry as unknown as Record<string, unknown>);
}
