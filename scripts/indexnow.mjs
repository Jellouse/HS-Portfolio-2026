import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOST = 'humansize.de';
const SITEMAP = `https://${HOST}/sitemap-index.xml`;
const ENDPOINT = 'https://api.indexnow.org/indexnow';
const KEY_FILE = /^[a-f0-9]{32}\.txt$/;

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function ok(message) {
  console.log(message);
  process.exit(0);
}

function locs(xml) {
  return [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((match) => match[1].trim());
}

async function get(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} -> ${response.status}`);
  return response.text();
}

async function main() {
  const name = readdirSync(join(root, 'public')).find((file) => KEY_FILE.test(file));
  if (!name) throw new Error('No IndexNow key file in public/');
  const key = name.slice(0, 32);
  const body = readFileSync(join(root, 'public', name), 'utf8');
  if (body !== key) throw new Error(`Key file body does not match ${name}`);

  const childSitemaps = locs(await get(SITEMAP));
  if (!childSitemaps.length) throw new Error(`No child sitemaps in ${SITEMAP}`);

  const urls = new Set();
  for (const loc of childSitemaps) {
    for (const url of locs(await get(loc))) urls.add(url);
  }
  const urlList = [...urls];
  if (!urlList.length) throw new Error('No URLs in child sitemaps');

  const keyLocation = `https://${HOST}/${name}`;
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: HOST, key, keyLocation, urlList }),
  });
  const text = await response.text().catch(() => '');
  const status = response.status;
  if (status === 200 || status === 202) {
    ok(`IndexNow ${status} (${urlList.length} URLs)`);
  }
  console.error(`IndexNow ${status} (${urlList.length} URLs)`);
  if (text) console.error(text.slice(0, 500));
  process.exit(0);
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exit(0);
});
