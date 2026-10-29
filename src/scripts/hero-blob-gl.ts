// Touch devices: the hero blob drawn on the GPU instead of through the live SVG filter.
//
// Why: the SVG filter (feTurbulence → feOffset → feDisplacementMap → blur → alpha cut) is
// re-run from scratch whenever feOffset moves, over a 190% × 210% region at device pixel
// ratio. Phones (WebKit runs SVG filters on the CPU) cannot do that every frame, so the
// idle drift dropped frames in bursts. Here the same chain is split: the turbulence is
// rendered once by the browser itself (same feTurbulence, same params, so the same noise)
// and the shape once to a canvas; each frame only the cheap per-pixel steps run in WebGL
// (shift noise, displace, Gaussian blur, alpha threshold, flat colour). Same look.

const VERT = `attribute vec2 a;varying vec2 v;void main(){v=a*.5+.5;gl_Position=vec4(a,0.,1.);}`;

// pass 1: displaced source alpha. p = user-space point of this pixel.
const DISPLACE = `precision highp float;varying vec2 v;
uniform sampler2D src,noise;uniform vec4 region,sreg,nreg;uniform vec2 off;uniform float scale;
void main(){
  vec2 p=region.xy+v*region.zw;
  vec2 n=texture2D(noise,(p-off-nreg.xy)/nreg.zw).rg;
  vec2 q=p+scale*(n-.5);
  vec2 uv=(q-sreg.xy)/sreg.zw;
  float a=(uv.x<0.||uv.y<0.||uv.x>1.||uv.y>1.)?0.:texture2D(src,uv).a;
  gl_FragColor=vec4(a,0.,0.,1.);
}`;

// pass 2 and 3: separable Gaussian at half resolution (the field is smooth after the blur).
const BLUR = `precision highp float;varying vec2 v;
uniform sampler2D tex;uniform vec2 dir;uniform float sigma;uniform float last;
void main(){
  vec2 c=v;
  float r=ceil(sigma*3.),s=texture2D(tex,c).r,w=1.;
  // paired taps: one linear fetch between texels i and i+1 covers both weights
  for(int j=0;j<12;j++){
    float i=float(j)*2.+1.;if(i>r)break;
    float k1=exp(-i*i/(2.*sigma*sigma)),k2=exp(-(i+1.)*(i+1.)/(2.*sigma*sigma)),k=k1+k2,o=i+k2/k;
    s+=k*(texture2D(tex,c+dir*o).r+texture2D(tex,c-dir*o).r);w+=2.*k;
  }
  gl_FragColor=vec4(s/w,0.,0.,1.);
}`;

// pass 4: full resolution: discrete alpha table (hard edge, like feFuncA) and flat colour.
const CUT = `precision highp float;varying vec2 v;uniform sampler2D tex;uniform vec3 colour;uniform float cut;
void main(){float a=texture2D(tex,vec2(v.x,1.-v.y)).r;float o=step(cut,a);gl_FragColor=vec4(colour*o,o);}`;

type Opts = { offset: () => { x: number; y: number } };

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
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link');
  return p;
}

function texFrom(gl: WebGLRenderingContext, img: TexImageSource) {
  const t = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

function target(gl: WebGLRenderingContext, w: number, h: number) {
  const t = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fb = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
  return { t, fb };
}

const attr = (el: Element | null, name: string, fallback: number) => {
  const n = parseFloat(el?.getAttribute(name) ?? '');
  return Number.isFinite(n) ? n : fallback;
};

/** Mounts the GPU blob over the SVG. Resolves to a draw(now) function, or null if WebGL is unavailable. */
export async function mountHeroBlobGL(svg: SVGSVGElement, opts: Opts) {
  const group = svg.querySelector<SVGGElement>('g[filter]');
  const filter = svg.querySelector('filter');
  const turb = svg.querySelector('feTurbulence');
  if (!group || !filter || !turb) return null;

  const canvas = document.createElement('canvas');
  canvas.className = 'mark-blob-gl';
  canvas.setAttribute('aria-hidden', 'true');
  const gl = canvas.getContext('webgl', { premultipliedAlpha: true, antialias: false, alpha: true });
  if (!gl) return null;

  // Filter region in user units, exactly as the SVG filter computes it.
  const bb = group.getBBox();
  const fx = attr(filter, 'x', -10) / (filter.getAttribute('x')?.includes('%') ? 100 : 1);
  const fy = attr(filter, 'y', -10) / (filter.getAttribute('y')?.includes('%') ? 100 : 1);
  const fw = attr(filter, 'width', 120) / (filter.getAttribute('width')?.includes('%') ? 100 : 1);
  const fh = attr(filter, 'height', 120) / (filter.getAttribute('height')?.includes('%') ? 100 : 1);
  const region = [bb.x + fx * bb.width, bb.y + fy * bb.height, fw * bb.width, fh * bb.height];

  const freq = turb.getAttribute('baseFrequency') || '0.015';
  const octaves = turb.getAttribute('numOctaves') || '2';
  const seed = turb.getAttribute('seed') || '0';
  const scale = attr(svg.querySelector('feDisplacementMap'), 'scale', 111);
  const blurUser = attr(svg.querySelector('feGaussianBlur'), 'stdDeviation', 2.2);
  const table = (svg.querySelector('feFuncA')?.getAttribute('tableValues') || '0 0 1 1 1 1 1 1').trim().split(/\s+/);
  const cut = Math.max(0, table.indexOf('1')) / table.length; // discrete table: first index that is opaque
  const colour = (svg.querySelector('feFlood')?.getAttribute('flood-color') || '#B70606').replace('#', '');
  const rgb = [0, 2, 4].map((i) => parseInt(colour.slice(i, i + 2), 16) / 255);

  // Noise: rendered once by the browser's own feTurbulence over the region plus drift room.
  const PAD = 40;
  const NRES = 2; // texels per user unit; the noise is smooth (period ~70 units)
  const nreg = [region[0] - PAD, region[1] - PAD, region[2] + 2 * PAD, region[3] + 2 * PAD];
  const nw = Math.round(nreg[2] * NRES);
  const nh = Math.round(nreg[3] * NRES);
  const noiseSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${nw}" height="${nh}" viewBox="${nreg.join(' ')}"><filter id="n" x="${nreg[0]}" y="${nreg[1]}" width="${nreg[2]}" height="${nreg[3]}" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="${octaves}" seed="${seed}"/><feComponentTransfer><feFuncA type="linear" slope="0" intercept="1"/></feComponentTransfer></filter><rect x="${nreg[0]}" y="${nreg[1]}" width="${nreg[2]}" height="${nreg[3]}" filter="url(#n)"/></svg>`;
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(noiseSvg);
  try {
    await img.decode();
  } catch {
    return null;
  }
  const nc = document.createElement('canvas');
  nc.width = nw;
  nc.height = nh;
  nc.getContext('2d')!.drawImage(img, 0, 0, nw, nh);

  const shapes = Array.from(group.querySelectorAll('path, ellipse'));
  const host = svg.parentElement!;
  host.appendChild(canvas);

  const pDisp = compile(gl, DISPLACE);
  const pBlur = compile(gl, BLUR);
  const pCut = compile(gl, CUT);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.activeTexture(gl.TEXTURE1);
  const noiseTex = texFrom(gl, nc);

  let W = 0;
  let H = 0;
  let lastLayoutW = 0;
  let pxPerUnit = 1;
  let out = region.slice();
  let LW = 1;
  let LH = 1;
  let srcTex: WebGLTexture | null = null;
  let a: ReturnType<typeof target> | null = null;
  let b: ReturnType<typeof target> | null = null;

  const layout = () => {
    const blob = svg.parentElement as HTMLElement | null;
    const heroRoot = host.closest('[data-hero-root]') as HTMLElement | null;
    const introW = heroRoot ? parseFloat(getComputedStyle(heroRoot).getPropertyValue('--intro-w')) : 0;
    const layoutCssW = introW || blob?.clientWidth || svg.clientWidth;
    if (!layoutCssW || layoutCssW === lastLayoutW) return;
    lastLayoutW = layoutCssW;

    const r = svg.getBoundingClientRect();
    const hr = host.getBoundingClientRect();
    if (!r.width) return;
    const vb = svg.viewBox.baseVal;
    const k = host.offsetWidth ? hr.width / host.offsetWidth : 1;
    const cssPerUnit = layoutCssW / vb.width;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    const layoutCssH = (layoutCssW * vb.height) / vb.width;
    const area = layoutCssW * layoutCssH * dpr * dpr || 1;
    if (area > 2.4e6) dpr *= Math.sqrt(2.4e6 / area);
    pxPerUnit = cssPerUnit * dpr;
    const x0 = Math.max(region[0], vb.x + (hr.left - r.left) / cssPerUnit);
    const x1 = Math.min(region[0] + region[2], vb.x + (hr.right - r.left) / cssPerUnit);
    const y0 = Math.max(region[1], vb.y + (hr.top - r.top) / cssPerUnit);
    const y1 = Math.min(region[1] + region[3], vb.y + (hr.bottom - r.top) / cssPerUnit);
    out = [x0, y0, Math.max(1 / pxPerUnit, x1 - x0), Math.max(1 / pxPerUnit, y1 - y0)];
    W = Math.floor(out[2] * pxPerUnit);
    H = Math.floor(out[3] * pxPerUnit);
    canvas.width = W;
    canvas.height = H;
    Object.assign(canvas.style, {
      position: 'absolute',
      left: `${(r.left - hr.left + (out[0] - vb.x) * cssPerUnit) / k}px`,
      top: `${(r.top - hr.top + (out[1] - vb.y) * cssPerUnit) / k}px`,
      width: `${W / dpr / k}px`,
      height: `${H / dpr / k}px`,
      pointerEvents: 'none',
    });
    // shape, rasterised once per size (anti-aliased like the SVG source graphic)
    const sc = document.createElement('canvas');
    sc.width = Math.round(region[2] * pxPerUnit);
    sc.height = Math.round(region[3] * pxPerUnit);
    const ctx = sc.getContext('2d')!;
    ctx.setTransform(pxPerUnit, 0, 0, pxPerUnit, -region[0] * pxPerUnit, -region[1] * pxPerUnit);
    ctx.fillStyle = '#000';
    shapes.forEach((el) => {
      if (el instanceof SVGPathElement) ctx.fill(new Path2D(el.getAttribute('d') || ''));
      else {
        ctx.beginPath();
        ctx.ellipse(attr(el, 'cx', 0), attr(el, 'cy', 0), attr(el, 'rx', 0), attr(el, 'ry', 0), 0, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    gl.activeTexture(gl.TEXTURE0);
    if (srcTex) gl.deleteTexture(srcTex);
    srcTex = texFrom(gl, sc);
    [a, b].forEach((t) => {
      if (!t) return;
      gl.deleteTexture(t.t);
      gl.deleteFramebuffer(t.fb);
    });
    LW = Math.max(1, Math.round(W / 2));
    LH = Math.max(1, Math.round(H / 2));
    a = target(gl, LW, LH);
    b = target(gl, LW, LH);
  };
  layout();
  const blobEl = svg.parentElement;
  const ro =
    blobEl &&
    new ResizeObserver(() => {
      layout();
    });
  if (ro && blobEl) ro.observe(blobEl);
  addEventListener(
    'intro-layout',
    () => {
      lastLayoutW = 0;
      layout();
    },
    { passive: true },
  );

  const quad = (p: WebGLProgram) => {
    gl.useProgram(p);
    const loc = gl.getAttribLocation(p, 'a');
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };
  const u = (p: WebGLProgram, n: string) => gl.getUniformLocation(p, n);

  const draw = () => {
    if (!a || !b || !srcTex || !W) return;
    const o = opts.offset();
    // 1. displace, at half resolution (v=0 is the top row in user space throughout)
    gl.viewport(0, 0, LW, LH);
    gl.bindFramebuffer(gl.FRAMEBUFFER, a.fb);
    gl.useProgram(pDisp);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, srcTex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, noiseTex);
    gl.uniform1i(u(pDisp, 'src'), 0);
    gl.uniform1i(u(pDisp, 'noise'), 1);
    gl.uniform4f(u(pDisp, 'region'), out[0], out[1], out[2], out[3]);
    gl.uniform4f(u(pDisp, 'sreg'), region[0], region[1], region[2], region[3]);
    gl.uniform4f(u(pDisp, 'nreg'), nreg[0], nreg[1], nreg[2], nreg[3]);
    gl.uniform2f(u(pDisp, 'off'), o.x, o.y);
    gl.uniform1f(u(pDisp, 'scale'), scale);
    quad(pDisp);
    // 2. horizontal and 3. vertical blur (sigma in half-res texels)
    gl.useProgram(pBlur);
    gl.uniform1f(u(pBlur, 'sigma'), (blurUser * pxPerUnit * LW) / W);
    gl.uniform1i(u(pBlur, 'tex'), 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, b.fb);
    gl.bindTexture(gl.TEXTURE_2D, a.t);
    gl.uniform2f(u(pBlur, 'dir'), 1 / LW, 0);
    quad(pBlur);
    gl.bindFramebuffer(gl.FRAMEBUFFER, a.fb);
    gl.bindTexture(gl.TEXTURE_2D, b.t);
    gl.uniform2f(u(pBlur, 'dir'), 0, 1 / LH);
    quad(pBlur);
    // 4. full-res threshold + colour to screen
    gl.viewport(0, 0, W, H);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(pCut);
    gl.bindTexture(gl.TEXTURE_2D, a.t);
    gl.uniform1i(u(pCut, 'tex'), 0);
    gl.uniform3f(u(pCut, 'colour'), rgb[0], rgb[1], rgb[2]);
    gl.uniform1f(u(pCut, 'cut'), cut);
    quad(pCut);
  };
  return { canvas, draw, layout };
}
