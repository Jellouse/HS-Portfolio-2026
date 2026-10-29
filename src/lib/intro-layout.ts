
export const BLOB_ASPECT = 559 / 249;

export function introFaceLayout(vh: number, vw: number) {
  const mobile = vw < 760;
  const W0 = Math.round(vw * (mobile ? 0.9 : 1.15));
  const H0 = (W0 * 249) / 559;
  const gap = mobile ? 96 : 160;
  const nameTop = Math.round(vh * (mobile ? 0.715 : 0.772));
  const faceBottom = mobile ? Math.round(nameTop / 2 + H0 / 2) : nameTop - gap;
  const faceCenter = mobile ? Math.round(nameTop / 2) : undefined;
  return { W0, H0, nameTop, faceBottom, faceCenter, mobile };
}
