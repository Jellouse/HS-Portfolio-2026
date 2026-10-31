import { defineConfig, envField } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import react from '@astrojs/react';
import keystatic from '@keystatic/astro';
import vercel from '@astrojs/vercel';
import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { hiddenProductSlugs } from './src/lib/shop/hidden.mjs';

const hiddenShop = new Set(hiddenProductSlugs().map((s) => `/shop/${s}`));

function lastModified(paths) {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cI', '--', ...paths], { encoding: 'utf8' }).trim();
    if (out) return new Date(out);
  } catch {}
  try {
    return new Date(Math.max(...paths.map((p) => statSync(p).mtimeMs)));
  } catch {}
  return new Date();
}

const site =
  process.env.SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : 'https://humansize.de');

const keystaticStorage = process.env.KEYSTATIC_STORAGE || '';

function dropVite8RefreshWrapper() {
  return {
    name: 'drop-vite8-refresh-wrapper',
    enforce: 'post',
    configResolved(config) {
      const drop = (plugins) =>
        plugins.flatMap((plugin) => {
          if (Array.isArray(plugin)) return [drop(plugin)];
          if (plugin && plugin.name === 'vite:react:refresh-wrapper') return [];
          return [plugin];
        });
      config.plugins.splice(0, config.plugins.length, ...drop(config.plugins));
    },
  };
}

function keystaticAdmin() {
  const integration = keystatic();
  const setup = integration.hooks['astro:config:setup'];
  return {
    name: 'keystatic',
    hooks: {
      'astro:config:setup'(options) {
        setup({
          ...options,
          injectRoute(route) {
            if (route.pattern === '/api/keystatic/[...params]') return;
            options.injectRoute(route);
          },
        });
      },
    },
  };
}

export default defineConfig({
  site,
  output: 'static',
  adapter: vercel(),

  security: {
    allowedDomains: [
      { hostname: 'humansize.de', protocol: 'https' },
      { hostname: 'www.humansize.de', protocol: 'https' },
      { hostname: '**.vercel.app', protocol: 'https' },
    ],
  },
  redirects: {
    '/work': '/',
    '/projects': '/',
    '/all': '/',
    '/services/product': '/services/physical-build/',
    '/services/product/': '/services/physical-build/',
    '/services/retail': '/services/physical-build/',
    '/services/retail/': '/services/physical-build/',
    '/services/web': '/services/digital-build/',
    '/services/web/': '/services/digital-build/',
    '/services/website': '/services/digital-build/',
    '/services/website/': '/services/digital-build/',
  },
  env: {
    schema: {
      KEYSTATIC_GITHUB_CLIENT_ID: envField.string({
        context: 'server',
        access: 'secret',
        optional: true,
      }),
      KEYSTATIC_GITHUB_CLIENT_SECRET: envField.string({
        context: 'server',
        access: 'secret',
        optional: true,
      }),
      KEYSTATIC_SECRET: envField.string({
        context: 'server',
        access: 'secret',
        optional: true,
      }),
      PUBLIC_KEYSTATIC_GITHUB_APP_SLUG: envField.string({
        context: 'client',
        access: 'public',
        optional: true,
      }),
    },
  },
  vite: {
    plugins: [dropVite8RefreshWrapper()],
    define: {
      'import.meta.env.KEYSTATIC_STORAGE': JSON.stringify(keystaticStorage),
    },

    optimizeDeps: {
      esbuildOptions: {
        plugins: [
          {
            name: 'stub-astro-env',
            setup(build) {
              build.onResolve({ filter: /^astro:env\/server$/ }, (args) => ({
                path: args.path,
                namespace: 'stub-astro-env',
              }));
              build.onLoad({ filter: /.*/, namespace: 'stub-astro-env' }, () => ({
                contents: 'export function getSecret() { return undefined }',
                loader: 'js',
              }));
            },
          },
        ],
      },
    },
  },
  integrations: [
    sitemap({
      serialize(item) {
        const path = new URL(item.url).pathname;
        const work = path.match(/^\/work\/([^/]+)\/?$/);
        const paths = work
          ? [`src/content/projects/${work[1]}`]
          : ['src/content/site', 'src/content/projects', 'src/pages/index.astro'];
        return { ...item, lastmod: lastModified(paths).toISOString() };
      },
      filter: (page) => {
        const path = new URL(page).pathname.replace(/\/$/, '') || '/';
        if (path === '/work' || path === '/projects' || path === '/all' || path === '/keystatic-upload') {
          return false;
        }
        if (path === '/preview' || path.startsWith('/preview/')) return false;
        if (path === '/canvas') return false;
    if (path === '/dev' || path.startsWith('/dev/')) return false;
        if (hiddenShop.has(path)) return false;
        if (path === '/admin' || path.startsWith('/keystatic')) return false;
        return true;
      },
    }),
    react(),
    keystaticAdmin(),
  ],
});
