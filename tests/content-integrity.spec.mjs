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
assert(digitalImages[0].discriminant === 'project' && digitalImages[0].value.project === 'atomic-ski', 'atomic image');
assert(digitalImages[1].discriminant === 'project' && digitalImages[1].value.project === 'analogue-af1', 'af1 image');
assert(
  digitalImages[2].discriminant === 'image' &&
    digitalImages[2].value.src === '/src/content/services/images/analogue-af1-render.jpg',
  'af1 render lives with the service',
);
assert(
  digitalImages[0].value.src === '/src/content/services/images/atomic-ski.png' &&
    digitalImages[1].value.src === '/src/content/services/images/analogue-af1.png',
  'project images live with the service',
);

const physical = parse(readFileSync(join(root, 'src/content/services/physical-build.yaml'), 'utf8'));
const physicalImages = physical.sections.flatMap((section) => section.images);
assert(physicalImages[0].discriminant === 'project' && physicalImages[0].value.project === 'analogue-counters', 'counters poster');
assert(physicalImages[0].value.video.endsWith('.mp4'), 'counters video');
assert(physicalImages[0].value.src === '/src/content/services/images/analogue-counters.jpg', 'counters poster file');
assert(
  physicalImages.slice(1).every((image) => image.discriminant === 'image' && image.value.src.startsWith('/src/content/services/images/')),
  'physical photos live with the service',
);

const atomicProject = {
  title: 'Atomic Ski',
  year: 2024,
  yearEnd: 2026,
};
const af1Project = {
  title: 'Analogue AF1',
  year: 2024,
  yearEnd: 2026,
};

assert(projectSlugForServiceImage(digitalImages[0]) === 'atomic-ski', 'project image slug');
assert(projectSlugForServiceImage(digitalImages[2]) === 'analogue-af1', 'file image slug comes from the work link');

const atomic = resolveServiceImage(digitalImages[0], atomicProject, 'digital');
assert(atomic.src === '/src/content/services/images/atomic-ski.png' && atomic.video === false, 'project image src');
assert(atomic.alt === 'Atomic Ski website hero with a skier mid jump', 'service alt stays');
assert(atomic.caption === projectLabel(atomicProject) && atomic.caption === 'Atomic Ski, 2024 \u2013 2026', 'caption comes from the project');
assert(atomic.href === '/work/atomic-ski/', 'project link stays');

const af1Cover = resolveServiceImage(digitalImages[1], af1Project, 'digital-af1');
assert(af1Cover.caption === projectLabel(af1Project) && af1Cover.caption === 'Analogue AF1, 2024 \u2013 2026', 'af1 caption comes from the project');

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
  { title: 'Analogue Counters', year: 2025, yearEnd: 2026 },
  'physical',
);
assert(video.video === true && video.poster === '/src/content/services/images/analogue-counters.jpg', 'video poster is the service image');
assert(video.src === physicalImages[0].value.video, 'video url stays');
assert(video.caption === 'Analogue Store Zeedijk', 'custom service caption stays');

const dir = mkdtempSync(join(tmpdir(), 'hs-content-'));
try {
  mkdirSync(join(dir, 'src/content/projects/demo'), { recursive: true });
  mkdirSync(join(dir, 'src/content/services'), { recursive: true });
  writeFileSync(
    join(dir, 'src/content/projects/demo/index.yaml'),
    [
      'title: Demo',
      'blocks:',
      '  - discriminant: text',
      '    value:',
      '      heading: Headline only',
      '  - discriminant: text',
      '    value:',
      '      text: Body only',
      '  - discriminant: text',
      '    value: {}',
      '',
    ].join('\n'),
  );
  writeFileSync(
    join(dir, 'src/content/services/broken.yaml'),
    [
      'sections:',
      '  - images:',
      '      - discriminant: project',
      '        value:',
      '          project: missing-slug',
      '          src: /src/content/services/images/nope.jpg',
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
    'src/content/services/broken.yaml sections[0].images[0].value.project: unknown project missing-slug',
    'src/content/services/broken.yaml sections[0].images[0].value.src: missing image /src/content/services/images/nope.jpg',
    'src/content/services/broken.yaml sections[0].images[1].value.src: missing image',
    'src/content/services/broken.yaml sections[0].images[2].value.src: missing image /src/content/services/images/nope.jpg',
    'src/content/services/broken.yaml projects[0]: unknown project nope',
    'src/content/projects/demo/index.yaml blocks[2]: text block needs a title or body',
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

const processDir = mkdtempSync(join(tmpdir(), 'hs-process-'));
try {
  mkdirSync(join(processDir, 'src/content/projects/demo'), { recursive: true });
  writeFileSync(join(processDir, 'src/content/projects/demo/index.yaml'), 'title: Demo\n');
  writeFileSync(
    join(processDir, 'src/content/projects/demo/ok.yaml'),
    [
      'blocks:',
      '  - discriminant: process',
      '    value:',
      '      images:',
      '        - video: https://cdn.example/clip.mp4',
      '          alt: A clip',
      '        - src: /src/content/projects/demo/shot.jpg',
      '          alt: A still',
      '',
    ].join('\n'),
  );
  mkdirSync(join(processDir, 'src/content/projects/demo'), { recursive: true });
  writeFileSync(join(processDir, 'src/content/projects/demo/shot.jpg'), 'x');
  const okErrors = checkContent(processDir).filter((line) => line.includes('ok.yaml'));
  if (okErrors.length) {
    console.error(okErrors.join('\n'));
    throw new Error('process video item should pass the content check');
  }

  writeFileSync(
    join(processDir, 'src/content/projects/demo/bad.yaml'),
    [
      'blocks:',
      '  - discriminant: process',
      '    value:',
      '      images:',
      '        - alt: empty item',
      '        - video: not-a-video',
      '',
    ].join('\n'),
  );
  const bad = checkContent(processDir);
  const need = [
    'src/content/projects/demo/bad.yaml blocks[0].value.images[0]: process item needs an image or a video',
    'src/content/projects/demo/bad.yaml blocks[0].value.images[1].video: use an mp4, webm, or mov URL',
  ];
  for (const line of need) {
    if (!bad.includes(line)) {
      console.error(bad.join('\n'));
      throw new Error(`missing error: ${line}`);
    }
  }
} finally {
  rmSync(processDir, { recursive: true, force: true });
}

console.log('content integrity ok');
