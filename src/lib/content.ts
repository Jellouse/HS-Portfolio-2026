import { getCollection, getEntry, type CollectionEntry } from 'astro:content';

export type ProjectEntry = CollectionEntry<'projects'>;
export type SiteEntry = CollectionEntry<'site'>;
export type SiteData = SiteEntry['data'];

export async function getSite(): Promise<SiteData> {
  const entry = await getEntry('site', 'site');
  if (!entry) throw new Error('Missing src/content/site/site.yaml');
  return entry.data;
}

async function getProjectOrderSlugs(): Promise<string[]> {
  const entry = await getEntry('projectOrder', 'project-order');
  return entry?.data.projects ?? [];
}

/** Homepage / feed order from the Project order singleton. Missing slugs go last by year, then title. */
export function sortProjectsByOrder<T extends { id: string; data: { title: string; year?: number | null } }>(
  projects: T[],
  order: string[],
): T[] {
  const index = new Map(order.map((slug, i) => [slug, i]));
  return [...projects].sort((a, b) => {
    const ai = index.has(a.id) ? index.get(a.id)! : Number.POSITIVE_INFINITY;
    const bi = index.has(b.id) ? index.get(b.id)! : Number.POSITIVE_INFINITY;
    if (ai !== bi) return ai - bi;
    const ay = a.data.year ?? Number.NEGATIVE_INFINITY;
    const by = b.data.year ?? Number.NEGATIVE_INFINITY;
    if (ay !== by) return by - ay;
    return a.data.title.localeCompare(b.data.title);
  });
}

export async function getProjects(): Promise<ProjectEntry[]> {
  const all = await getCollection('projects');
  const published = all.filter((project) => project.data.published);
  const order = await getProjectOrderSlugs();
  const sorted = sortProjectsByOrder(published, order);

  for (const project of sorted) {
    if (!project.data.coverVideo && (!project.data.cover || !project.data.coverAlt)) {
      throw new Error(
        `${project.id} is published and needs cover and coverAlt, or a cover video.`,
      );
    }
  }

  return sorted;
}

/** All projects (including drafts), same order as the CMS list. */
export async function getAllProjectsOrdered(): Promise<ProjectEntry[]> {
  const all = await getCollection('projects');
  const order = await getProjectOrderSlugs();
  return sortProjectsByOrder(all, order);
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

export function projectTitleParts(data: {
  title: string;
  year?: number | null;
  yearEnd?: number | null;
}): { title: string; years?: string } {
  const years = yearRange(data.year, data.yearEnd);
  return years ? { title: data.title, years } : { title: data.title };
}

export function projectLabel(data: { title: string; year?: number | null; yearEnd?: number | null }): string {
  const { title, years } = projectTitleParts(data);
  return years ? `${title}, ${years}` : title;
}

export function yearRange(start?: number | null, end?: number | null): string | undefined {
  if (start == null) return end == null ? undefined : String(end);
  if (end == null || end === start) return String(start);
  return `${start} \u2013 ${end}`;
}
