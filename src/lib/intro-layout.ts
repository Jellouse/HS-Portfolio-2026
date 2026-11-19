export const BLOB_ASPECT = 559 / 249;

const VB_W = 559;
const VB_H = 249;

export const BLOB_BLEED = 111 / 2 / 559;

const EYE_LX = 153.872;
const EYE_RX = 404.224;
const EYE_Y = 149.482;
const MOUTH_Y = 235.027;

const EYE_LX_F = (-0.02 + 0.4) / 2;
const EYE_RX_F = (0.61 + 1.02) / 2;
const EYE_Y_F = (0.12 + 0.45) / 2;
const MOUTH_Y_F = (0.495 + 0.55) / 2;

const MOBILE_X = (EYE_RX_F - EYE_LX_F) / (EYE_RX - EYE_LX);
const MOBILE_Y = (MOUTH_Y_F - EYE_Y_F) / (MOUTH_Y - EYE_Y);

const NAME_GAP = 160;

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

export function shopRingWidth(vh: number, vw: number) {
  return Math.min(vw, Math.round(vh));
}

export function introRingLayout(vh: number, vw: number) {
  const face = introFaceLayout(vh, vw);
  const W0 = shopRingWidth(vh, vw);
  return { W0, C: 0, nameTop: face.nameTop };
}
