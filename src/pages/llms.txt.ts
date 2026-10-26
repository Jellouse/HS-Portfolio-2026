import { projectLabel } from '../lib/content';
import type { APIRoute } from 'astro';
import { positioning } from '../lib/positioning';
import { absoluteUrl, getProjects, getSite, plainText } from '../lib/content';
import { getProducts, priceText, seedEur } from '../lib/shop';

export const prerender = true;

export const GET: APIRoute = async ({ site }) => {
  const settings = await getSite();
  const projects = await getProjects();
  const products = (await getProducts()).filter((p) => p.data.overview.show !== false);
  const home = absoluteUrl(site, '/');
  const lines = [
    `# ${positioning.homeTitle}`,
    '',
    `> ${positioning.description}`,
    '',
    '## Services',
    '',
    ...positioning.services.map((s) => `- ${s}`),
    '',
    `Email: ${settings.email}`,
    '',
    '## About',
    '',
    ...settings.about.flatMap((paragraph) => [paragraph, '']),
    '## Projects',
    '',
    ...projects.flatMap((project) => {
      const summary = project.data.seoDescription?.trim() || plainText(project.data.summary);
      return [
        `- [${projectLabel(project.data)}](${absoluteUrl(site, `/work/${project.id}/`)}): ${summary}`,
      ];
    }),
    '',
    '## Industrial Bloom shop',
    '',
    `Aluminium vases, handmade in Germany in small numbered editions: ${absoluteUrl(site, '/shop/')}`,
    '',
    ...products.map((p) => {
      const name = p.data.overview.title || p.data.name;
      const price = priceText(seedEur(p.id), 'prefix');
      return `- [${name}](${absoluteUrl(site, `/shop/${p.id}/`)}): ${plainText(p.data.description)}${price ? ` Price: ${price}.` : ''}`;
    }),
    '',
    `Site: ${home}`,
    '',
  ];
  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
