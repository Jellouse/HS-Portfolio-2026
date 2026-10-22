// Estimates how big the next Keystatic save of the open entry will be, using
// Keystatic's own serializer (exposed by scripts/patch-keystatic.mjs).
// GitHub rejects a commit request above ~45MB, and files go up as base64.
// What Keystatic sends: every file of the entry whose git blob differs from
// the branch tree at that path. That is new or changed images, plus existing
// images that land on a new path (blocks moved, inserted or removed shift
// blocks/N/...). Unchanged files cost nothing.

export const SAFE_LIMIT_BYTES = 40 * 1024 * 1024; // encoded
export const TOO_BIG_MESSAGE =
  'This change is getting too big to save in one go. Save first, then upload more.';

type Probe = {
  args: any;
  unscopedTreeData: any;
  getPathPrefix: (storage: any) => string | null | undefined;
  getTreeNodeAtPath: (tree: any, path: string) => any;
  serializeEntryToFiles: (args: any) => { path: string; contents: Uint8Array }[];
  path: string;
};

const shaCache = new WeakMap<Uint8Array, Promise<string>>();

export function base64Length(bytes: number) {
  return 4 * Math.ceil(bytes / 3);
}

async function gitBlobSha(contents: Uint8Array): Promise<string> {
  let cached = shaCache.get(contents);
  if (!cached) {
    cached = (async () => {
      const header = new TextEncoder().encode(`blob ${contents.byteLength}\0`);
      const buf = new Uint8Array(header.byteLength + contents.byteLength);
      buf.set(header, 0);
      buf.set(contents, header.byteLength);
      const digest = await crypto.subtle.digest('SHA-1', buf);
      return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
    })();
    shaCache.set(contents, cached);
  }
  return cached;
}

function probe(): Probe | undefined {
  if (typeof window === 'undefined') return undefined;
  const p = (window as any).__hsKeystaticSave as Probe | undefined;
  if (!p || p.path !== window.location.pathname) return undefined;
  if (p.unscopedTreeData?.kind !== 'loaded') return undefined;
  return p;
}

export function limitBytes() {
  if (typeof localStorage !== 'undefined') {
    const mb = Number(localStorage.getItem('hsSaveLimitMB'));
    if (mb > 0) return mb * 1024 * 1024; // test override
  }
  return SAFE_LIMIT_BYTES;
}

export type Estimate = { bytes: number; files: number; available: boolean };

/** Encoded size of what the next save would send. */
export async function estimatePendingSave(exclude?: Uint8Array | null): Promise<Estimate> {
  const p = probe();
  if (!p) return { bytes: 0, files: 0, available: false };
  const tree = p.unscopedTreeData.data.tree;
  const prefix = p.getPathPrefix(p.args.config.storage) ?? '';
  const files = p.serializeEntryToFiles({
    basePath: p.args.basePath,
    schema: p.args.schema,
    format: p.args.format,
    state: p.args.state,
    slug: p.args.slug,
  });
  let bytes = 0;
  let count = 0;
  for (const f of files) {
    if (exclude && f.contents === exclude) continue; // being replaced
    const path = prefix + f.path;
    const existing = p.getTreeNodeAtPath(tree, path)?.entry?.sha;
    if (existing && existing === (await gitBlobSha(f.contents))) continue;
    bytes += base64Length(f.contents.byteLength) + path.length + 32;
    count++;
  }
  return { bytes, files: count, available: true };
}

/** Would adding a file of this many raw bytes push the save over the limit? */
export async function wouldExceed(rawBytes: number, replacing?: Uint8Array | null) {
  const est = await estimatePendingSave(replacing);
  const next = est.bytes + base64Length(rawBytes);
  return { exceeds: est.available && next > limitBytes(), next, est };
}

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

let started = false;
/** Small fixed badge in the admin: size of the next save. */
export function startSaveBudgetIndicator() {
  if (started || typeof window === 'undefined' || typeof document === 'undefined') return;
  started = true;
  const el = document.createElement('div');
  el.id = 'hs-save-budget';
  el.setAttribute('aria-live', 'polite');
  Object.assign(el.style, {
    position: 'fixed', left: '12px', bottom: '12px', zIndex: '2147483647',
    padding: '4px 8px', borderRadius: '6px', font: '12px/1.4 system-ui, sans-serif',
    background: 'rgba(255,255,255,0.95)', color: '#444', border: '1px solid #ddd',
    pointerEvents: 'none', display: 'none',
  } as CSSStyleDeclaration);
  const mount = () => document.body && !el.isConnected && document.body.appendChild(el);
  let lastState: unknown;
  let lastPath = '';
  let busy = false;
  const tick = async () => {
    if (busy) return;
    const p = probe();
    mount();
    if (!p) { el.style.display = 'none'; lastState = undefined; return; }
    if (p.args.state === lastState && p.path === lastPath) return;
    busy = true;
    try {
      const est = await estimatePendingSave();
      lastState = p.args.state; lastPath = p.path;
      const limit = limitBytes();
      el.textContent = `Next save: ${mb(est.bytes)} of ${mb(limit)}`;
      el.dataset.bytes = String(est.bytes);
      el.style.color = est.bytes > limit ? '#b00020' : est.bytes > limit * 0.75 ? '#9a6700' : '#444';
      el.style.display = est.bytes >= 100 * 1024 ? 'block' : 'none';
    } catch {
      el.style.display = 'none';
    } finally {
      busy = false;
    }
  };
  window.setInterval(() => void tick(), 700);
}
