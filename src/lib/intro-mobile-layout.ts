/** Mobile homepage intro face: Figma mock, shared by intro-face.ts and shop-intro.ts. */
export const BLOB_ASPECT = 559 / 249;

export type MobileIntroLayout = {
  nameTop: number;
  faceTop: number;
  faceBottom: number;
  faceCenter: number;
  H0: number;
  W0: number;
};

/** Height-first blob in the band above the name; width capped at the viewport (SVG aspect ratio). */
export function mobileIntroLayout(vh: number, vw: number): MobileIntroLayout {
  const nameTop = Math.round(vh * 0.715);
  const minTop = 12;
  const nameGap = 20;
  const faceBottom = nameTop - nameGap;
  let faceTop = minTop;
  let H0 = Math.max(1, faceBottom - faceTop);
  let W0 = Math.round(H0 * BLOB_ASPECT);
  if (W0 > vw) {
    W0 = vw;
    H0 = Math.round(W0 / BLOB_ASPECT);
    faceTop = minTop;
  }
  const faceBottomFinal = faceTop + H0;
  const faceCenter = Math.round((faceTop + faceBottomFinal) / 2);
  return { nameTop, faceTop, faceBottom: faceBottomFinal, faceCenter, H0, W0 };
}
