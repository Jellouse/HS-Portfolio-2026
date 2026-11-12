import { visibleAppView } from '../src/lib/viewport-layout.ts';

const failures = [];
const eq = (got, want, label) => {
  const same = typeof want === 'object'
    ? Object.keys(want).every((k) => got[k] === want[k])
    : got === want;
  if (!same) failures.push(`${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};

const layout = { width: 390, height: 844 };
const svh = 844;

eq(
  visibleAppView(null, svh, layout),
  { top: 0, left: 0, width: 390, height: 844, inset: false },
  'no visual viewport',
);

eq(
  visibleAppView({ offsetTop: 0, offsetLeft: 0, width: 390, height: 844 }, svh, layout),
  { top: 0, left: 0, width: 390, height: 844, inset: false },
  'visual viewport matches 100svh',
);

eq(
  visibleAppView({ offsetTop: 0, offsetLeft: 0, width: 390, height: 844.4 }, svh, layout),
  { top: 0, left: 0, width: 390, height: 844, inset: false },
  'subpixel slack is not an inset',
);

// Mobile Safari hides its URL bar: visual viewport grows past 100svh.
eq(
  visibleAppView({ offsetTop: 0, offsetLeft: 0, width: 390, height: 920 }, svh, layout),
  { top: 0, left: 0, width: 390, height: 844, inset: false },
  'taller visual viewport keeps 100svh',
);

// X in-app tweet sheet (or remaining URL chrome) eats the bottom of the webview.
const tweet = visibleAppView({ offsetTop: 0, offsetLeft: 0, width: 390, height: 520 }, svh, layout);
eq(tweet, { top: 0, left: 0, width: 390, height: 520, inset: true }, 'tweet sheet shortens the stage');

const dismissed = visibleAppView({ offsetTop: 0, offsetLeft: 0, width: 390, height: 720 }, svh, layout);
eq(dismissed, { top: 0, left: 0, width: 390, height: 720, inset: true }, 'remaining chrome after the tweet is dismissed');

const offset = visibleAppView({ offsetTop: 80, offsetLeft: 0, width: 390, height: 764 }, svh, layout);
eq(offset, { top: 80, left: 0, width: 390, height: 764, inset: true }, 'offset visual viewport is pinned');

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('viewport-layout: ok');
