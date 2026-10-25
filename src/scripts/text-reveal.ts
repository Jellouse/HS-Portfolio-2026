// Per-line text reveal. After fonts load, every word gets an inline-block span (links and
// inline elements stay intact, whitespace stays as real text nodes so wrapping is unchanged),
// and words are grouped into visual lines by offsetTop (--line). Scroll-linked browsers animate
// each word against its own position, so a whole line reveals together; others get a 250ms
// fallback staggered per line. Re-split on resize, restoring the original HTML first.
// Every text block in the page content and footer reveals by default, so new pages and
// components get it without opting in. (A hard-coded class list used to miss new markup,
// e.g. the /shop overview.) Hosts nested inside another host are skipped; [data-no-reveal]
// opts a block out (it animates itself, like the /shop Details panel).
const SELECTOR = [
  'main :is(p, h1, h2, h3, h4, li, blockquote, figcaption, .caption, .project-summary)',
  '.site-footer :is(p, li)',
].join(', ');
const EXCLUDE = '.sr-only, [data-no-reveal], [data-no-reveal] *';

type Host = HTMLElement & { __revealHtml?: string };

function wrapWords(node: Node) {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? '';
    if (!/\S/.test(text)) return;
    const frag = document.createDocumentFragment();
    // words split after hyphens too, so the original break opportunities stay
    for (const part of text.match(/\s+|[^\s-]+-*|-+/g) ?? []) {
      if (/^\s+$/.test(part)) {
        frag.appendChild(document.createTextNode(part));
      } else {
        const span = document.createElement('span');
        span.className = 'reveal-word';
        span.textContent = part;
        frag.appendChild(span);
      }
    }
    (node as ChildNode).replaceWith(frag);
  } else if (node.nodeType === Node.ELEMENT_NODE) {
    [...node.childNodes].forEach(wrapWords);
  }
}

export function split(host: Host) {
  if (host.__revealHtml === undefined) host.__revealHtml = host.innerHTML;
  else host.innerHTML = host.__revealHtml;
  wrapWords(host);
  let line = -1;
  let top = -Infinity;
  host.querySelectorAll<HTMLElement>('.reveal-word').forEach((word) => {
    const t = word.getBoundingClientRect().top;
    if (Math.abs(t - top) > 2) {
      line += 1;
      top = t;
    }
    word.style.setProperty('--line', String(line));
  });
  host.classList.add('is-split');
}

function armFallback(hosts: Host[]) {
  if (!('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target as Host;
        io.unobserve(el);
        el.classList.add('reveal-in');
        // scrolled past fast: show instantly
        if (entry.boundingClientRect.top < window.innerHeight * 0.5) el.classList.add('reveal-now');
        requestAnimationFrame(() => el.classList.remove('reveal-pending'));
      }
    },
    { rootMargin: '0px 0px -5% 0px' },
  );
  hosts.forEach((el) => {
    if (el.classList.contains('reveal-in')) return;
    if (el.getBoundingClientRect().top < window.innerHeight) return;
    el.classList.add('reveal-pending');
    io.observe(el);
  });
}

export function initTextReveal() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const all = [...document.querySelectorAll<Host>(SELECTOR)].filter((el) => !el.matches(EXCLUDE));
  const hosts = all.filter((el) => !all.some((other) => other !== el && other.contains(el)));
  if (!hosts.length) return;
  const scrollLinked = CSS.supports('animation-timeline: view()');

  const run = () => hosts.forEach(split);
  (document.fonts?.ready ?? Promise.resolve()).then(() => {
    run();
    if (!scrollLinked) armFallback(hosts);
  });

  let width = window.innerWidth;
  let timer = 0;
  window.addEventListener('resize', () => {
    if (window.innerWidth === width) return;
    width = window.innerWidth;
    clearTimeout(timer);
    timer = window.setTimeout(run, 150);
  });
}
