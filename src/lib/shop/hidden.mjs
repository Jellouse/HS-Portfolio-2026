

import { readdirSync, readFileSync } from 'node:fs';
import { parse } from 'yaml';

export function hiddenProductSlugs(dir = 'src/content/products') {
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((slug) => {
      try {
        const d = parse(readFileSync(`${dir}/${slug}/index.yaml`, 'utf8')) || {};
        return d.overview?.show === false;
      } catch {
        return false;
      }
    });
}
