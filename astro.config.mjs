import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

const site =
  process.env.SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : 'https://humansize.studio');

// Keystatic injects server routes. The public site stays static, so the CMS
// is only wired up for `astro dev`, where it writes content back into git.
const isDev = process.argv.includes('dev');

const integrations = [
  sitemap({
    filter: (page) => {
      const path = new URL(page).pathname.replace(/\/$/, '') || '/';
      return path !== '/work' && path !== '/projects' && path !== '/all';
    },
  }),
];

if (isDev) {
  const [{ default: react }, { default: keystatic }] = await Promise.all([
    import('@astrojs/react'),
    import('@keystatic/astro'),
  ]);
  integrations.push(react(), keystatic());
}

export default defineConfig({
  site,
  output: 'static',
  redirects: {
    '/work': '/',
    '/projects': '/',
    '/all': '/',
  },
  integrations,
});
