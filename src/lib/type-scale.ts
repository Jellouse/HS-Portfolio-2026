export const typeScale = {
  text: '23px',
  lh: '29px',
  'text-lead': '28px',
  'lh-lead': '35px',
  'text-ui': '16px',
  'lh-ui': '22px',
  'text-meta': '13px',
  'lh-meta': '16px',
  'text-fine': '11px',
  'lh-fine': '14px',
  'lh-snug': '20px',
  track: '-0.02em',
  'track-none': '0px',
} as const;

export const typePx = (token: keyof typeof typeScale) => Number.parseInt(typeScale[token], 10);
