// Every public page for /canvas, derived from the real routes in src/pages (and their
// getStaticPaths), so a new page or product shows up on the board without a hand list.
import { getProjects, projectLabel } from './content';
import { getProducts } from './shop';

// Not public pages: tools, logged-in or server-only routes.
const EXCLUDE = new Set(['/canvas', '/admin', '/keystatic-upload']);

const modules = import.meta.glob<{ prerender?: boolean; getStaticPaths?: () => Promise<{ params: Record<string, string> }[]> }>(
  '../pages/**/*.astro',
);

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
  for (const [file, load] of Object.entries(modules)) {
    const route = routeOf(file);
    if (EXCLUDE.has(route.replace(/\/$/, '')) || route.startsWith('/preview/')) continue;
    const mod = await load();
    if (mod.prerender === false) continue; // server-rendered: canvas, admin, previews
    if (!route.includes('[')) {
      paths.push(route === '/' || route === '/404' ? route : `${route}/`.replace(/\/\/$/, '/'));
      continue;
    }
    if (!mod.getStaticPaths) throw new Error(`canvas: ${file} has no getStaticPaths`);
    for (const { params } of await mod.getStaticPaths()) {
      paths.push(`${route.replace(/\[(?:\.\.\.)?(\w+)\]/g, (_, k) => params[k])}/`);
    }
  }
  // Home, projects (in homepage order), shop, products, everything else, 404 last.
  const rank = (p: string) => (p === '/' ? 0 : p.startsWith('/work/') ? 1 : p === '/shop/' ? 2 : p.startsWith('/shop/') ? 3 : p === '/404' ? 9 : 5);
  const order = [...labels.keys()];
  paths.sort((a, b) => rank(a) - rank(b) || (order.indexOf(a) + 1 || 1e9) - (order.indexOf(b) + 1 || 1e9) || a.localeCompare(b));
  return paths.map((path) => ({ name: labels.get(path) ?? path, path }));
}
