import { BLOB_ASPECT, MOBILE_FACE_ASPECT, introFaceLayout, introRingLayout } from '../src/lib/intro-layout.ts';

const d = introFaceLayout(844, 390);
const desk = introFaceLayout(900, 1440);
const ring = introRingLayout(844, 390);
const failures = [];
const nameTop = Math.round(844 * 0.715);
const fitted = Math.round(390 / (1 + 2 * (111 / 2 / 559)));
const H0 = Math.round(fitted / MOBILE_FACE_ASPECT);
if (d.W0 !== fitted) failures.push(`mobile W0 ${d.W0} expected ${fitted}`);
if (d.W0 > 390) failures.push('mobile face wider than the viewport');
if (d.H0 !== H0) failures.push(`H0 ${d.H0} expected ${H0}`);
if (Math.abs(d.W0 / d.H0 - MOBILE_FACE_ASPECT) > 0.02) failures.push(`mobile aspect ${d.W0 / d.H0}`);
if (d.faceBottom !== nameTop - 160) failures.push(`faceBottom ${d.faceBottom}`);
if (d.faceTop !== d.faceBottom - d.H0) failures.push(`faceTop ${d.faceTop}`);
if (d.faceTop >= 224) failures.push(`face is not higher than the old ellipse (${d.faceTop})`);
if (!(d.W0 / d.H0 < BLOB_ASPECT - 0.2)) failures.push('mobile face is not rounder than the desktop ellipse');
if (!ring || ring.W0 !== d.W0 || ring.C !== d.faceCenter) failures.push('ring does not share the face');
if (desk.W0 !== Math.round(1440 * 1.15)) failures.push(`desktop W0 ${desk.W0}`);
if (Math.abs(desk.W0 / desk.H0 - BLOB_ASPECT) > 0.001) failures.push('desktop aspect');
if (desk.faceBottom !== Math.round(900 * 0.772) - 160) failures.push('desktop faceBottom');
if (desk.mobile) failures.push('desktop flagged mobile');
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('intro-layout: ok');
