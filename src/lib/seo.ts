import { projectLabel } from './content';
import { positioning } from './positioning';
import { plainText, type ProjectEntry, type SiteData } from './content';

// Stable entity id: every project's creator points here.
export const PERSON_ID = 'https://humansize.de/#johann-schnettker';

export function homeJsonLd(site: SiteData, pageUrl: string) {
  const personId = PERSON_ID;
  const sameAs = site.socials.map((s) => s.href).filter(Boolean);
  const logo = new URL('/apple-touch-icon.png', pageUrl).href;
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
        image: logo,
        sameAs,
        knowsAbout: [...positioning.services],
        worksFor: { '@id': studioId },
      },
      {
        '@type': 'ProfessionalService',
        '@id': studioId,
        name: site.studio,
        url: pageUrl,
        email: site.email,
        image: logo,
        logo,
        sameAs,
        description: positioning.description,
        knowsAbout: [...positioning.services],
        hasOfferCatalog: {
          '@type': 'OfferCatalog',
          name: 'Services',
          itemListElement: positioning.services.map((name) => ({
            '@type': 'Offer',
            itemOffered: { '@type': 'Service', name, url: new URL(positioning.serviceUrls[name], pageUrl).href },
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
    creator: { '@id': PERSON_ID },
  };
}
