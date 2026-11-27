/**
 * Where a project page stops when the arrow keys step through it.
 *
 * The page gathers the raw measurements and this decides the positions, so the
 * behaviour and the test that checks every page agree on one definition.
 */

export const STOP_SELECTOR = '.image-block, .pair, .text-block, .process, .info';

/** Two stops closer than this are the same stop. */
export const NEAR = 4;

/** The page end needs this much past the last stop to count as its own. */
const END_GAP = 40;

/**
 * Turn section measurements into stops. A process grid with several rows
 * contributes one stop per row, the first carrying the grid's label.
 *
 * A section is `{ start, height, rows }`, where `start` is the content's top in
 * the document, `height` is the content height with its padding removed, and
 * `rows` (process only) is `[{ start, height }]` measured from `start`.
 */
export function stopBoxes(sections) {
  const out = [];
  for (const section of sections) {
    const rows = section.rows || [];
    if (rows.length < 2) {
      out.push({ start: section.start, height: section.height });
      continue;
    }
    // The label travels with the first row, so the opening stop still reads
    // Process instead of showing a bare pair of photos.
    out.push({ start: section.start, height: rows[0].start + rows[0].height });
    for (let i = 1; i < rows.length; i++) {
      out.push({ start: section.start + rows[i].start, height: rows[i].height });
    }
  }
  return out;
}

/**
 * Scroll position for each stop, the first being the top of the page. A stop
 * centres its content; one taller than the screen cannot, so it gets the air it
 * would have had if it fit.
 */
export function stopPositions(boxes, vh, max) {
  const out = [0];
  for (const box of boxes) {
    const room = Math.max(0, Math.round((vh - Math.min(box.height, vh)) / 2));
    const at = Math.min(max, Math.max(0, Math.round(box.start - room)));
    if (at > out[out.length - 1] + NEAR) out.push(at);
  }
  // A section taller than the screen leaves more below it than one press can
  // show, so the end of the page gets its own stop.
  if (max > out[out.length - 1] + END_GAP) out.push(max);
  return out;
}

/**
 * Empty room to add under the last stop, so centring it is reachable at all.
 * The page needs half a screen below that stop's content to meet its middle.
 */
export function tailRoom(boxes, docHeight, vh) {
  const last = boxes[boxes.length - 1];
  if (!last) return 0;
  const after = docHeight - (last.start + last.height);
  return Math.max(0, Math.ceil((vh - last.height) / 2 - after));
}
