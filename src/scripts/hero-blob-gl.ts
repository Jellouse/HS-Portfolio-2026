

const VERT = `attribute vec2 a;varying vec2 v;void main(){v=a*.5+.5;gl_Position=vec4(a,0.,1.);}`;

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

const BLUR = `precision highp float;varying vec2 v;
uniform sampler2D tex;uniform vec2 dir;uniform float sigma;uniform float last;
void main(){
  vec2 c=v;
  float r=ceil(sigma*3.),s=texture2D(tex,c).r,w=1.;
  for(int j=0;j<12;j++){
    float i=float(j)*2.+1.;if(i>r)break;
    float k1=exp(-i*i/(2.*sigma*sigma)),k2=exp(-(i+1.)*(i+1.)/(2.*sigma*sigma)),k=k1+k2,o=i+k2/k;
    s+=k*(texture2D(tex,c+dir*o).r+texture2D(tex,c-dir*o).r);w+=2.*k;
  }
  gl_FragColor=vec4(s/w,0.,0.,1.);
}`;

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

  const shapes = Array.from(group.querySelectorAll('path, ellipse'));
  const bb = shapes.reduce(
    (box, el) => {
      const b = el.getBBox();
      return {
        x: Math.min(box.x, b.x),
        y: Math.min(box.y, b.y),
        x1: Math.max(box.x1, b.x + b.width),
        y1: Math.max(box.y1, b.y + b.height),
      };
    },
    { x: Infinity, y: Infinity, x1: -Infinity, y1: -Infinity },
  );
  const geom = { x: bb.x, y: bb.y, width: bb.x1 - bb.x, height: bb.y1 - bb.y };
  const fx = attr(filter, 'x', -10) / (filter.getAttribute('x')?.includes('%') ? 100 : 1);
  const fy = attr(filter, 'y', -10) / (filter.getAttribute('y')?.includes('%') ? 100 : 1);
  const fw = attr(filter, 'width', 120) / (filter.getAttribute('width')?.includes('%') ? 100 : 1);
  const fh = attr(filter, 'height', 120) / (filter.getAttribute('height')?.includes('%') ? 100 : 1);
  const regionFor = (stretch: number) => [
    geom.x + fx * geom.width,
    stretch * (geom.y + fy * geom.height),
    fw * geom.width,
    stretch * fh * geom.height,
  ];

  const freq = turb.getAttribute('baseFrequency') || '0.015';
  const octaves = turb.getAttribute('numOctaves') || '2';
  const seed = turb.getAttribute('seed') || '0';
  const scale = attr(svg.querySelector('feDisplacementMap'), 'scale', 111);
  const blurUser = attr(svg.querySelector('feGaussianBlur'), 'stdDeviation', 2.2);
  const table = (svg.querySelector('feFuncA')?.getAttribute('tableValues') || '0 0 1 1 1 1 1 1').trim().split(/\s+/);
  const cut = Math.max(0, table.indexOf('1')) / table.length;
  const flood = svg.querySelector('feFlood')?.getAttribute('flood-color') || '';
  const colourSource = !flood || flood === 'currentColor' ? getComputedStyle(svg).color : flood;
  const rgb = (() => {
    const hex = colourSource.trim();
    if (hex.startsWith('#')) {
      const h = (hex.length === 4 ? hex.slice(1).split('').map((c) => c + c).join('') : hex.slice(1));
      return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
    }
    const nums = hex.match(/[\d.]+/g);
    if (nums && nums.length >= 3) return nums.slice(0, 3).map((n) => Number(n) / 255);
    return [0xb7 / 255, 0x06 / 255, 0x06 / 255];
  })();

  const PAD = 40;
  const NRES = 2;
  let nreg = [0, 0, 1, 1];
  let noiseTex: WebGLTexture | null = null;
  let noiseKey = '';
  let baking: number[] | null = null;

  const readStretch = () => {
    const t = shapes.find((el) => el.hasAttribute('transform'))?.getAttribute('transform') || '';
    const m = t.match(/scale\(\s*1[\s,]+([\d.]+)\)/);
    return m ? Number(m[1]) || 1 : 1;
  };

  const contains = (outer: number[], inner: number[]) =>
    inner[0] >= outer[0] - 0.5 &&
    inner[1] >= outer[1] - 0.5 &&
    inner[0] + inner[2] <= outer[0] + outer[2] + 0.5 &&
    inner[1] + inner[3] <= outer[1] + outer[3] + 0.5;

  const loadNoise = async (next: number[]) => {
    if (noiseTex && contains(nreg, next)) return;
    if (baking && contains(baking, next)) return;
    const key = next.map((n) => n.toFixed(3)).join(',');
    if (key === noiseKey && noiseTex) return;
    noiseKey = key;
    baking = next;
    const nw = Math.max(1, Math.round(next[2] * NRES));
    const nh = Math.max(1, Math.round(next[3] * NRES));
    const noiseSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${nw}" height="${nh}" viewBox="${next.join(' ')}"><filter id="n" x="${next[0]}" y="${next[1]}" width="${next[2]}" height="${next[3]}" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="${octaves}" seed="${seed}"/><feComponentTransfer><feFuncA type="linear" slope="0" intercept="1"/></feComponentTransfer></filter><rect x="${next[0]}" y="${next[1]}" width="${next[2]}" height="${next[3]}" filter="url(#n)"/></svg>`;
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(noiseSvg);
    try {
      await img.decode();
    } catch {
      if (baking === next) baking = null;
      return;
    }
    if (key !== noiseKey) return;
    if (noiseTex && contains(nreg, next)) {
      baking = null;
      return;
    }
    const nc = document.createElement('canvas');
    nc.width = nw;
    nc.height = nh;
    nc.getContext('2d')!.drawImage(img, 0, 0, nw, nh);
    gl.activeTexture(gl.TEXTURE1);
    if (noiseTex) gl.deleteTexture(noiseTex);
    noiseTex = texFrom(gl, nc);
    nreg = next;
    baking = null;
  };

  const host = svg.parentElement!;
  host.appendChild(canvas);

  const pDisp = compile(gl, DISPLACE);
  const pBlur = compile(gl, BLUR);
  const pCut = compile(gl, CUT);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

  let W = 0;
  let H = 0;
  let lastKey = '';
  let pxPerUnit = 1;
  let out = [0, 0, 1, 1];
  let sreg = regionFor(1);
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
    const stretch = readStretch();
    const key = `${layoutCssW}:${stretch}`;
    if (!layoutCssW || key === lastKey) return;
    lastKey = key;

    const r = svg.getBoundingClientRect();
    const hr = host.getBoundingClientRect();
    if (!r.width) {
      lastKey = '';
      return;
    }
    const region = (sreg = regionFor(stretch));
    const vb = svg.viewBox.baseVal;
    const k = host.offsetWidth ? hr.width / host.offsetWidth : 1;
    const cssPerUnit = layoutCssW / vb.width;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    const faceH = (layoutCssW * 249 * stretch) / vb.width;
    const area = layoutCssW * faceH * dpr * dpr || 1;
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
    const topPx = (r.top - hr.top + (out[1] - vb.y) * cssPerUnit) / k;
    Object.assign(canvas.style, {
      position: 'absolute',
      left: `${(r.left - hr.left + (out[0] - vb.x) * cssPerUnit) / k}px`,
      top: `${topPx}px`,
      width: `${W / dpr / k}px`,
      height: `${H / dpr / k}px`,
      pointerEvents: 'none',
    });
    canvas.style.transform = '';
    canvas.style.transformOrigin = '';

    const sc = document.createElement('canvas');
    sc.width = Math.max(1, Math.round(region[2] * pxPerUnit));
    sc.height = Math.max(1, Math.round(region[3] * pxPerUnit));
    const ctx = sc.getContext('2d')!;
    ctx.setTransform(pxPerUnit, 0, 0, pxPerUnit, -region[0] * pxPerUnit, -region[1] * pxPerUnit);
    ctx.scale(1, stretch);
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
    const next = [region[0] - PAD, region[1] - PAD, region[2] + 2 * PAD, region[3] + 2 * PAD];
    void loadNoise(next);
  };
  const region0 = regionFor(readStretch());
  await loadNoise([region0[0] - PAD, region0[1] - PAD, region0[2] + 2 * PAD, region0[3] + 2 * PAD]);
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
      lastKey = '';
      layout();
    },
    { passive: true },
  );
  addEventListener('intro-frame', () => layout(), { passive: true });

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
    if (!a || !b || !srcTex || !noiseTex || !W) return;
    const o = opts.offset();

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
    gl.uniform4f(u(pDisp, 'sreg'), sreg[0], sreg[1], sreg[2], sreg[3]);
    gl.uniform4f(u(pDisp, 'nreg'), nreg[0], nreg[1], nreg[2], nreg[3]);
    gl.uniform2f(u(pDisp, 'off'), o.x, o.y);
    gl.uniform1f(u(pDisp, 'scale'), scale);
    quad(pDisp);

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
