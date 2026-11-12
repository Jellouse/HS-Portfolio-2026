import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { checkContent } from '../scripts/check-content.mjs';
import { projectLabel } from '../src/lib/project-label.mjs';
import { projectSlugForServiceImage, resolveServiceImage } from '../src/lib/service-images.mjs';

const require = createRequire(import.meta.url);
const { parse } = require('yaml');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

const repoErrors = checkContent(root);
if (repoErrors.length) {
  console.error(repoErrors.join('\n'));
  throw new Error(`${repoErrors.length} content check(s) failed on the repo`);
}

const digital = parse(readFileSync(join(root, 'src/content/services/digital-build.yaml'), 'utf8'));
const digitalImages = digital.sections.flatMap((section) => section.images);
assert(digitalImages[0].discriminant === 'project' && digitalImages[0].value.project === 'atomic-ski', 'atomic cover');
assert(digitalImages[1].discriminant === 'project' && digitalImages[1].value.project === 'analogue-af1', 'af1 cover');
assert(
  digitalImages[2].discriminant === 'image' &&
    digitalImages[2].value.src === '/src/content/services/images/analogue-af1-render.jpg',
  'af1 render lives with the service',
);
assert(!JSON.stringify(digital).includes('cover.jpg') && !JSON.stringify(digital).includes('cover.png'), 'digital build stores no cover path');

const physical = parse(readFileSync(join(root, 'src/content/services/physical-build.yaml'), 'utf8'));
const physicalImages = physical.sections.flatMap((section) => section.images);
assert(physicalImages[0].discriminant === 'project' && physicalImages[0].value.project === 'analogue-counters', 'counters poster');
assert(physicalImages[0].value.video.endsWith('.mp4'), 'counters video');
assert(
  physicalImages.slice(1).every((image) => image.discriminant === 'image' && image.value.src.startsWith('/src/content/services/images/')),
  'physical photos live with the service',
);

const atomicProject = {
  title: 'Atomic Ski',
  year: 2024,
  yearEnd: 2026,
  cover: '/src/content/projects/atomic-ski/cover.png',
  coverAlt: 'Atomic Ski',
};
const af1Project = {
  title: 'Analogue AF1',
  year: 2024,
  yearEnd: 2026,
  cover: '/src/content/projects/analogue-af1/cover.png',
  coverAlt: 'Analogue AF1',
};

assert(projectSlugForServiceImage(digitalImages[0]) === 'atomic-ski', 'project cover slug');
assert(projectSlugForServiceImage(digitalImages[2]) === 'analogue-af1', 'file image slug comes from the work link');

const atomic = resolveServiceImage(digitalImages[0], atomicProject, 'digital');
assert(atomic.src === '/src/content/projects/atomic-ski/cover.png' && atomic.video === false, 'project cover src');
assert(atomic.alt === 'Atomic Ski website hero with a skier mid jump', 'service alt stays');
assert(atomic.caption === projectLabel(atomicProject) && atomic.caption === 'Atomic Ski, 2024 \u2013 2026', 'caption comes from the project');
assert(atomic.href === '/work/atomic-ski/', 'project link stays');

const af1Cover = resolveServiceImage(digitalImages[1], af1Project, 'digital-af1');
assert(af1Cover.caption === projectLabel(af1Project) && af1Cover.caption === 'Analogue AF1, 2024 \u2013 2026', 'af1 cover caption comes from the project');

const af1Render = resolveServiceImage(digitalImages[2], af1Project, 'digital-render');
assert(af1Render.caption === projectLabel(af1Project), 'af1 render caption comes from the linked project');
assert(af1Render.href === '/work/analogue-af1/', 'af1 render link stays');

const later = resolveServiceImage(digitalImages[0], { ...atomicProject, yearEnd: 2027 }, 'digital-later');
assert(later.caption === 'Atomic Ski, 2024 \u2013 2027', 'a project year edit updates the service caption');

assert(
  [atomic, af1Cover, af1Render].every((image) => !image.caption.includes('[year]')),
  'no leftover [year] in resolved digital captions',
);

const video = resolveServiceImage(
  physicalImages[0],
  { title: 'Analogue Counters', year: 2025, yearEnd: 2026, cover: '/src/content/projects/analogue-counters/cover.jpg', coverAlt: 'Store' },
  'physical',
);
assert(video.video === true && video.poster === '/src/content/projects/analogue-counters/cover.jpg', 'video poster is the project cover');
assert(video.src === physicalImages[0].value.video, 'video url stays');
assert(video.caption === 'Analogue Store Zeedijk', 'custom service caption stays');

const dir = mkdtempSync(join(tmpdir(), 'hs-content-'));
try {
  mkdirSync(join(dir, 'src/content/projects/demo'), { recursive: true });
  mkdirSync(join(dir, 'src/content/services'), { recursive: true });
  writeFileSync(join(dir, 'src/content/projects/demo/index.yaml'), 'cover: /src/content/projects/demo/cover.jpg\n');
  writeFileSync(
    join(dir, 'src/content/services/broken.yaml'),
    [
      'sections:',
      '  - images:',
      '      - discriminant: project',
      '        value:',
      '          project: missing-slug',
      '      - discriminant: project',
      '        value:',
      '          project: demo',
      '      - discriminant: image',
      '        value:',
      '          src: /src/content/services/images/nope.jpg',
      'projects:',
      '  - nope',
      '',
    ].join('\n'),
  );
  const errors = checkContent(dir);
  const need = [
    'src/content/projects/demo/index.yaml cover: missing image /src/content/projects/demo/cover.jpg',
    'src/content/services/broken.yaml sections[0].images[0].value.project: unknown project missing-slug',
    'src/content/services/broken.yaml sections[0].images[1].value.project: project demo has no cover',
    'src/content/services/broken.yaml sections[0].images[2].value.src: missing image /src/content/services/images/nope.jpg',
    'src/content/services/broken.yaml projects[0]: unknown project nope',
  ];
  for (const line of need) {
    if (!errors.includes(line)) {
      console.error(errors.join('\n'));
      throw new Error(`missing error: ${line}`);
    }
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log('content integrity ok');
