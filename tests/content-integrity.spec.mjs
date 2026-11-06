import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { checkContent } from '../scripts/check-content.mjs';
import { resolveServiceImage } from '../src/lib/service-images.mjs';

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

const atomic = resolveServiceImage(
  digitalImages[0],
  { cover: '/src/content/projects/atomic-ski/cover.png', coverAlt: 'Atomic Ski' },
  'digital',
);
assert(atomic.src === '/src/content/projects/atomic-ski/cover.png' && atomic.video === false, 'project cover src');
assert(atomic.alt === 'Atomic Ski website hero with a skier mid jump', 'service alt stays');
assert(atomic.caption === 'Atomic Ski, [year]' && atomic.href === '/work/atomic-ski/', 'caption and link stay');

const video = resolveServiceImage(
  physicalImages[0],
  { cover: '/src/content/projects/analogue-counters/cover.jpg', coverAlt: 'Store' },
  'physical',
);
assert(video.video === true && video.poster === '/src/content/projects/analogue-counters/cover.jpg', 'video poster is the project cover');
assert(video.src === physicalImages[0].value.video, 'video url stays');

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
