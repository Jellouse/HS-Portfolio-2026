// schema.org Product for /shop/<slug>. Price, shipping and stock come from the store code
// (the same values Stripe charges); availability is read from the DB when it is connected.
import { SHIPPING_CENTS, SHIPPING_COUNTRIES, stock } from './store.mjs';

async function availability(slug: string): Promise<'InStock' | 'SoldOut'> {
  if (!process.env.DATABASE_URL) return 'InStock';
  try {
    const { getPool } = await import('./server.mjs');
    const s = (await stock(getPool()))[slug];
    return s?.soldOut ? 'SoldOut' : 'InStock';
  } catch {
    return 'InStock';
  }
}

export async function productJsonLd(p: { slug: string; name: string; description: string; url: string; images: string[]; eur: number | null }) {
  const offers =
    p.eur == null
      ? undefined
      : {
          '@type': 'Offer',
          url: p.url,
          price: p.eur.toFixed(2),
          priceCurrency: 'EUR',
          availability: `https://schema.org/${await availability(p.slug)}`,
          shippingDetails: {
            '@type': 'OfferShippingDetails',
            shippingRate: { '@type': 'MonetaryAmount', value: (SHIPPING_CENTS / 100).toFixed(2), currency: 'EUR' },
            shippingDestination: SHIPPING_COUNTRIES.map((c) => ({ '@type': 'DefinedRegion', addressCountry: c })),
          },
        };
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.name,
    image: p.images,
    description: p.description,
    brand: { '@type': 'Brand', name: 'Industrial Bloom' },
    material: 'Aluminium',
    url: p.url,
    ...(offers ? { offers } : {}),
  };
}
