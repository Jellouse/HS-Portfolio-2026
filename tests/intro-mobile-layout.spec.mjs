/**
 * Mobile intro geometry matches the Figma mock: fills above the name, width fits the viewport.
 */
import { BLOB_ASPECT, mobileIntroLayout } from '../src/lib/intro-mobile-layout.ts';

const vh = 844;
const vw = 390;
const m = mobileIntroLayout(vh, vw);
const failures = [];
if (m.W0 > vw) failures.push(`W0 ${m.W0} must fit viewport ${vw}`);
if (m.faceTop !== 12) failures.push(`faceTop ${m.faceTop} should anchor under the island`);
if (Math.abs(m.W0 / m.H0 - BLOB_ASPECT) > 0.02) failures.push('aspect ratio drift');
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('intro-mobile-layout: ok');
