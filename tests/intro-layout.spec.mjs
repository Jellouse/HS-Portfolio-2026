import { BLOB_ASPECT, introFaceLayout, introRingLayout } from '../src/lib/intro-layout.ts';

const d = introFaceLayout(844, 390);
const desk = introFaceLayout(900, 1440);
const ring = introRingLayout(844, 390);
const failures = [];
const nameTop = Math.round(844 * 0.715);
const fitted = Math.round(390 / (1 + 2 * (111 / 2 / 559)));
const inkSpan = nameTop - 40;
const H0 = Math.round(inkSpan / (1 + (27 + 34) / 249));
if (d.W0 !== fitted) failures.push(`mobile W0 ${d.W0} expected ${fitted}`);
if (d.W0 > 390) failures.push('mobile face wider than the viewport');
if (d.H0 !== H0) failures.push(`H0 ${d.H0} expected ${H0}`);
if (d.faceTop !== 20 + Math.round((27 * H0) / 249)) failures.push(`faceTop ${d.faceTop}`);
if (d.faceBottom !== d.faceTop + d.H0) failures.push(`faceBottom ${d.faceBottom}`);
if (d.faceBottom >= nameTop) failures.push('face box crosses the name');
if (!(d.H0 / d.W0 > 249 / 559)) failures.push('mobile face is not taller than the flat ellipse');
if (Math.abs(d.W0 / d.H0 - BLOB_ASPECT) < 0.05) failures.push('mobile face kept the desktop aspect');
const bandC = Math.round((20 + (nameTop - 20)) / 2);
if (!ring || ring.W0 !== Math.min(390, nameTop - 40) || ring.C !== bandC) failures.push('ring does not share the band');
if (desk.W0 !== Math.round(1440 * 1.15)) failures.push(`desktop W0 ${desk.W0}`);
if (Math.abs(desk.W0 / desk.H0 - BLOB_ASPECT) > 0.001) failures.push('desktop aspect');
if (desk.faceBottom !== Math.round(900 * 0.772) - 160) failures.push('desktop faceBottom');
if (desk.mobile) failures.push('desktop flagged mobile');
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('intro-layout: ok');
