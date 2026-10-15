import { getCollection, getEntry, type CollectionEntry } from 'astro:content';

export type ProjectEntry = CollectionEntry<'projects'>;
export type SiteEntry = CollectionEntry<'site'>;
export type SiteData = SiteEntry['data'];

export async function getSite(): Promise<SiteData> {
  const entry = await getEntry('site', 'site');
  if (!entry) throw new Error('Missing src/content/site/site.yaml');
  return entry.data;
}

export async function getProjects(): Promise<ProjectEntry[]> {
  const all = await getCollection('projects');
  const published = all
    .filter((project) => project.data.published)
    .sort((a, b) => a.data.order - b.data.order);

  for (const project of published) {
    if (!project.data.cover || !project.data.coverAlt) {
      throw new Error(
        `${project.id} is published and needs cover and coverAlt.`,
      );
    }
  }

  return published;
}

function inlineLink(): RegExp {
  return /\[([^\]\n]+)\]\(([^)\s]+)\)/g;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function safeHref(value: string): string | null {
  if (/^https?:\/\//i.test(value)) return value;
  if (/^mailto:/i.test(value)) return value;
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  return null;
}

export function plainText(text: string): string {
  return text.replace(inlineLink(), '$1').replace(/\s+/g, ' ').trim();
}

export function renderInline(text: string): string {
  let html = '';
  let last = 0;
  for (const match of text.matchAll(inlineLink())) {
    const index = match.index ?? 0;
    html += escapeHtml(text.slice(last, index));
    const href = safeHref(match[2]);
    const label = escapeHtml(match[1]);
    html += href ? `<a href="${escapeHtml(href)}">${label}</a>` : escapeHtml(match[0]);
    last = index + match[0].length;
  }
  html += escapeHtml(text.slice(last));
  return html;
}

export function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

export function absoluteUrl(site: URL | undefined, path: string): string {
  const origin = site ?? new URL('https://humansize.studio');
  return new URL(path, origin).href;
}
