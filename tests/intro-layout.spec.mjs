import { BLOB_ASPECT, introFaceLayout, introRingLayout } from '../src/lib/intro-layout.ts';

const d = introFaceLayout(844, 390);
const desk = introFaceLayout(900, 1440);
const ring = introRingLayout(844, 390);
const failures = [];
const nameTop = Math.round(844 * 0.75 - 29 / 2);
const scaleX = d.W0 / 559;
const scaleY = d.H0 / 249;
const left = (390 - d.W0) / 2;
const eyeLx = left + 153.872 * scaleX;
const eyeRx = left + 404.224 * scaleX;
const eyeY = d.faceTop + 149.482 * scaleY;
const mouthY = d.faceTop + 235.027 * scaleY;
const near = (got, want, label) => {
  if (Math.abs(got - want) > 4) failures.push(`${label} ${got.toFixed(1)} want ${want.toFixed(1)}`);
};

if (d.W0 <= 390) failures.push(`mobile face should bleed past the sides (${d.W0})`);
if (left >= 0 || left + d.W0 <= 390) failures.push(`mobile face not cut off on both sides (${left.toFixed(0)})`);
if (d.faceTop >= 0) failures.push(`mobile face should be cut off at the top (${d.faceTop})`);
if (d.nameTop !== nameTop) failures.push(`nameTop ${d.nameTop} expected ${nameTop}`);
if (d.faceBottom !== d.faceTop + d.H0) failures.push('faceBottom');
const unshiftedTop = Math.round(844 * (0.285 - 149.482 * ((0.5225 - 0.285) / (235.027 - 149.482))));
near(eyeLx, 0.19 * 390, 'left eye x');
near(eyeRx, 0.815 * 390, 'right eye x');
near(mouthY, 0.5225 * 844, 'mouth y');
if (d.faceTop !== unshiftedTop + Math.round(844 * 0.04)) failures.push(`brow crop ${d.faceTop}, unshifted ${unshiftedTop}`);
if (eyeY < 0.26 * 844 || eyeY > 0.36 * 844) failures.push(`eye y ${eyeY.toFixed(1)}`);
if (d.faceBottom < 0.54 * 844 || d.faceBottom > 0.62 * 844) failures.push(`face bottom ${d.faceBottom}`);
const fitted = Math.round(390 / (1 + 2 * (111 / 2 / 559)));
const ringH = Math.round(fitted / 1.3);
const ringBottom = nameTop - 160;
if (!ring || ring.W0 !== fitted || ring.C !== Math.round((ringBottom - ringH + ringBottom) / 2)) {
  failures.push(`ring ${ring && ring.W0}/${ring && ring.C}`);
}
if (desk.W0 !== Math.round(1440 * 1.15)) failures.push(`desktop W0 ${desk.W0}`);
if (Math.abs(desk.W0 / desk.H0 - BLOB_ASPECT) > 0.001) failures.push('desktop aspect');
if (desk.faceBottom !== Math.round(900 * 0.772) - 160) failures.push('desktop faceBottom');
if (desk.nameTop !== Math.round(900 * 0.772)) failures.push('desktop name');
if (desk.mobile) failures.push('desktop flagged mobile');
if (introRingLayout(900, 1440) !== null) failures.push('desktop ring should stay in shop-intro');
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('intro-layout: ok');
