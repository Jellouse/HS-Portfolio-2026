import { projectLabel } from '../lib/content';
import type { APIRoute } from 'astro';
import { positioning } from '../lib/positioning';
import { absoluteUrl, getProjects, getSite, plainText } from '../lib/content';

export const prerender = true;

export const GET: APIRoute = async ({ site }) => {
  const settings = await getSite();
  const projects = await getProjects();
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
      const summary = plainText(project.data.summary);
      return [
        `- [${projectLabel(project.data)}](${absoluteUrl(site, `/work/${project.id}`)}): ${summary}`,
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
