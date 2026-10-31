import { readFileSync } from 'node:fs';
import { collect } from '../scripts/check-design.mjs';

const baseline = JSON.parse(readFileSync(new URL('../docs/agents/known-drift.json', import.meta.url), 'utf8'));
const { drift, errors } = collect();
const base = new Set(baseline);
const now = new Set(drift);
const extra = drift.filter((row) => !base.has(row));
const gone = baseline.filter((row) => !now.has(row));
if (errors.length || extra.length || gone.length) {
  console.error([...errors, ...extra.map((row) => `new ${row}`), ...gone.map((row) => `stale ${row}`)].join('\n'));
  process.exit(1);
}
console.log(`design-check: ok (${drift.length} known drift)`);
