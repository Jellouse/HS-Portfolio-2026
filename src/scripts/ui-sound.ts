// Snick, the button click from bencho.dev/sounds. Synthesised, same notes pdepablo.com uses.

type Note = {
  hz: number;
  to?: number;
  glide?: number;
  ms: number;
  gain: number;
  atk: number;
  at?: number;
  noise?: BiquadFilterType;
  q?: number;
};

const snick: Note[] = [
  { hz: 4800, ms: 7, gain: 0.14, noise: 'bandpass', q: 8, atk: 1 },
  { hz: 3240, ms: 7, gain: 0.069, noise: 'bandpass', q: 2, atk: 1 },
  { hz: 1120, to: 700, glide: 18, ms: 21, gain: 0.023, atk: 1 },
  { hz: 4800, ms: 7, gain: 0.035, noise: 'bandpass', q: 8, atk: 1, at: 90 },
];

let ac: AudioContext | null = null;
let noise: AudioBuffer | null = null;

const wake = () => {
  const Ctx = window.AudioContext;
  if (!Ctx) return null;
  if (!ac) {
    ac = new Ctx();
    noise = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  if (ac.state !== 'running') ac.resume().catch(() => {});
  return ac;
};

export const playSnick = () => {
  if (!wake() || !ac || !noise) return;
  const base = ac.currentTime + 0.005;
  for (const note of snick) {
    const t0 = base + (note.at || 0) / 1000;
    const t1 = t0 + note.ms / 1000;
    const glide = note.glide ? t0 + note.glide / 1000 : t1;
    let head: AudioNode;
    let src: AudioBufferSourceNode | OscillatorNode;
    if (note.noise) {
      const buffer = ac.createBufferSource();
      buffer.buffer = noise;
      buffer.loop = true;
      const filter = ac.createBiquadFilter();
      filter.type = note.noise;
      filter.frequency.setValueAtTime(note.hz, t0);
      if (note.to) filter.frequency.exponentialRampToValueAtTime(note.to, glide);
      if (note.q !== undefined) filter.Q.value = note.q;
      buffer.connect(filter);
      src = buffer;
      head = filter;
    } else {
      const osc = ac.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(note.hz, t0);
      if (note.to) osc.frequency.exponentialRampToValueAtTime(note.to, glide);
      src = osc;
      head = osc;
    }
    const gain = ac.createGain();
    const attack = Math.min(note.atk / 1000, (note.ms / 1000) * 0.6);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(note.gain, t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t1);
    head.connect(gain).connect(ac.destination);
    if (src instanceof AudioBufferSourceNode) src.start(t0, Math.random() * 1.5);
    else src.start(t0);
    src.stop(t1 + 0.02);
  }
};
