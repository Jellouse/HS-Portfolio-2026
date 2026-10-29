/** Mobile homepage intro face: Figma mock (390×844), shared by intro-face.ts and shop-intro.ts. */
export type MobileIntroLayout = {
  nameTop: number;
  faceTop: number;
  faceBottom: number;
  faceCenter: number;
  H0: number;
  W0: number;
};

export function mobileIntroLayout(vh: number): MobileIntroLayout {
  const nameTop = Math.round(vh * 0.715);
  const faceTop = 12;
  const nameGap = 20;
  const faceBottom = nameTop - nameGap;
  const H0 = Math.max(1, faceBottom - faceTop);
  const W0 = Math.round((H0 * 559) / 249);
  const faceCenter = Math.round((faceTop + faceBottom) / 2);
  return { nameTop, faceTop, faceBottom, faceCenter, H0, W0 };
}
