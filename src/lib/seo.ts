import { plainText, type ProjectEntry, type SiteData } from './content';

export function homeJsonLd(site: SiteData, pageUrl: string) {
  const personId = `${pageUrl}#johann-schnettker`;
  const studioId = `${pageUrl}#humansize`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Person',
        '@id': personId,
        name: site.name,
        email: `mailto:${site.email}`,
        jobTitle: 'Designer',
        url: pageUrl,
        worksFor: { '@id': studioId },
      },
      {
        '@type': 'ProfessionalService',
        '@id': studioId,
        name: site.studio,
        url: pageUrl,
        email: site.email,
        description: plainText(site.intro),
        founder: { '@id': personId },
      },
    ],
  };
}

export function projectJsonLd(
  project: ProjectEntry,
  pageUrl: string,
  imageUrl?: string,
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CreativeWork',
    name: project.data.title,
    headline: project.data.caption,
    description: plainText(project.data.summary),
    url: pageUrl,
    ...(project.data.year ? { dateCreated: String(project.data.year) } : {}),
    ...(imageUrl ? { image: imageUrl } : {}),
    creator: {
      '@type': 'Person',
      name: 'Johann Schnettker',
      email: 'mailto:schnettker.johann@gmail.com',
    },
  };
}
