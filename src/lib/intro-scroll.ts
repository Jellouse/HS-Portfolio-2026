export function introScrollT(scrollY: number, R: number, reduced = false) {
  if (reduced || R <= 0) return 1;
  return Math.min(1, Math.max(0, scrollY / R));
}

export function introScaleFromScroll(scrollY: number, R: number, sMin: number, reduced = false) {
  const t = introScrollT(scrollY, R, reduced);
  return 1 + (sMin - 1) * t;
}

export function smoothIntro(cur: number, goal: number, dt: number, tau: number, epsilon = 0.0005) {
  if (!tau || Number.isNaN(cur)) return goal;
  const next = cur + (goal - cur) * (1 - Math.exp(-dt / tau));
  if (Math.abs(goal - next) < epsilon) return goal;
  return next;
}

export function introCopyProgress(cur: number, sMin: number) {
  if (sMin === 1) return 0;
  return Math.min(1, Math.max(0, (1 - cur) / (1 - sMin)));
}
