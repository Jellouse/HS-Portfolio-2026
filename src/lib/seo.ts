import { projectLabel } from './content';
import { positioning } from './positioning';
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
        knowsAbout: [...positioning.services],
        worksFor: { '@id': studioId },
      },
      {
        '@type': 'ProfessionalService',
        '@id': studioId,
        name: site.studio,
        url: pageUrl,
        email: site.email,
        description: positioning.description,
        knowsAbout: [...positioning.services],
        hasOfferCatalog: {
          '@type': 'OfferCatalog',
          name: 'Services',
          itemListElement: positioning.services.map((name) => ({
            '@type': 'Offer',
            itemOffered: { '@type': 'Service', name },
          })),
        },
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
    headline: projectLabel(project.data),
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
