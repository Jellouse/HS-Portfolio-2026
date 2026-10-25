import { getCollection, type CollectionEntry } from 'astro:content';

export type ProductEntry = CollectionEntry<'products'>;

export async function getProducts(): Promise<ProductEntry[]> {
  const all = await getCollection('products');
  return all.sort((a, b) => a.data.order - b.data.order || a.data.name.localeCompare(b.data.name));
}

export const price = (eur: number) => `€${eur}`;
export const SHIPPING = '€12 flat, EU only, 3–7 business days';
