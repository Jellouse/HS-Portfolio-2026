

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const file = 'node_modules/@keystatic/core/dist/keystatic-core-ui.js';
const MARK = '/* hs-save-budget */';
const anchor = '  const unscopedTreeData = useCurrentUnscopedTree();\n  return [state, async override => {';
const probe =
  `  const unscopedTreeData = useCurrentUnscopedTree();\n  ${MARK}\n` +
  `  if (typeof window !== 'undefined') window.__hsKeystaticSave = { args, unscopedTreeData, getPathPrefix, getTreeNodeAtPath, serializeEntryToFiles, path: window.location.pathname };\n` +
  `  return [state, async override => {`;

if (!existsSync(file)) {
  console.warn('[patch-keystatic] Keystatic UI bundle not found, skipping');
} else {
  const src = readFileSync(file, 'utf8');
  if (src.includes(MARK)) {
    console.log('[patch-keystatic] already patched');
  } else if (src.split(anchor).length !== 2) {
    console.warn('[patch-keystatic] anchor not found once; save-size guard disabled');
  } else {
    writeFileSync(file, src.replace(anchor, probe));
    console.log('[patch-keystatic] save-size probe added');
  }
}
