/**
 * Mobile intro geometry matches the Figma mock: wide face, top inset, bottom above the name.
 */
import { mobileIntroLayout } from '../src/lib/intro-mobile-layout.ts';

const vh = 844;
const m = mobileIntroLayout(vh);
const failures = [];
if (m.W0 < 390 * 1.05) failures.push(`W0 ${m.W0} should bleed past 390px viewport`);
if (m.faceTop > 16) failures.push(`faceTop ${m.faceTop} should sit under the island`);
if (m.nameTop - m.faceBottom !== 20) failures.push(`name gap ${m.nameTop - m.faceBottom} expected 20`);
if (Math.abs(m.H0 / m.W0 - 249 / 559) > 0.001) failures.push('aspect ratio drift');
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('intro-mobile-layout: ok');
