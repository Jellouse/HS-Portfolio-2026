// The phone intro face, drawn on the GPU.
//
// The SVG filter on the face (turbulence, displacement, blur, alpha cut) is
// re-rasterised by the browser every time the intro changes its size,
// displacement or blur, over a filter region far larger than the screen. On an
// iPhone that runs on the CPU and drops most frames. Here the same filter runs
// as shaders: the turbulence is computed once in JS with the spec's own
// algorithm (turbulence.ts), and each frame only moves numbers. Nothing waits
// on the browser rasterising an SVG, so it is ready in the same task. Everything is computed in the face's own
// viewBox units, so the picture matches the filter at full device resolution.

import { turbulenceParams, turbulenceTextureAsync } from './turbulence';

const VERT = `attribute vec2 a;varying vec2 v;void main(){v=a*.5+.5;gl_Position=vec4(a,0.,1.);}`;

// Displaced source alpha, in the low-res field. 2x2 taps per field pixel.
const DISPLACE = `precision highp float;varying vec2 v;
uniform sampler2D mask,noise;uniform vec4 roi,mreg,nreg,face;uniform vec2 off,tap;uniform float disp;
float at(vec2 d){
  vec2 p=(d-face.xy)/face.zw;
  vec3 t=texture2D(noise,(p-off-nreg.xy)/nreg.zw).rgb;
  float k=max(t.b,1./255.)*255.;
  vec2 n=floor(t.rg*k+.5)/k;
  vec2 uv=(p+disp*(n-.5)-mreg.xy)/mreg.zw;
  // No early return before the read: the mask is mipmapped, and a texture
  // read after a branch some pixels of a 2x2 quad skipped has undefined
  // derivatives. Apple GPUs then pick a coarse mip on the pixels next to
  // uv = 0, and a faint 1px line showed beside the face. The mask edge is
  // transparent (MASK_PAD) and clamped, so outside reads are 0 anyway.
  vec2 inside=step(vec2(0.),uv)*step(uv,vec2(1.));
  return texture2D(mask,uv).a*inside.x*inside.y;
}
void main(){
  vec2 d=roi.xy+v*roi.zw;
  float a=at(d+vec2(-tap.x,-tap.y))+at(d+vec2(tap.x,-tap.y))+at(d+vec2(-tap.x,tap.y))+at(d+vec2(tap.x,tap.y));
  gl_FragColor=vec4(a*.25,0.,0.,1.);
}`;

// Separable Gaussian with paired linear taps.
const BLUR = `precision highp float;varying vec2 v;
uniform sampler2D tex;uniform vec2 dir,cover,lim;uniform float sigma;
// lim: the last written texel centre. The field targets are reused at their
// largest size, so texels past it hold an earlier, larger frame.
void main(){
  vec2 c=v*cover;
  float r=ceil(sigma*3.),s=texture2D(tex,c).r,w=1.;
  for(int j=0;j<32;j++){
    float i=float(j)*2.+1.;if(i>r)break;
    float k1=exp(-i*i/(2.*sigma*sigma)),k2=exp(-(i+1.)*(i+1.)/(2.*sigma*sigma)),k=k1+k2,o=i+k2/k;
    s+=k*(texture2D(tex,min(c+dir*o,lim)).r+texture2D(tex,c-dir*o).r);w+=2.*k;
  }
  gl_FragColor=vec4(s/w,0.,0.,1.);
}`;

// Alpha cut and flood, at device resolution. The SVG table is a hard cut;
// a 1-pixel ramp here keeps that threshold without stair-stepped edges.
const CUT = `#extension GL_OES_standard_derivatives : enable
precision highp float;varying vec2 v;
uniform sampler2D tex;uniform vec4 roi;uniform vec2 size,cover,lim;uniform vec3 colour;uniform float cut;
void main(){
  vec2 d=vec2(v.x,1.-v.y)*size;
  float s=texture2D(tex,min((d-roi.xy)/roi.zw*cover,lim)).r;
  float a=clamp((s-cut)/max(fwidth(s),1e-6)+.5,0.,1.);
  gl_FragColor=vec4(colour*a,a);
}`;

/** Field pixels per sigma. Below this the blur runs at device resolution.
 *  6 keeps the goo outline sharper than the cheap default of 4, without
 *  dropping the intro under 50 fps. */
const FIELD_SIGMA = 6;
/** Default noise texels per viewBox unit. Raised at mount to match the
 *  largest intro scale, so the grain stays as fine as the SVG filter. */
const NOISE_RES = 2;
const NOISE_RES_MAX = 8;
const NOISE_MAX_SIDE = 2048;
const MASK_PAD = 2;

export type FaceFrame = {
  /** Face box in CSS px, as laid out (width, height). */
  w: number;
  h: number;
  /** feDisplacementMap scale and feGaussianBlur stdDeviation, in viewBox units. */
  disp: number;
  blur: number;
};

export type FaceGL = {
  canvas: HTMLCanvasElement;
  draw: (frame: FaceFrame) => void;
  destroy: () => void;
  /** ms spent mounting (noise, mask, shaders, first upload). */
  setupMs: number;
  renderer: string;
};

export type FaceMount = { gl: FaceGL; reason?: undefined } | { gl: null; reason: string };

const num = (el: Element | null, name: string, fallback: number) => {
  const n = parseFloat(el?.getAttribute(name) ?? '');
  return Number.isFinite(n) ? n : fallback;
};

function compile(gl: WebGLRenderingContext, fs: string) {
  const mk = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
    return s;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, mk(gl.VERTEX_SHADER, VERT));
  gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
  // A fixed attribute slot, so no frame has to ask the GPU where it is.
  gl.bindAttribLocation(p, 0, 'a');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link');
  return p;
}

function texture(gl: WebGLRenderingContext, source: TexImageSource | null, w = 0, h = 0, data: ArrayBufferView | null = null, mips = false) {
  const t = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  if (source) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  if (mips) gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

/**
 * The sigma, in device px, that the browser's feGaussianBlur actually spreads.
 * Above 2px the SVG spec (and WebKit and Chromium) run three box blurs of size
 * d instead of a true Gaussian. A Gaussian with the same variance matches it.
 */
export function boxSigma(sigma: number) {
  if (sigma < 2) return sigma;
  const d = Math.floor(sigma * 3 * Math.sqrt(2 * Math.PI) / 4 + 0.5);
  const variance = d % 2 ? (3 * (d * d - 1)) / 12 : (2 * (d * d - 1) + ((d + 1) * (d + 1) - 1)) / 12;
  return Math.sqrt(variance);
}

function parseColour(css: string) {
  const nums = css.match(/[\d.]+/g);
  if (nums && nums.length >= 3) return nums.slice(0, 3).map((n) => Number(n) / 255);
  return [0xb7 / 255, 0x06 / 255, 0x06 / 255];
}

/**
 * Mount the GPU face over `host`, synchronously. `maxW` / `maxH` are the
 * largest face box the intro lays out (CSS px), which sets the source
 * resolution. When it cannot run, it says why and the SVG filter stays in charge.
 */
export async function mountFaceGL(svg: SVGSVGElement, host: HTMLElement, maxW: number, maxH: number, maxDisp: number, maxBlur: number): Promise<FaceMount> {
  const t0 = performance.now();
  const fail = (reason: string): FaceMount => ({ gl: null, reason });
  const group = svg.querySelector<SVGGElement>('g[filter]');
  const turb = svg.querySelector<SVGFETurbulenceElement>('feTurbulence');
  if (!group || !turb) return fail('no-filter');
  if ((turb.getAttribute('stitchTiles') || 'noStitch') !== 'noStitch') return fail('stitch-tiles');
  const vb = svg.viewBox.baseVal;
  if (!vb || !vb.width || !vb.height) return fail('no-viewbox');

  const canvas = document.createElement('canvas');
  canvas.className = 'arrow-face-gl';
  canvas.setAttribute('aria-hidden', 'true');
  let gl: WebGLRenderingContext | null = null;
  try {
    gl = canvas.getContext('webgl', { premultipliedAlpha: true, antialias: false, alpha: true, depth: false, stencil: false, preserveDrawingBuffer: false });
  } catch {
    gl = null;
  }
  if (!gl) return fail('no-webgl');
  if (gl.isContextLost()) return fail('context-lost');
  // Needed for fwidth() in the cut shader, so the outline can be antialiased.
  if (!gl.getExtension('OES_standard_derivatives')) return fail('no-derivatives');

  const offsetEl = svg.querySelector('feOffset');
  const off = [num(offsetEl, 'dx', 0), num(offsetEl, 'dy', 0)];
  const table = (svg.querySelector('feFuncA')?.getAttribute('tableValues') || '0 0 1 1 1 1 1 1').trim().split(/\s+/);
  const cut = Math.max(0, table.indexOf('1')) / table.length;
  const rgb = parseColour(getComputedStyle(svg).color);

  // Everything the displaced, blurred face can touch, in viewBox units.
  const reach = maxDisp / 2 + maxBlur * 3 + 2;
  const nreg = [vb.x - reach, vb.y - reach, vb.width + 2 * reach, vb.height + 2 * reach];
  const native = window.devicePixelRatio || 1;
  const phone = typeof matchMedia === 'function' && matchMedia('(max-width: 759px)').matches;
  const dprCap = Math.min(native, phone ? 3 : 2);
  const unitGuess = Math.max(maxW / vb.width, maxH / vb.height) * dprCap;
  // Keep the noise texture inside what every GPU takes (and a bounded CPU
  // build): no side longer than NOISE_MAX_SIDE or MAX_TEXTURE_SIZE.
  const noiseSide = Math.min(NOISE_MAX_SIDE, gl.getParameter(gl.MAX_TEXTURE_SIZE) as number);
  const noiseFit = Math.max(1, Math.floor(noiseSide / Math.max(nreg[2], nreg[3])));
  const noiseRes = Math.min(noiseFit, Math.max(NOISE_RES, Math.min(NOISE_RES_MAX, Math.round(unitGuess / 2))));
  const noise = await turbulenceTextureAsync(turbulenceParams(turb), nreg, noiseRes);
  if (gl.isContextLost()) return fail('context-lost');

  const padCssX = (maxDisp / 2 + maxBlur * 3 + 2) * (maxW / vb.width);
  const padCssY = (maxDisp / 2 + maxBlur * 3 + 2) * (maxH / vb.height);
  const boxW = Math.max(1, Math.ceil(maxW + 2 * padCssX));
  const boxH = Math.max(1, Math.ceil(maxH + 2 * padCssY));
  // Device px per CSS px for a canvas of this CSS size. Phones stay at native
  // sharpness (up to 3x). On desktop a canvas as large as the screen is capped
  // to about one device px per screen px, so the 7x-wide face does not run a
  // multi-megapixel cut every frame. The canvas shrinks with the face (see
  // fit() below), so once the face is small it is drawn at native dpr again:
  // a fixed 1x canvas showed the small face as pixels on a retina screen.
  const budget = Math.max(1280 * 720, (window.innerWidth || boxW) * (window.innerHeight || boxH));
  const dprFor = (w: number, h: number) => {
    if (phone) return dprCap;
    const area = Math.max(1, w * h);
    return area * dprCap * dprCap > budget ? Math.min(dprCap, Math.max(1, Math.sqrt(budget / area))) : dprCap;
  };
  let dpr = dprFor(Math.min(boxW, (window.innerWidth || boxW) + 4), Math.min(boxH, (window.innerHeight || boxH) + 4));

  // Source alpha at the largest device scale the intro shows.
  const maxTex = Math.min(4096, gl.getParameter(gl.MAX_TEXTURE_SIZE) as number);
  const mreg = [vb.x - MASK_PAD, vb.y - MASK_PAD, vb.width + 2 * MASK_PAD, vb.height + 2 * MASK_PAD];
  // At half the intro size the canvas is small enough for native dpr, so the
  // mask holds at least that much detail as well as the largest frame's.
  const unitPx = Math.max(maxW / vb.width, maxH / vb.height) * Math.max(dpr, dprCap / 2);
  // Power-of-two sides, so WebGL 1 can mipmap it. The mask is drawn at the
  // largest intro scale; once the face is small it is sampled at a fraction of
  // that, and without mips each tap lands on a hard 0 or 1 texel: the small
  // face's outline came out in stair steps.
  const pot = (n: number) => Math.min(maxTex, 2 ** Math.ceil(Math.log2(Math.max(64, n))));
  const mw = pot(mreg[2] * unitPx);
  const mh = pot(mreg[3] * unitPx);
  const mc = document.createElement('canvas');
  mc.width = mw;
  mc.height = mh;
  const ctx = mc.getContext('2d');
  if (!ctx) return fail('no-2d-canvas');
  ctx.setTransform(mw / mreg[2], 0, 0, mh / mreg[3], (-mreg[0] * mw) / mreg[2], (-mreg[1] * mh) / mreg[3]);
  ctx.fillStyle = 'black';
  group.querySelectorAll('path, ellipse, circle').forEach((el) => {
    if (el instanceof SVGPathElement) {
      ctx.fill(new Path2D(el.getAttribute('d') || ''), (el.getAttribute('fill-rule') as CanvasFillRule) || 'nonzero');
    } else {
      ctx.beginPath();
      const r = num(el, 'r', 0);
      ctx.ellipse(num(el, 'cx', 0), num(el, 'cy', 0), num(el, 'rx', r), num(el, 'ry', r), 0, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  let pDisp: WebGLProgram;
  let pBlur: WebGLProgram;
  let pCut: WebGLProgram;
  try {
    pDisp = compile(gl, DISPLACE);
    pBlur = compile(gl, BLUR);
    pCut = compile(gl, CUT);
  } catch (error) {
    return fail(`shader: ${(error as Error)?.message || error}`);
  }
  let maskTex: WebGLTexture;
  // The same mask, mipmapped. Only bound once the face is small enough that
  // the mask is shrunk on screen; mipmapped reads cost more, and the large
  // frames are where the budget is tight.
  let maskMip: WebGLTexture;
  let noiseTex: WebGLTexture;
  try {
    maskTex = texture(gl, mc);
    maskMip = texture(gl, mc, 0, 0, null, true);
    noiseTex = texture(gl, null, noise.w, noise.h, noise.data);
  } catch (error) {
    return fail(`texture: ${(error as Error)?.message || error}`);
  }
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

  type Target = { t: WebGLTexture; fb: WebGLFramebuffer };
  const target = (w: number, h: number): Target => {
    const t = texture(gl, null, w, h);
    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    return { t, fb };
  };
  const drop = (x: Target | null) => {
    if (!x) return;
    gl.deleteTexture(x.t);
    gl.deleteFramebuffer(x.fb);
  };

  let cssW = 0;
  let cssH = 0;
  let W = 0;
  let H = 0;
  let fboW = 0;
  let fboH = 0;
  let a: Target | null = null;
  let b: Target | null = null;
  let prevClear: number[] | null = null;
  const size = (nextW: number, nextH: number) => {
    if (cssW === nextW && cssH === nextH && W) return;
    cssW = nextW;
    cssH = nextH;
    dpr = dprFor(cssW, cssH);
    // Whole device px per CSS px where it can, so the canvas maps 1:1 onto
    // the screen and is not resampled.
    W = Math.max(1, Math.round(cssW * dpr));
    H = Math.max(1, Math.round(cssH * dpr));
    canvas.width = W;
    canvas.height = H;
    // A resized canvas starts transparent.
    prevClear = null;
    // Pin every side as a longhand. `inset` is a shorthand for
    // top/right/bottom/left, so setting it after left/top would clear them
    // and leave the canvas at the top of the slot (the stylesheet used to
    // say inset: 0). Combined with translate(-50%, -50%), the shrinking
    // face then sits at the top of the screen like a header logo.
    Object.assign(canvas.style, {
      position: 'absolute',
      left: '50%',
      top: '50%',
      right: 'auto',
      bottom: 'auto',
      width: `${cssW}px`,
      height: `${cssH}px`,
      transform: 'translate(-50%, -50%)',
      zIndex: '4',
      pointerEvents: 'none',
    });
  };
  const ensureField = (lw: number, lh: number) => {
    if (a && b && lw <= fboW && lh <= fboH) return;
    fboW = Math.max(fboW, lw);
    fboH = Math.max(fboH, lh);
    drop(a);
    drop(b);
    a = target(fboW, fboH);
    b = target(fboW, fboH);
  };
  // The canvas only needs to cover the face's current reach, and never more
  // than the screen around the slot centre. It steps down as the face
  // shrinks, so the few resizes are cheap and the dpr can climb back to native.
  const even = (n: number) => Math.max(2, 2 * Math.ceil(n / 2));
  const fit = (w: number, h: number, ext: number) => {
    const r = host.getBoundingClientRect();
    const vw = window.innerWidth || boxW;
    const vh = window.innerHeight || boxH;
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const capW = 2 * Math.max(cx, vw - cx) + 4;
    const capH = 2 * Math.max(cy, vh - cy) + 4;
    const needW = Math.min(boxW, capW, w * (1 + (2 * (ext + 1)) / vb.width));
    const needH = Math.min(boxH, capH, h * (1 + (2 * (ext + 1)) / vb.height));
    return [even(needW), even(needH)];
  };
  host.appendChild(canvas);
  {
    const [w0, h0] = fit(maxW, maxH, maxDisp / 2 + maxBlur * 3 + 1);
    size(w0, h0);
  }

  const uniforms = new Map<WebGLProgram, Map<string, WebGLUniformLocation | null>>();
  const u = (p: WebGLProgram, name: string) => {
    let m = uniforms.get(p);
    if (!m) uniforms.set(p, (m = new Map()));
    if (!m.has(name)) m.set(name, gl.getUniformLocation(p, name));
    return m.get(name)!;
  };
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const quad = (p: WebGLProgram) => {
    gl.useProgram(p);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };

  const draw = ({ w, h, disp, blur }: FaceFrame) => {
    if (!W) return;
    // Step the canvas down once the face needs well under its current size
    // (and up, should a frame ever need more).
    {
      const ext0 = disp / 2 + blur * 3 + 1;
      const needW = w * (1 + (2 * ext0) / vb.width);
      const needH = h * (1 + (2 * ext0) / vb.height);
      if (needW > cssW || needH > cssH || (needW < cssW * 0.7 && needH < cssH * 0.7)) {
        const [nw, nh] = fit(w, h, ext0);
        size(nw, nh);
      }
    }
    // Face box in device px. The face sits at the centre of the slot.
    const ax = (w / vb.width) * dpr;
    const ay = (h / vb.height) * dpr;
    const ox = ((cssW - w) / 2) * dpr - vb.x * ax;
    const oy = ((cssH - h) / 2) * dpr - vb.y * ay;
    const ext = disp / 2 + blur * 3 + 1;
    const x0 = Math.max(0, Math.floor(ox + (vb.x - ext) * ax));
    const y0 = Math.max(0, Math.floor(oy + (vb.y - ext) * ay));
    const x1 = Math.min(W, Math.ceil(ox + (vb.x + vb.width + ext) * ax));
    const y1 = Math.min(H, Math.ceil(oy + (vb.y + vb.height + ext) * ay));
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    if (x1 <= x0 || y1 <= y0) {
      if (prevClear) {
        gl.enable(gl.SCISSOR_TEST);
        gl.scissor(prevClear[0], prevClear[1], prevClear[2], prevClear[3]);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.disable(gl.SCISSOR_TEST);
        prevClear = null;
      }
      return;
    }
    const roi = [x0, y0, x1 - x0, y1 - y0];
    const clearY = H - y1;
    const clear = prevClear
      ? [
          Math.min(prevClear[0], x0),
          Math.min(prevClear[1], clearY),
          Math.max(prevClear[0] + prevClear[2], x1) - Math.min(prevClear[0], x0),
          Math.max(prevClear[1] + prevClear[3], H - y0) - Math.min(prevClear[1], clearY),
        ]
      : [x0, clearY, roi[2], roi[3]];
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(clear[0], clear[1], clear[2], clear[3]);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    // The scissor is in canvas pixels. Left on, it would also clip the field
    // passes below, which draw from (0, 0) into a smaller target: the field's
    // left and bottom edge kept stale texels (a hard vertical cut), and once
    // x0 passed the field width nothing was drawn and the face vanished.
    gl.disable(gl.SCISSOR_TEST);
    prevClear = [x0, clearY, roi[2], roi[3]];

    // The blur is band-limited, so the field it blurs only needs FIELD_SIGMA
    // pixels per sigma. The cut below runs at device resolution.
    const sx = boxSigma(blur * ax);
    const sy = boxSigma(blur * ay);
    const fx = Math.max(1, sx / FIELD_SIGMA);
    const fy = Math.max(1, sy / FIELD_SIGMA);
    const lw = Math.max(1, Math.min(W, Math.ceil(roi[2] / fx)));
    const lh = Math.max(1, Math.min(H, Math.ceil(roi[3] / fy)));
    ensureField(lw, lh);
    if (!a || !b) return;
    const cover = [lw / fboW, lh / fboH];
    const lim = [(lw - 0.5) / fboW, (lh - 0.5) / fboH];
    const stepX = roi[2] / lw;
    const stepY = roi[3] / lh;

    gl.viewport(0, 0, lw, lh);
    gl.bindFramebuffer(gl.FRAMEBUFFER, a.fb);
    gl.useProgram(pDisp);
    gl.activeTexture(gl.TEXTURE0);
    // Device px per mask texel. Well below one, plain reads skip texels and
    // the outline steps. While the field is coarser than the screen (a wide
    // blur) the blur hides that, so only the sharp, small face needs mips.
    const pxPerTexel = Math.min(ax * (mreg[2] / mw), ay * (mreg[3] / mh));
    gl.bindTexture(gl.TEXTURE_2D, fx === 1 && fy === 1 && pxPerTexel < 0.75 ? maskMip : maskTex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, noiseTex);
    gl.uniform1i(u(pDisp, 'mask'), 0);
    gl.uniform1i(u(pDisp, 'noise'), 1);
    gl.uniform4f(u(pDisp, 'roi'), roi[0], roi[1], roi[2], roi[3]);
    gl.uniform4f(u(pDisp, 'mreg'), mreg[0], mreg[1], mreg[2], mreg[3]);
    gl.uniform4f(u(pDisp, 'nreg'), nreg[0], nreg[1], nreg[2], nreg[3]);
    gl.uniform4f(u(pDisp, 'face'), ox, oy, ax, ay);
    gl.uniform2f(u(pDisp, 'off'), off[0], off[1]);
    gl.uniform2f(u(pDisp, 'tap'), stepX * 0.25, stepY * 0.25);
    gl.uniform1f(u(pDisp, 'disp'), disp);
    quad(pDisp);

    let field = a;
    if (sx > 0.05 || sy > 0.05) {
      gl.useProgram(pBlur);
      gl.uniform1i(u(pBlur, 'tex'), 0);
      gl.uniform2f(u(pBlur, 'cover'), cover[0], cover[1]);
      gl.uniform2f(u(pBlur, 'lim'), lim[0], lim[1]);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, b.fb);
      gl.bindTexture(gl.TEXTURE_2D, a.t);
      gl.uniform1f(u(pBlur, 'sigma'), Math.max(0.01, sx / stepX));
      gl.uniform2f(u(pBlur, 'dir'), 1 / fboW, 0);
      quad(pBlur);
      gl.bindFramebuffer(gl.FRAMEBUFFER, a.fb);
      gl.bindTexture(gl.TEXTURE_2D, b.t);
      gl.uniform1f(u(pBlur, 'sigma'), Math.max(0.01, sy / stepY));
      gl.uniform2f(u(pBlur, 'dir'), 0, 1 / fboH);
      quad(pBlur);
      field = a;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(roi[0], H - roi[1] - roi[3], roi[2], roi[3]);
    gl.useProgram(pCut);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, field.t);
    gl.uniform1i(u(pCut, 'tex'), 0);
    gl.uniform4f(u(pCut, 'roi'), roi[0], roi[1], roi[2], roi[3]);
    gl.uniform2f(u(pCut, 'size'), W, H);
    gl.uniform2f(u(pCut, 'cover'), cover[0], cover[1]);
    gl.uniform2f(u(pCut, 'lim'), lim[0], lim[1]);
    gl.uniform3f(u(pCut, 'colour'), rgb[0], rgb[1], rgb[2]);
    gl.uniform1f(u(pCut, 'cut'), cut);
    quad(pCut);
    gl.disable(gl.SCISSOR_TEST);
  };

  const destroy = () => {
    canvas.remove();
    drop(a);
    drop(b);
    a = null;
    b = null;
    gl.deleteTexture(maskTex);
    gl.deleteTexture(maskMip);
    gl.deleteTexture(noiseTex);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  };

  if (gl.getError() === gl.OUT_OF_MEMORY) {
    destroy();
    return fail('out-of-memory');
  }
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = String((info && gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) || gl.getParameter(gl.RENDERER) || '');
  return { gl: { canvas, draw, destroy, setupMs: performance.now() - t0, renderer } };
}
