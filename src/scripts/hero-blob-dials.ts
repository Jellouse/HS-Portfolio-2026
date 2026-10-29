

import { heroBlobDrift } from './hero-blob';

export type HeroBlobDialValues = {
  baseFrequency: number;
  scale: number;
  blur: number;
  threshold: number;
  octaves: number;
  seed: number;
  driftMax: number;
  driftEase: number;
  colour: string;
};

const DEFAULTS: HeroBlobDialValues = {
  baseFrequency: 0.015,
  scale: 111,
  blur: 2.2,
  threshold: 2,
  octaves: 2,
  seed: 48,
  driftMax: 104,
  driftEase: 0.04,
  colour: '#B70606',
};

function thresholdTable(cut: number): string {
  const n = 8;
  const c = Math.max(0, Math.min(n - 1, Math.round(cut)));
  return Array.from({ length: n }, (_, i) => (i < c ? '0' : '1')).join(' ');
}

function apply(values: HeroBlobDialValues, root: ParentNode) {
  const svg = root.querySelector<SVGElement>('[data-hero-blob]');
  if (!svg) return;
  const turb = svg.querySelector('feTurbulence');
  const disp = svg.querySelector('feDisplacementMap');
  const blur = svg.querySelector('feGaussianBlur');
  const funcA = svg.querySelector('feFuncA');
  const flood = svg.querySelector('feFlood');
  const fills = svg.querySelectorAll('g[filter] path, g[filter] ellipse');

  turb?.setAttribute('baseFrequency', String(values.baseFrequency));
  turb?.setAttribute('numOctaves', String(Math.round(values.octaves)));
  turb?.setAttribute('seed', String(Math.round(values.seed)));
  disp?.setAttribute('scale', String(values.scale));
  blur?.setAttribute('stdDeviation', String(values.blur));
  funcA?.setAttribute('tableValues', thresholdTable(values.threshold));
  flood?.setAttribute('flood-color', values.colour);
  fills.forEach((el) => el.setAttribute('fill', values.colour));

  heroBlobDrift.max = values.driftMax;
  heroBlobDrift.ease = values.driftEase;
}

function row(
  panel: HTMLElement,
  label: string,
  key: keyof HeroBlobDialValues,
  min: number,
  max: number,
  step: number,
  values: HeroBlobDialValues,
  onChange: () => void,
  kind: 'range' | 'color' = 'range',
) {
  const wrap = document.createElement('label');
  wrap.className = 'hero-dials__row';
  const name = document.createElement('span');
  name.className = 'hero-dials__label';
  name.textContent = label;
  const input = document.createElement('input');
  input.className = 'hero-dials__input';
  if (kind === 'color') {
    input.type = 'color';
    input.value = String(values[key]);
  } else {
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(values[key]);
  }
  const read = document.createElement('span');
  read.className = 'hero-dials__value';
  const paintRead = () => {
    const v = values[key];
    read.textContent = typeof v === 'number' ? (Number.isInteger(step) ? String(v) : v.toFixed(step < 0.01 ? 4 : 2)) : String(v);
  };
  paintRead();
  input.addEventListener('input', () => {
    if (kind === 'color') {
      (values as { colour: string }).colour = input.value;
    } else {
      (values as Record<string, number | string>)[key] = parseFloat(input.value);
    }
    paintRead();
    onChange();
  });
  wrap.append(name, input, read);
  panel.append(wrap);
}

export function initHeroBlobDials(root: ParentNode = document) {
  if (!new URLSearchParams(location.search).has('dials')) return;

  const values: HeroBlobDialValues = { ...DEFAULTS };
  apply(values, root);

  const panel = document.createElement('aside');
  panel.className = 'hero-dials';
  panel.setAttribute('aria-label', 'Hero blob dials');

  const title = document.createElement('div');
  title.className = 'hero-dials__title';
  title.textContent = 'Blob dials';
  panel.append(title);

  const refresh = () => apply(values, root);

  row(panel, 'Grain', 'baseFrequency', 0.004, 0.08, 0.001, values, refresh);
  row(panel, 'Spill', 'scale', 0, 160, 1, values, refresh);
  row(panel, 'Smooth', 'blur', 0, 8, 0.1, values, refresh);
  row(panel, 'Thresh', 'threshold', 0, 7, 1, values, refresh);
  row(panel, 'Octaves', 'octaves', 1, 5, 1, values, refresh);
  row(panel, 'Seed', 'seed', 0, 99, 1, values, refresh);
  row(panel, 'Drift str', 'driftMax', 0, 120, 1, values, refresh);
  row(panel, 'Drift spd', 'driftEase', 0.005, 0.2, 0.005, values, refresh);
  row(panel, 'Colour', 'colour', 0, 0, 0, values, refresh, 'color');

  const actions = document.createElement('div');
  actions.className = 'hero-dials__actions';
  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'hero-dials__btn';
  copyBtn.textContent = 'Copy values';
  copyBtn.addEventListener('click', async () => {
    const payload = JSON.stringify(values, null, 2);
    try {
      await navigator.clipboard.writeText(payload);
      copyBtn.textContent = 'Copied';
      setTimeout(() => {
        copyBtn.textContent = 'Copy values';
      }, 1200);
    } catch {
      copyBtn.textContent = 'Copy failed';
      setTimeout(() => {
        copyBtn.textContent = 'Copy values';
      }, 1200);
    }
  });
  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'hero-dials__btn';
  resetBtn.textContent = 'Reset';
  resetBtn.addEventListener('click', () => {
    Object.assign(values, DEFAULTS);
    panel.querySelectorAll<HTMLInputElement>('.hero-dials__input').forEach((input) => {
      const label = input.closest('.hero-dials__row')?.querySelector('.hero-dials__label')?.textContent;
      const map: Record<string, keyof HeroBlobDialValues> = {
        Grain: 'baseFrequency',
        Spill: 'scale',
        Smooth: 'blur',
        Thresh: 'threshold',
        Octaves: 'octaves',
        Seed: 'seed',
        'Drift str': 'driftMax',
        'Drift spd': 'driftEase',
        Colour: 'colour',
      };
      const key = label ? map[label] : undefined;
      if (!key) return;
      input.value = String(values[key]);
      const read = input.parentElement?.querySelector('.hero-dials__value');
      if (read) {
        const v = values[key];
        read.textContent = typeof v === 'number' ? String(v) : v;
      }
    });
    refresh();
  });
  actions.append(copyBtn, resetBtn);
  panel.append(actions);
  document.body.append(panel);
}
