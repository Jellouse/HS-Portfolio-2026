/** SVG blob width:height (559×249 viewBox). Desktop keeps this. Mobile derives a taller box from it. */
export const BLOB_ASPECT = 559 / 249;

/**
 * The displacement shader offsets by scale*(noise-0.5), so the goo can leave the
 * viewBox by half the feDisplacementMap scale. Mobile width keeps that margin inside the viewport.
 */
export const BLOB_BLEED = 111 / 2 / 559;

/**
 * Ink past the 249-tall viewBox, in viewBox units, across the mobile idle drift
 * (displacement 111, idle amplitude 14, seed 48). Vertical stretch multiplies these.
 */
export const BLOB_INK_ABOVE = 27;
export const BLOB_INK_BELOW = 34;

/** Same value as `--pad`. Inset under the top edge and the gap above the name. */
export const INTRO_PAD = 20;

export function introFaceLayout(vh: number, vw: number) {
  const mobile = vw < 760;
  const nameTop = Math.round(vh * (mobile ? 0.715 : 0.772));
  if (!mobile) {
    const W0 = Math.round(vw * 1.15);
    const H0 = (W0 * 249) / 559;
    const faceBottom = nameTop - 160;
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

  const inkTop = INTRO_PAD;
  const inkBottom = nameTop - INTRO_PAD;
  const inkSpan = Math.max(1, inkBottom - inkTop);
  const W0 = Math.round(vw / (1 + 2 * BLOB_BLEED));
  const nativeH = W0 / BLOB_ASPECT;
  const H0 = Math.max(1, Math.round(inkSpan / (1 + (BLOB_INK_ABOVE + BLOB_INK_BELOW) / 249)));
  const faceTop = inkTop + Math.round((BLOB_INK_ABOVE * H0) / 249);
  const faceBottom = faceTop + H0;
  return {
    W0,
    H0,
    nameTop,
    faceTop,
    faceBottom,
    faceCenter: Math.round((inkTop + inkBottom) / 2),
    mobile,
    stretch: H0 / nativeH,
  };
}

/** Mobile ring: the circle's own proportion, contained in the same band as the face. Desktop stays in shop-intro. */
export function introRingLayout(vh: number, vw: number) {
  const face = introFaceLayout(vh, vw);
  if (!face.mobile || face.faceCenter === undefined) return null;
  const bandTop = INTRO_PAD;
  const bandBottom = face.nameTop - INTRO_PAD;
  const W0 = Math.min(vw, bandBottom - bandTop);
  return { W0, C: Math.round((bandTop + bandBottom) / 2), nameTop: face.nameTop };
}
