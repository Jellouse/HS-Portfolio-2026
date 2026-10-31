

import { getProjects, projectLabel } from './content';
import { getProducts } from './shop';

const EXCLUDE = new Set(['/canvas', '/admin', '/keystatic-upload']);

const sources = import.meta.glob<string>('../pages/**/*.astro', { query: '?raw', import: 'default', eager: true });

const DYNAMIC: Record<string, () => Promise<string[]>> = {
  '/work/[slug]': async () => (await getProjects()).map((p) => `/work/${p.id}/`),
  '/shop/[slug]': async () => (await getProducts()).map((p) => `/shop/${p.id}/`),
};

const routeOf = (file: string) =>
  file
    .replace(/^\.\.\/pages/, '')
    .replace(/\.astro$/, '')
    .replace(/\/index$/, '/')
    .replace(/^$/, '/');

export async function canvasPages() {
  const [projects, products] = await Promise.all([getProjects(), getProducts()]);
  const labels = new Map<string, string>([['/', 'Home'], ['/shop/', 'Shop'], ['/404', '404']]);
  for (const p of projects) labels.set(`/work/${p.id}/`, projectLabel(p.data));
  for (const p of products) labels.set(`/shop/${p.id}/`, p.data.overview.title || p.data.name);

  const paths: string[] = [];
  for (const [file, src] of Object.entries(sources)) {
    const route = routeOf(file);
    if (EXCLUDE.has(route.replace(/\/$/, '')) || route.startsWith('/preview/') || route === '/dev' || route.startsWith('/dev/')) continue;
    if (/export const prerender = false/.test(src)) continue;
    if (!route.includes('[')) {
      paths.push(route === '/' || route === '/404' ? route : `${route}/`.replace(/\/\/$/, '/'));
      continue;
    }
    const expand = DYNAMIC[route];
    if (!expand) throw new Error(`canvas: add ${route} to DYNAMIC in canvas-pages.ts`);
    paths.push(...(await expand()));
  }

  const rank = (p: string) => (p === '/' ? 0 : p.startsWith('/work/') ? 1 : p === '/shop/' ? 2 : p.startsWith('/shop/') ? 3 : p === '/404' ? 9 : 5);
  const order = [...labels.keys()];
  paths.sort((a, b) => rank(a) - rank(b) || (order.indexOf(a) + 1 || 1e9) - (order.indexOf(b) + 1 || 1e9) || a.localeCompare(b));
  return paths.map((path) => ({ name: labels.get(path) ?? path, path }));
}
