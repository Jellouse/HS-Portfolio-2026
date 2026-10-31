/** SVG blob width:height (559×249 viewBox). Desktop keeps this. */
export const BLOB_ASPECT = 559 / 249;

/** ViewBox width and height of the homepage blob. */
const VB_W = 559;
const VB_H = 249;

/**
 * The displacement shader offsets by scale*(noise-0.5), so the goo can leave the
 * viewBox by half the feDisplacementMap scale. The shop ring keeps that margin inside the viewport.
 */
export const BLOB_BLEED = 111 / 2 / 559;

/** Shop ring on a phone: 13 wide to 10 tall, the circle's own proportion. */
const RING_ASPECT = 13 / 10;

/**
 * Eye and mouth centres from the ellipses in HeroBlob.astro.
 * Mobile places those centres on the viewport. The box is wider than the screen.
 */
const EYE_LX = 153.872;
const EYE_RX = 404.224;
const EYE_Y = 149.482;
const MOUTH_Y = 235.027;

/** Left eye spans about -2% to 40% of the width. Right eye about 61% to 102%. Both about 12% to 45% of the height. */
const EYE_LX_F = (-0.02 + 0.4) / 2;
const EYE_RX_F = (0.61 + 1.02) / 2;
const EYE_Y_F = (0.12 + 0.45) / 2;
/** Mouth spans about 49.5% to 55% of the height. */
const MOUTH_Y_F = (0.495 + 0.55) / 2;

const MOBILE_X = (EYE_RX_F - EYE_LX_F) / (EYE_RX - EYE_LX);
const MOBILE_Y = (MOUTH_Y_F - EYE_Y_F) / (MOUTH_Y - EYE_Y);

/** Same gap the desktop face keeps above the name. The phone ring still uses it. */
const NAME_GAP = 160;

/** Phone title: the Humansize line is centred at 75% of the viewport. 29 is --lh. Desktop stays at 77.2%. */
const NAME_LINE = 29;

export function introFaceLayout(vh: number, vw: number) {
  const mobile = vw < 760;
  const nameTop = mobile
    ? Math.round(vh * 0.75 - NAME_LINE / 2)
    : Math.round(vh * 0.772);
  if (!mobile) {
    const W0 = Math.round(vw * 1.15);
    const H0 = (W0 * VB_H) / VB_W;
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

  const W0 = Math.max(1, Math.round(vw * VB_W * MOBILE_X));
  const fittedH = Math.max(1, Math.round(vh * VB_H * MOBILE_Y));
  const fittedTop = Math.round(vh * (EYE_Y_F - EYE_Y * MOBILE_Y));
  // Bring the brow arc down a little. The mouth stays put, so the box gets shorter.
  const faceTop = fittedTop + Math.round(vh * 0.04);
  const faceBottom = fittedTop + fittedH;
  const H0 = Math.max(1, faceBottom - faceTop);
  const nativeH = W0 / BLOB_ASPECT;
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

/** Phone ring: its own circle, inset from the edges, sitting in the gap above the name. Desktop stays in shop-intro. */
export function introRingLayout(vh: number, vw: number) {
  const face = introFaceLayout(vh, vw);
  if (!face.mobile) return null;
  const W0 = Math.round(vw / (1 + 2 * BLOB_BLEED));
  const H0 = Math.max(1, Math.round(W0 / RING_ASPECT));
  const bottom = face.nameTop - NAME_GAP;
  const top = bottom - H0;
  return { W0, C: Math.round((top + bottom) / 2), nameTop: face.nameTop };
}
