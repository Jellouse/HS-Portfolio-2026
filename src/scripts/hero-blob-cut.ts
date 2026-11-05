/** Below 0 the source is whole. 1 and above is empty. */
let sourceCut = -1;

export function setHeroBlobSourceCut(n: number) {
  sourceCut = n;
}

export function getHeroBlobSourceCut() {
  return sourceCut;
}
