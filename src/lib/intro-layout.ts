/** SVG blob width:height (559×249 viewBox). Desktop keeps this. Mobile derives a taller box from it. */
export const BLOB_ASPECT = 559 / 249;

/**
 * The displacement shader offsets by scale*(noise-0.5), so the goo can leave the
 * viewBox by half the feDisplacementMap scale. Mobile width keeps that margin inside the viewport.
 */
export const BLOB_BLEED = 111 / 2 / 559;

/** Mobile face: 13 wide to 10 tall. Rounder than the desktop ellipse, still wider than tall. */
export const MOBILE_FACE_ASPECT = 13 / 10;

/** Same gap the desktop face keeps above the name. */
const NAME_GAP = 160;

export function introFaceLayout(vh: number, vw: number) {
  const mobile = vw < 760;
  const nameTop = Math.round(vh * (mobile ? 0.715 : 0.772));
  if (!mobile) {
    const W0 = Math.round(vw * 1.15);
    const H0 = (W0 * 249) / 559;
    const faceBottom = nameTop - NAME_GAP;
    return {
      W0,
      H0,
      nameTop,
      faceTop: faceBottom - H0,
      faceBottom,
      faceCenter: undefined as number | undefined,
      mobile,
      stretch: 1,
    };
  }

  const W0 = Math.round(vw / (1 + 2 * BLOB_BLEED));
  const H0 = Math.max(1, Math.round(W0 / MOBILE_FACE_ASPECT));
  const nativeH = W0 / BLOB_ASPECT;
  const faceBottom = nameTop - NAME_GAP;
  const faceTop = faceBottom - H0;
  return {
    W0,
    H0,
    nameTop,
    faceTop,
    faceBottom,
    faceCenter: Math.round((faceTop + faceBottom) / 2),
    mobile,
    stretch: H0 / nativeH,
  };
}

/** Mobile ring: the circle's own proportion, same width and centre as the face. Desktop stays in shop-intro. */
export function introRingLayout(vh: number, vw: number) {
  const face = introFaceLayout(vh, vw);
  if (!face.mobile || face.faceCenter === undefined) return null;
  return { W0: face.W0, C: face.faceCenter, nameTop: face.nameTop };
}
