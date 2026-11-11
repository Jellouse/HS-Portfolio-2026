// The phone intro face, drawn on the GPU.
//
// The SVG filter on the face (turbulence, displacement, blur, alpha cut) is
// re-rasterised by the browser every time the intro changes its size,
// displacement or blur, over a filter region far larger than the screen. On an
// iPhone that runs on the CPU and drops most frames. Here the same filter runs
// as shaders: the turbulence is baked once by the browser's own feTurbulence,
// and each frame only moves numbers. Everything is computed in the face's own
// viewBox units, so the picture matches the filter at full device resolution.

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
  if(uv.x<0.||uv.y<0.||uv.x>1.||uv.y>1.)return 0.;
  return texture2D(mask,uv).a;
}
void main(){
  vec2 d=roi.xy+v*roi.zw;
  float a=at(d+vec2(-tap.x,-tap.y))+at(d+vec2(tap.x,-tap.y))+at(d+vec2(-tap.x,tap.y))+at(d+vec2(tap.x,tap.y));
  gl_FragColor=vec4(a*.25,0.,0.,1.);
}`;

// Separable Gaussian with paired linear taps.
const BLUR = `precision highp float;varying vec2 v;
uniform sampler2D tex;uniform vec2 dir,cover;uniform float sigma;
void main(){
  vec2 c=v*cover;
  float r=ceil(sigma*3.),s=texture2D(tex,c).r,w=1.;
  for(int j=0;j<16;j++){
    float i=float(j)*2.+1.;if(i>r)break;
    float k1=exp(-i*i/(2.*sigma*sigma)),k2=exp(-(i+1.)*(i+1.)/(2.*sigma*sigma)),k=k1+k2,o=i+k2/k;
    s+=k*(texture2D(tex,c+dir*o).r+texture2D(tex,c-dir*o).r);w+=2.*k;
  }
  gl_FragColor=vec4(s/w,0.,0.,1.);
}`;

// Alpha cut and flood, at device resolution.
const CUT = `precision highp float;varying vec2 v;
uniform sampler2D tex;uniform vec4 roi;uniform vec2 size,cover;uniform vec3 colour;uniform float cut;
void main(){
  vec2 d=vec2(v.x,1.-v.y)*size;
  float a=step(cut,texture2D(tex,(d-roi.xy)/roi.zw*cover).r);
  gl_FragColor=vec4(colour*a,a);
}`;

/** Field pixels per sigma. Below this the blur runs at device resolution. */
const FIELD_SIGMA = 4;
/** Noise texels per viewBox unit. The noise is smooth at this scale. */
const NOISE_RES = 2;
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
};

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

function texture(gl: WebGLRenderingContext, source: TexImageSource | null, w = 0, h = 0) {
  const t = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  if (source) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
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
 * Bake the face's own feTurbulence once, over the region the intro can reach.
 * Red and green are the displacement channels. Blue carries the noise alpha:
 * the browser keeps the noise premultiplied in 8 bits, and the shader repeats
 * that rounding so the edge grain matches the filter.
 */
async function bakeNoise(turb: SVGFETurbulenceElement, region: number[]) {
  const nw = Math.round(region[2] * NOISE_RES);
  const nh = Math.round(region[3] * NOISE_RES);
  const freq = turb.getAttribute('baseFrequency') || '0.015';
  const octaves = turb.getAttribute('numOctaves') || '1';
  const seed = turb.getAttribute('seed') || '0';
  const type = turb.getAttribute('type') || 'turbulence';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${nw}" height="${nh}" viewBox="${region.join(' ')}"><filter id="n" x="${region[0]}" y="${region[1]}" width="${region[2]}" height="${region[3]}" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feTurbulence type="${type}" baseFrequency="${freq}" numOctaves="${octaves}" seed="${seed}"/><feColorMatrix type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 0 1 0 0 0 0 0 1"/></filter><rect x="${region[0]}" y="${region[1]}" width="${region[2]}" height="${region[3]}" filter="url(#n)"/></svg>`;
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  await img.decode();
  const c = document.createElement('canvas');
  c.width = nw;
  c.height = nh;
  c.getContext('2d')!.drawImage(img, 0, 0, nw, nh);
  return c;
}

/**
 * Mount the GPU face over `host`. `maxW` / `maxH` are the largest face box the
 * intro lays out (CSS px), which sets the source resolution. Resolves null when
 * WebGL or the noise bake is not available, and the SVG filter stays in charge.
 */
export async function mountFaceGL(svg: SVGSVGElement, host: HTMLElement, maxW: number, maxH: number, maxDisp: number, maxBlur: number): Promise<FaceGL | null> {
  const group = svg.querySelector<SVGGElement>('g[filter]');
  const turb = svg.querySelector<SVGFETurbulenceElement>('feTurbulence');
  if (!group || !turb) return null;
  const vb = svg.viewBox.baseVal;
  if (!vb || !vb.width || !vb.height) return null;

  const canvas = document.createElement('canvas');
  canvas.className = 'arrow-face-gl';
  canvas.setAttribute('aria-hidden', 'true');
  const gl = canvas.getContext('webgl', { premultipliedAlpha: true, antialias: false, alpha: true, depth: false, stencil: false, preserveDrawingBuffer: false });
  if (!gl) return null;

  const offsetEl = svg.querySelector('feOffset');
  const off = [num(offsetEl, 'dx', 0), num(offsetEl, 'dy', 0)];
  const table = (svg.querySelector('feFuncA')?.getAttribute('tableValues') || '0 0 1 1 1 1 1 1').trim().split(/\s+/);
  const cut = Math.max(0, table.indexOf('1')) / table.length;
  const rgb = parseColour(getComputedStyle(svg).color);

  // Everything the displaced, blurred face can touch, in viewBox units.
  const reach = maxDisp / 2 + maxBlur * 3 + 2;
  const nreg = [vb.x - reach, vb.y - reach, vb.width + 2 * reach, vb.height + 2 * reach];
  let noiseCanvas: HTMLCanvasElement;
  try {
    noiseCanvas = await bakeNoise(turb, nreg);
  } catch {
    return null;
  }

  // Source alpha at the largest device scale the intro shows.
  const dpr = window.devicePixelRatio || 1;
  const maxTex = Math.min(4096, gl.getParameter(gl.MAX_TEXTURE_SIZE) as number);
  const mreg = [vb.x - MASK_PAD, vb.y - MASK_PAD, vb.width + 2 * MASK_PAD, vb.height + 2 * MASK_PAD];
  const unitPx = Math.max(maxW / vb.width, maxH / vb.height) * dpr;
  const mw = Math.max(64, Math.min(maxTex, Math.ceil(mreg[2] * unitPx)));
  const mh = Math.max(64, Math.min(maxTex, Math.ceil(mreg[3] * unitPx)));
  const mc = document.createElement('canvas');
  mc.width = mw;
  mc.height = mh;
  const ctx = mc.getContext('2d')!;
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
  } catch {
    return null;
  }
  let maskTex: WebGLTexture;
  let noiseTex: WebGLTexture;
  try {
    maskTex = texture(gl, mc);
    noiseTex = texture(gl, noiseCanvas);
  } catch {
    return null;
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
  let a: Target | null = null;
  let b: Target | null = null;
  const size = () => {
    const nextW = host.clientWidth;
    const nextH = host.clientHeight;
    if (nextW === cssW && nextH === cssH && a) return;
    cssW = nextW;
    cssH = nextH;
    W = Math.max(1, Math.round(cssW * dpr));
    H = Math.max(1, Math.round(cssH * dpr));
    canvas.width = W;
    canvas.height = H;
    drop(a);
    drop(b);
    a = target(W, H);
    b = target(W, H);
  };
  host.appendChild(canvas);
  size();
  let dirty = false;
  const ro = new ResizeObserver(() => {
    dirty = true;
  });
  ro.observe(host);

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
    if (dirty) {
      dirty = false;
      size();
    }
    if (!a || !b) return;
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
    gl.disable(gl.SCISSOR_TEST);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (x1 <= x0 || y1 <= y0) return;
    const roi = [x0, y0, x1 - x0, y1 - y0];

    // The blur is band-limited, so the field it blurs only needs FIELD_SIGMA
    // pixels per sigma. The cut below runs at device resolution.
    const sx = boxSigma(blur * ax);
    const sy = boxSigma(blur * ay);
    const fx = Math.max(1, sx / FIELD_SIGMA);
    const fy = Math.max(1, sy / FIELD_SIGMA);
    const lw = Math.max(1, Math.min(W, Math.ceil(roi[2] / fx)));
    const lh = Math.max(1, Math.min(H, Math.ceil(roi[3] / fy)));
    const cover = [lw / W, lh / H];
    const stepX = roi[2] / lw;
    const stepY = roi[3] / lh;

    gl.viewport(0, 0, lw, lh);
    gl.bindFramebuffer(gl.FRAMEBUFFER, a.fb);
    gl.useProgram(pDisp);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, maskTex);
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
      gl.activeTexture(gl.TEXTURE0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, b.fb);
      gl.bindTexture(gl.TEXTURE_2D, a.t);
      gl.uniform1f(u(pBlur, 'sigma'), Math.max(0.01, sx / stepX));
      gl.uniform2f(u(pBlur, 'dir'), 1 / W, 0);
      quad(pBlur);
      gl.bindFramebuffer(gl.FRAMEBUFFER, a.fb);
      gl.bindTexture(gl.TEXTURE_2D, b.t);
      gl.uniform1f(u(pBlur, 'sigma'), Math.max(0.01, sy / stepY));
      gl.uniform2f(u(pBlur, 'dir'), 0, 1 / H);
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
    gl.uniform3f(u(pCut, 'colour'), rgb[0], rgb[1], rgb[2]);
    gl.uniform1f(u(pCut, 'cut'), cut);
    quad(pCut);
    gl.disable(gl.SCISSOR_TEST);
  };

  const destroy = () => {
    ro.disconnect();
    canvas.remove();
    drop(a);
    drop(b);
    a = null;
    b = null;
    gl.deleteTexture(maskTex);
    gl.deleteTexture(noiseTex);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  };

  return { canvas, draw, destroy };
}
