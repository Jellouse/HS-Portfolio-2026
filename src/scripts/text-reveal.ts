// Per-line text reveal. After fonts load, every word gets an inline-block span (links and
// inline elements stay intact, whitespace stays as real text nodes so wrapping is unchanged),
// and words are grouped into visual lines by offsetTop (--line). Scroll-linked browsers animate
// each word against its own position, so a whole line reveals together; others get a 250ms
// fallback staggered per line. Re-split on resize, restoring the original HTML first.
const SELECTOR =
  '.about p, .text-block p, .footer-text p, .caption, .project-summary, .info-list li, .project-hero h1';

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

function split(host: Host) {
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
  const hosts = [...document.querySelectorAll<Host>(SELECTOR)];
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
