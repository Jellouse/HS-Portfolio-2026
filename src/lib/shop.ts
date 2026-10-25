import { getCollection, type CollectionEntry } from 'astro:content';

export type ProductEntry = CollectionEntry<'products'>;

export async function getProducts(): Promise<ProductEntry[]> {
  const all = await getCollection('products');
  return all.sort((a, b) => a.data.order - b.data.order || a.data.name.localeCompare(b.data.name));
}

import { SEED } from './shop/store.mjs';

// The price lives in the shop DB (edit in /admin). Pages render this seed value and
// replace it with the live one from /api/shop/stock (see scripts/shop-price.ts).
export const seedEur = (slug: string) => {
  const p = SEED.find((s) => s.slug === slug);
  return p ? p.price_cents / 100 : null;
};
export const priceText = (eur: number | null, style: 'suffix' | 'prefix') =>
  eur == null ? '' : style === 'prefix' ? `€${eur}` : `${eur}€`;
export { SHIPPING_TEXT as SHIPPING } from './shop/store.mjs';
