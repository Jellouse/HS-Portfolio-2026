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
