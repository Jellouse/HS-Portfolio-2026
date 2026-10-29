// Site positioning: the single source for homepage title, meta/og/twitter description,
// JSON-LD (knowsAbout + services) and llms.txt. Project pages keep their own titles.
export const positioning = {
  homeTitle: 'Johann Schnettker · Humansize',
  description:
    "Humansize is the studio of Johann Schnettker, designing and building retail spaces, websites and 3D work for Analogue, Atomic and Tony's Chocolonely.",
  services: [
    'Retail store design and build',
    'Pop-up and display design',
    'Framer web design and development',
    '3D renders',
    'Artworks from existing 3D scans',
  ],
  // Service name -> its /services page (JSON-LD Service url).
  serviceUrls: {
    'Retail store design and build': '/services/physical-build/',
    'Pop-up and display design': '/services/physical-build/',
    'Artworks from existing 3D scans': '/services/physical-build/',
    'Framer web design and development': '/services/digital-build/',
    '3D renders': '/services/digital-build/',
  } as Record<string, string>,
} as const;
