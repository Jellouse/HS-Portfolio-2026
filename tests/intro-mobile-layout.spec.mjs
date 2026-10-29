/**
 * introFaceLayout matches main branch geometry.
 */
import { BLOB_ASPECT, introFaceLayout } from '../src/lib/intro-mobile-layout.ts';

const d = introFaceLayout(844, 390);
const failures = [];
if (d.W0 !== 351) failures.push(`mobile W0 ${d.W0} expected 351`);
if (Math.abs(d.W0 / d.H0 - BLOB_ASPECT) > 0.001) failures.push('aspect ratio');
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('intro-mobile-layout: ok');
