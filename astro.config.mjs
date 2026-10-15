import { defineConfig } from 'astro/config';

const site =
  process.env.SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : 'https://humansize.studio');

export default defineConfig({
  site,
  output: 'static',
});
