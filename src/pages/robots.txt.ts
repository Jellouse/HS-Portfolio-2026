import type { APIRoute } from 'astro';

export const prerender = true;

export const GET: APIRoute = ({ site }) => {
  const origin = site?.href ?? 'https://humansize.studio/';
  const body = `User-agent: *\nAllow: /\n\nSitemap: ${new URL('sitemap-index.xml', origin).href}\n`;
  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
