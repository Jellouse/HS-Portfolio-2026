import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { canChromeVt, reduceMotion, runChromeVt } from '../lib/chrome-vt';
import { typePx } from '../lib/type-scale';
import { mountFaceGlance } from '../scripts/face-glance';
import { playSnick } from '../scripts/ui-sound';
import ContactFace from './ContactFace';

const TITLES: Record<number, string> = { 1: 'Pick a service', 2: 'Describe your project', 3: 'Add your email' };
const SERVICES = [
  { value: 'Physical Build', label: 'Physical build', dir: 'left' as const },
  { value: 'Digital Build', label: 'Digital build', dir: 'right' as const },
  { value: 'Other', label: 'Other', dir: 'down' as const },
];
const THANKS = "Thank you, i'll be in contact soon.";

const BACK_SVG = (
  <svg viewBox="0 0 21 20" aria-hidden="true">
    <path
      d="M2.11719 7H13.1172C16.4309 7 19.1172 9.68629 19.1172 13C19.1172 16.3137 16.4309 19 13.1172 19H5.98082"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    />
    <path d="M7.53027 13.2324L1.41406 7.11621L7.53027 0.999995" fill="none" stroke="currentColor" strokeWidth="2" />
  </svg>
);

function focusables(root: HTMLElement) {
  return [...root.querySelectorAll<HTMLElement>('button:not([disabled]), textarea, input, a[href]')].filter(
    (el) => el.offsetParent !== null && !el.closest('[hidden]'),
  );
}

/** Contact opened while the About arrow screen is showing. */
function openerFromAbout(el: HTMLElement | null) {
  if (!el?.hasAttribute('data-contact-open')) return false;
  return !!document.querySelector('.arrow-nav[data-screen="about"]');
}

/** Drop about chrome names so the new VT snapshot only keeps the contact hub. */
function muteAboutChrome(mute: boolean) {
  document.querySelectorAll<HTMLElement>('.arrow-nav:not(.contact-hub)').forEach((nav) => {
    nav.classList.toggle('is-contact-covered', mute);
  });
}

/** Centre the about glance so eyes are not mid-shift in the VT snapshot. */
function resetAboutGlance() {
  document
    .querySelectorAll<HTMLElement>('.arrow-nav[data-screen="about"] .arrow-face-blob[data-glance]')
    .forEach((el) => el.removeAttribute('data-glance'));
}

/** Show/hide must be sync inside a view-transition update. React flushSync alone
 *  does not always commit the portal in time for the new snapshot. */
function syncPanel(el: HTMLElement | null, open: boolean, step: number) {
  if (!el) return;
  el.classList.toggle('is-closed', !open);
  el.dataset.state = open ? 'open' : 'closed';
  el.setAttribute('aria-hidden', open ? 'false' : 'true');
  if (open) el.setAttribute('aria-modal', 'true');
  else el.removeAttribute('aria-modal');
  document.documentElement.classList.toggle('is-contact-open', open);
  syncStep(el, step, { project: '', email: '' });
}

/**
 * Persist step slots in the DOM and toggle them here. flushSync often does not
 * remount portal children before the VT new snapshot, so step hops were finishing
 * with identical old/new chrome (no face morph, no pill motion).
 */
function syncStep(
  el: HTMLElement | null,
  step: number,
  filled: { project: string; email: string } = { project: '', email: '' },
) {
  if (!el) return;
  el.dataset.step = step === 4 ? 'done' : String(step);

  el.querySelectorAll<HTMLElement>('[data-contact-step]').forEach((node) => {
    const slot = Number(node.dataset.contactStep);
    node.hidden = slot !== step;
  });

  const hub = el.querySelector<HTMLElement>('.contact-hub');
  if (hub) {
    if (step >= 1 && step <= 3) hub.setAttribute('data-chrome-vt', '');
    else hub.removeAttribute('data-chrome-vt');
  }

  const back = el.querySelector<HTMLElement>('.arrow-back');
  if (back) {
    if (step > 1) back.setAttribute('data-contact-back', '');
    else back.removeAttribute('data-contact-back');
  }

  const down = el.querySelector<HTMLElement>('[data-contact-down]');
  if (down) {
    const label = step === 1 ? 'Other' : step === 2 ? 'Confirm' : 'Send';
    if (down.textContent !== label) down.textContent = label;
    if (step === 1) {
      down.setAttribute('data-service', 'Other');
      down.removeAttribute('data-contact-next');
    } else {
      down.removeAttribute('data-service');
      down.setAttribute('data-contact-next', '');
    }
    const disabled =
      step === 2 ? !filled.project.trim() : step === 3 ? !filled.email.trim() : false;
    down.toggleAttribute('disabled', disabled);
  }
}

export default function ContactDrawer({ email: address }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [service, setService] = useState('');
  const [project, setProject] = useState('');
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState(THANKS);
  const [live, setLive] = useState('');
  const opener = useRef<HTMLElement | null>(null);
  const fromAbout = useRef(false);
  const panel = useRef<HTMLDivElement>(null);
  const hub = useRef<HTMLFormElement>(null);
  const text = useRef<HTMLTextAreaElement>(null);
  const field = useRef<HTMLDivElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const msgRef = useRef<HTMLParagraphElement>(null);
  const lines = useRef(0);
  const pressed = useRef<HTMLElement | null>(null);
  const pressKey = useRef('');
  const stepRef = useRef(step);
  const serviceRef = useRef(service);
  const projectRef = useRef(project);
  const emailRefValue = useRef(email);
  const moving = useRef(false);
  stepRef.current = step;
  serviceRef.current = service;
  projectRef.current = project;
  emailRefValue.current = email;

  const announce = (t: string) => {
    setLive('');
    requestAnimationFrame(() => setLive(t));
  };

  const setStepChrome = (next: number) => {
    const from = stepRef.current;
    if (next === from) return;
    const filled = { project: projectRef.current, email: emailRefValue.current };
    const run = () => {
      stepRef.current = next;
      // Commit React step first when possible, then re-assert slots. flushSync on
      // this createRoot is unreliable alone; syncStep is what the VT snapshot sees.
      // Do not setLive here — a stale step render would undo [hidden].
      flushSync(() => setStep(next));
      syncStep(panel.current, next, filled);
    };
    // Done leaves the chrome set; a plain fade is enough.
    if (next === 4 || from === 4 || !canChromeVt()) {
      run();
      if (next >= 1 && next <= 3) announce(`Step ${next} of 3: ${TITLES[next]}`);
      return;
    }
    // Face ↔ field: soft crossfade on separate VT names (contact-face).
    // Field ↔ field: shared contact-field with a pill radius (no ellipse).
    panel.current?.classList.add('is-entered');
    moving.current = true;
    const faceHop = from === 1 || next === 1;
    void runChromeVt(run, { flag: faceHop ? 'contact-face' : 'contact' }).finally(() => {
      moving.current = false;
      if (next >= 1 && next <= 3) announce(`Step ${next} of 3: ${TITLES[next]}`);
    });
  };

  const close = useCallback(() => {
    if (fromAbout.current && stepRef.current === 1 && canChromeVt()) {
      resetAboutGlance();
      void runChromeVt(() => {
        muteAboutChrome(false);
        stepRef.current = 1;
        flushSync(() => {
          setStep(1);
          setOpen(false);
        });
        syncPanel(panel.current, false, 1);
      }, { flag: 'about-contact-out', types: ['chrome-grow'] });
      return;
    }
    muteAboutChrome(false);
    flushSync(() => setOpen(false));
    syncPanel(panel.current, false, stepRef.current);
  }, []);

  const goHome = () => {
    muteAboutChrome(false);
    flushSync(() => setOpen(false));
    syncPanel(panel.current, false, 1);
    if (location.pathname !== '/') location.assign('/');
  };

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const t = (e.target as Element).closest<HTMLElement>('[data-contact-open]');
      if (!t) return;
      e.preventDefault();
      opener.current = t;
      fromAbout.current = openerFromAbout(t);
      const preset = t.getAttribute('data-contact-service');
      lines.current = 0;
      if (text.current) text.current.style.height = '';
      const next = preset && SERVICES.some((s) => s.value === preset) ? 2 : 1;
      const nextService =
        preset && SERVICES.some((s) => s.value === preset) ? preset : '';
      serviceRef.current = nextService;
      // Flush form reset before open so a late render cannot re-close the panel.
      flushSync(() => {
        setProject('');
        setEmail('');
        setMsg(THANKS);
        setService(nextService);
      });
      const openHub = () => {
        muteAboutChrome(fromAbout.current);
        stepRef.current = next;
        flushSync(() => {
          setStep(next);
          setOpen(true);
        });
        // Imperative show so the VT new snapshot includes face + pills.
        syncPanel(panel.current, true, next);
        if (fromAbout.current) panel.current?.classList.add('is-entered');
      };
      if (fromAbout.current && next === 1) {
        // Soft crossfade (no chrome-shrink): about's 1.18 zoom and the resting
        // contact face blend in the same --dur-nav window as the size morph,
        // so eyes/mouth move with the scale — same feel as to-about.
        resetAboutGlance();
        void runChromeVt(openHub, { flag: 'about-contact-in' }).finally(() => {
          announce(`Contact. Step ${next} of 3: ${TITLES[next]}`);
        });
      } else {
        openHub();
        announce(`Contact. Step ${next} of 3: ${TITLES[next]}`);
      }
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    root.classList.toggle('is-contact-open', open);
    if (open) {
      const gap = Math.max(0, window.innerWidth - root.clientWidth);
      if (gap > 0) {
        root.style.setProperty('--scroll-lock', `${gap}px`);
        body.style.paddingRight = `${gap}px`;
      }
    } else {
      root.style.removeProperty('--scroll-lock');
      body.style.removeProperty('padding-right');
      muteAboutChrome(false);
    }
  }, [open]);

  // contact-in only on first open. Lock it before a step VT finishes, or the
  // panel fades again when data-contact-vt is cleared.
  useEffect(() => {
    if (!open) return;
    const el = panel.current;
    if (!el) return;
    if (fromAbout.current || document.documentElement.hasAttribute('data-contact-vt')) {
      el.classList.add('is-entered');
      return;
    }
    const lock = () => el.classList.add('is-entered');
    el.addEventListener('animationend', lock, { once: true });
    const t = window.setTimeout(lock, 450);
    return () => {
      window.clearTimeout(t);
      el.removeEventListener('animationend', lock);
    };
  }, [open]);

  useEffect(() => {
    if (!open) opener.current?.focus({ preventScroll: true });
    if (!open && step === 4) {
      const t = setTimeout(() => {
        setStep(1);
        setService('');
        setProject('');
        setEmail('');
        setMsg(THANKS);
        lines.current = 0;
        if (text.current) text.current.style.height = '';
      }, 500);
      return () => clearTimeout(t);
    }
  }, [open, step]);

  useEffect(() => {
    if (!open || step !== 1 || !hub.current) return;
    const glance = mountFaceGlance(hub.current);
    glance.setEnabled(true);
    return () => glance.destroy();
  }, [open, step]);

  useEffect(() => {
    if (!open || !hub.current) return;
    const root = hub.current;
    const onDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const el = (event.target as Element).closest<HTMLElement>('.arrow-pill, .arrow-back');
      if (!el || !root.contains(el) || (el as HTMLButtonElement).disabled) return;
      pressed.current?.classList.remove('is-pressed');
      pressed.current = el;
      el.classList.add('is-pressed');
      playSnick();
    };
    const release = () => {
      pressed.current?.classList.remove('is-pressed');
      pressed.current = null;
    };
    root.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    return () => {
      root.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
    };
  }, [open, step]);

  const measure = useCallback(() => {
    const el = text.current;
    const box = field.current;
    if (!el || !box) return;
    const lh = parseFloat(getComputedStyle(el).lineHeight) || typePx('lh');
    const before = el.getBoundingClientRect().top;
    el.style.height = `${lh}px`;
    const n = Math.max(1, Math.round(el.scrollHeight / lh));
    const style = getComputedStyle(box);
    const maxCss = parseFloat(style.maxHeight);
    const pad = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
    const boxH = Number.isFinite(maxCss) && maxCss > 0 ? maxCss : box.clientHeight;
    const max = Math.max(1, Math.floor((boxH - pad) / lh));
    const shown = Math.min(n, max);
    el.style.height = `${shown * lh}px`;
    box.classList.toggle('is-multi', n > 1);
    box.classList.toggle('is-full', n > max);
    if (n <= max) el.scrollTop = 0;
    else if (el.selectionEnd === el.value.length) el.scrollTop = el.scrollHeight;
    if (lines.current && shown !== Math.min(lines.current, max) && !reduceMotion()) {
      const d = before - el.getBoundingClientRect().top;
      if (d) el.animate([{ transform: `translateY(${d}px)` }, { transform: 'none' }], { duration: 240, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
    }
    lines.current = n;
  }, []);

  useLayoutEffect(() => {
    if (open && step === 2) measure();
  }, [project, step, open, measure]);

  useEffect(() => {
    const r = () => step === 2 && measure();
    addEventListener('resize', r);
    return () => removeEventListener('resize', r);
  }, [step, measure]);

  const focusStep = (s = step) => {
    const el =
      s === 2
        ? text.current
        : s === 3
          ? emailRef.current
          : s === 1
            ? hub.current?.querySelector<HTMLElement>('[data-service]')
            : s === 4
              ? msgRef.current
              : hub.current?.querySelector<HTMLElement>('.arrow-back');
    el?.focus({ preventScroll: true });
  };

  useEffect(() => {
    if (open) requestAnimationFrame(() => focusStep());
  }, [step, open]);

  const isFilled = (s = stepRef.current) => {
    if (s === 1) return !!serviceRef.current;
    if (s === 2) return !!projectRef.current.trim();
    if (s === 3) return !!emailRefValue.current && !!emailRef.current?.checkValidity();
    return false;
  };

  const send = () => {
    const svc = serviceRef.current;
    const proj = projectRef.current.trim();
    const mail = emailRefValue.current.trim();
    setStepChrome(4);
    void (async () => {
      try {
        const res = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ service: svc, project: proj, email: mail }),
        });
        if (!res.ok) throw new Error(String(res.status));
        announce(THANKS);
      } catch {
        const m = `That didn’t go through. Please email ${address} instead.`;
        setMsg(m);
        announce(m);
      }
    })();
  };

  const go = (dir: 1 | -1, s = stepRef.current, ok = isFilled(s)) => {
    if (moving.current) return;
    if (dir === -1 && s === 1) {
      close();
      return;
    }
    if (dir === 1 && !ok) return;
    if (dir === 1 && s === 3) return void send();
    const n = Math.min(3, Math.max(1, s + dir));
    setStepChrome(n);
  };

  const pickService = (value: string) => {
    if (moving.current) return;
    serviceRef.current = value;
    // flushSync so the service write cannot re-render step 1 mid VT update.
    flushSync(() => setService(value));
    setStepChrome(2);
  };

  const controlFor = (dir: string) => {
    const root = hub.current;
    if (!root) return null;
    if (dir === 'up' || dir === 'back') return root.querySelector<HTMLElement>('.arrow-back');
    if (dir === 'home') return root.querySelector<HTMLElement>('.contact-home');
    return root.querySelector<HTMLElement>(`.arrow-pill[data-dir="${dir}"]`);
  };

  const activateDir = (dir: string) => {
    const s = stepRef.current;
    if (dir === 'up' || dir === 'back') {
      go(-1, s);
      return;
    }
    if (s === 1 && (dir === 'left' || dir === 'right' || dir === 'down')) {
      controlFor(dir)?.click();
      return;
    }
    if ((s === 2 || s === 3) && dir === 'down') {
      go(1, s);
      return;
    }
    if (s === 4 && (dir === 'down' || dir === 'home')) {
      goHome();
    }
  };

  useEffect(() => {
    if (!open) return;

    const clearPress = () => {
      pressed.current?.classList.remove('is-pressed');
      pressed.current = null;
      pressKey.current = '';
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.altKey || e.ctrlKey) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        if (e.repeat) return;
        clearPress();
        close();
        return;
      }
      if (e.key === 'Tab' && panel.current) {
        const list = focusables(panel.current);
        if (!list.length) return;
        const i = list.indexOf(document.activeElement as HTMLElement);
        if (e.shiftKey) {
          if (i <= 0) {
            e.preventDefault();
            list[list.length - 1].focus();
          }
        } else if (i === list.length - 1 || i < 0) {
          e.preventDefault();
          list[0].focus();
        }
        return;
      }

      const s = stepRef.current;
      const inField = e.target instanceof Element && !!e.target.closest('input, textarea, [contenteditable="true"]');
      const navWhileTyping = e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Backspace' || e.key === 'Enter';
      if (inField && !navWhileTyping) return;
      if (inField && e.key === 'Enter' && e.shiftKey) return;
      if (inField && e.key === 'Backspace' && (e.target as HTMLInputElement | HTMLTextAreaElement).value) return;

      const map: Record<string, string | undefined> = {
        ArrowLeft: 'left',
        ArrowRight: 'right',
        ArrowUp: 'up',
        ArrowDown: 'down',
        Backspace: 'up',
        Enter: s === 4 ? 'home' : 'down',
      };
      const dir = map[e.key];
      if (!dir) return;
      if (s === 1 && (dir === 'left' || dir === 'right' || dir === 'down' || dir === 'up')) {
        /* ok */
      } else if ((s === 2 || s === 3) && (dir === 'up' || dir === 'down')) {
        /* ok */
      } else if (s === 4 && (dir === 'down' || dir === 'home' || dir === 'up')) {
        /* ok */
      } else return;

      e.preventDefault();
      if (e.repeat || pressKey.current || moving.current) return;
      const el = dir === 'home' ? controlFor('home') : controlFor(dir === 'up' ? 'up' : dir);
      if (!el || (el as HTMLButtonElement).disabled) return;
      pressKey.current = e.key;
      pressed.current?.classList.remove('is-pressed');
      pressed.current = el;
      el.classList.add('is-pressed');
      playSnick();
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (!pressKey.current || e.key !== pressKey.current) return;
      const key = pressKey.current;
      clearPress();
      const map: Record<string, string | undefined> = {
        ArrowLeft: 'left',
        ArrowRight: 'right',
        ArrowUp: 'up',
        ArrowDown: 'down',
        Backspace: 'up',
        Enter: stepRef.current === 4 ? 'home' : 'down',
      };
      const dir = map[key];
      if (dir) activateDir(dir);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      clearPress();
    };
  }, [open, close]);

  const stepAttr = step === 4 ? 'done' : String(step);
  // Keep step-1 chrome in the closed DOM so About → contact can morph into it.
  const showStep = open ? step : 1;
  const chrome = showStep >= 1 && showStep <= 3;
  const downLabel = showStep === 1 ? 'Other' : showStep === 2 ? 'Confirm' : 'Send';
  const downDisabled = showStep === 2 ? !project.trim() : showStep === 3 ? !email.trim() : false;

  return createPortal(
    <div
      ref={panel}
      className={`contact-panel${open ? '' : ' is-closed'}`}
      data-contact=""
      data-state={open ? 'open' : 'closed'}
      data-step={stepAttr}
      role="dialog"
      aria-modal={open ? true : undefined}
      aria-hidden={open ? undefined : true}
      aria-labelledby="contact-title"
      inert={open ? undefined : true}
    >
      <h2 id="contact-title" className="sr-only">
        Contact
      </h2>
      <form
        ref={hub}
        className="arrow-nav contact-hub is-controls"
        data-contact-hub=""
        data-chrome-vt={open && chrome ? '' : undefined}
        noValidate
        onSubmit={(e) => e.preventDefault()}
      >
        <p className="sr-only" aria-live="polite" data-contact-live="">
          {live}
        </p>
        <div className="arrow-stage">
          {chrome && (
            <>
              <button
                type="button"
                className="arrow-back"
                aria-label="Back"
                data-contact-back={step > 1 ? '' : undefined}
                onClick={() => go(-1)}
              >
                {BACK_SVG}
              </button>
              <div className="arrow-slot">
                {/* Persistent slots: syncStep toggles [hidden] inside the VT update. */}
                <div className="contact-center" data-contact-center="">
                  <div className="arrow-face" data-nav-face="" data-contact-step="1" hidden={showStep !== 1}>
                    <div className="arrow-face-scale">
                      <span className="arrow-face-plate" aria-hidden="true" />
                      <ContactFace />
                    </div>
                  </div>
                  <div
                    className="contact-field"
                    data-contact-field=""
                    data-contact-step="2"
                    ref={field}
                    hidden={showStep !== 2}
                  >
                    <label className="sr-only" htmlFor="contact-project">
                      Describe your project
                    </label>
                    <textarea
                      ref={text}
                      id="contact-project"
                      name="project"
                      rows={1}
                      placeholder="Describe your project..."
                      value={project}
                      onChange={() => {}}
                      onInput={(e) => setProject(e.currentTarget.value)}
                    />
                  </div>
                  <div className="contact-field" data-contact-step="3" hidden={showStep !== 3}>
                    <label className="sr-only" htmlFor="contact-email">
                      Add your email
                    </label>
                    <input
                      ref={emailRef}
                      id="contact-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      placeholder="name@mail.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </div>

                {SERVICES.filter((s) => s.dir !== 'down').map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    className="arrow-pill"
                    data-dir={s.dir}
                    data-service={s.value}
                    data-contact-step="1"
                    hidden={showStep !== 1}
                    onClick={() => pickService(s.value)}
                  >
                    {s.label}
                  </button>
                ))}

                <button
                  type="button"
                  className="arrow-pill"
                  data-dir="down"
                  data-contact-down=""
                  data-service={showStep === 1 ? 'Other' : undefined}
                  data-contact-next={showStep > 1 ? '' : undefined}
                  disabled={downDisabled}
                  onClick={() => {
                    if (showStep === 1) pickService('Other');
                    else go(1);
                  }}
                >
                  {downLabel}
                </button>
              </div>
            </>
          )}

          {showStep === 4 && (
            <div className="contact-done-stack">
              <p className="contact-done" data-contact-msg="" ref={msgRef} tabIndex={-1}>
                {msg}
              </p>
              <button type="button" className="arrow-pill contact-home" onClick={goHome}>
                Go home
              </button>
            </div>
          )}
        </div>
      </form>
    </div>,
    document.body,
  );
}
