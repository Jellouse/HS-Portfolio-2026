import { readFileSync } from 'node:fs';
import { typeScale } from '../src/lib/type-scale.ts';

const css = readFileSync(new URL('../src/styles/type.css', import.meta.url), 'utf8');
const failures = [];
for (const [name, value] of Object.entries(typeScale)) {
  const decl = `--${name}: ${value};`;
  if (!css.includes(decl)) failures.push(`missing ${decl}`);
}
if (/(\d+\.\d+)px/.test(css)) failures.push('type.css has a fractional px');
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('type-scale: ok');
