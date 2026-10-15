import type { APIRoute } from 'astro';
import { absoluteUrl, getProjects, getSite } from '../lib/content';

export const GET: APIRoute = async ({ site }) => {
  const settings = await getSite();
  const projects = await getProjects();
  const home = absoluteUrl(site, '/');
  const lines = [
    `# ${settings.studio}`,
    '',
    settings.intro,
    '',
    `Email: ${settings.email}`,
    '',
    '## About',
    '',
    ...settings.about.flatMap((paragraph) => [paragraph, '']),
    '## Projects',
    '',
    ...projects.flatMap((project) => {
      const summary = project.data.summary.replace(/\s+/g, ' ').trim();
      return [
        `- [${project.data.caption}](${absoluteUrl(site, `/work/${project.id}`)}): ${summary}`,
      ];
    }),
    '',
    `Site: ${home}`,
    '',
  ];
  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
