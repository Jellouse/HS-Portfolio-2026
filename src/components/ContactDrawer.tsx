import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { isTypingTarget } from '../lib/browser';
import { canChromeVt, reduceMotion, runChromeVt } from '../lib/chrome-vt';
import { contactChoiceRows, contactService, isContactPreset } from '../lib/contact-services';
import { typePx } from '../lib/type-scale';
import { playSnick } from '../scripts/ui-sound';

const TITLES: Record<number, string> = {
  1: 'What can i help you with?',
  2: 'Describe your project',
  3: 'Add your email',
};
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

type Answers = { service: string; project: string; email: string };

const EMPTY: Answers = { service: '', project: '', email: '' };

function focusables(root: HTMLElement) {
  return [...root.querySelectorAll<HTMLElement>('button:not([disabled]), textarea, input, a[href]')].filter(
    (el) => el.offsetParent !== null && !el.closest('[hidden]'),
  );
}

function syncPanel(el: HTMLElement | null, open: boolean, step: number, answers: Answers = EMPTY) {
  if (!el) return;
  el.classList.toggle('is-closed', !open);
  el.dataset.state = open ? 'open' : 'closed';
  el.setAttribute('aria-hidden', open ? 'false' : 'true');
  if (open) el.setAttribute('aria-modal', 'true');
  else el.removeAttribute('aria-modal');
  document.documentElement.classList.toggle('is-contact-open', open);
  syncStep(el, step, answers);
}

function syncStep(el: HTMLElement | null, step: number, answers: Answers = EMPTY) {
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
    const label = step === 1 ? 'Next' : step === 2 ? 'Confirm' : 'Send';
    if (down.textContent !== label) down.textContent = label;
    const disabled =
      step === 1
        ? !answers.service
        : step === 2
          ? !answers.project.trim()
          : step === 3
            ? !answers.email.trim()
            : false;
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
  const panel = useRef<HTMLDivElement>(null);
  const hub = useRef<HTMLFormElement>(null);
  const text = useRef<HTMLTextAreaElement>(null);
  const field = useRef<HTMLDivElement>(null);
  const emailInput = useRef<HTMLInputElement>(null);
  const msgRef = useRef<HTMLParagraphElement>(null);
  const lines = useRef(0);
  const pressed = useRef<HTMLElement | null>(null);
  const pressKey = useRef('');
  const stepRef = useRef(step);
  const serviceRef = useRef(service);
  const projectRef = useRef(project);
  const emailValue = useRef(email);
  const moving = useRef(false);
  stepRef.current = step;
  serviceRef.current = service;
  projectRef.current = project;
  emailValue.current = email;

  const answersNow = (): Answers => ({
    service: serviceRef.current,
    project: projectRef.current,
    email: emailValue.current,
  });

  const announce = (t: string) => {
    setLive('');
    requestAnimationFrame(() => setLive(t));
  };

  const setStepChrome = (next: number) => {
    const from = stepRef.current;
    if (next === from) return;
    const answers = answersNow();
    const run = () => {
      stepRef.current = next;
      flushSync(() => setStep(next));
      syncStep(panel.current, next, answers);
    };
    if (next === 4 || from === 4 || !canChromeVt()) {
      run();
      if (next >= 1 && next <= 3) announce(`Step ${next} of 3: ${TITLES[next]}`);
      return;
    }
    panel.current?.classList.add('is-entered');
    moving.current = true;
    void runChromeVt(run, { flag: 'contact' }).finally(() => {
      moving.current = false;
      focusStep(next);
      if (next >= 1 && next <= 3) announce(`Step ${next} of 3: ${TITLES[next]}`);
    });
  };

  const close = useCallback(() => {
    const el = panel.current;
    const finish = () => {
      flushSync(() => setOpen(false));
      syncPanel(panel.current, false, stepRef.current, answersNow());
    };
    if (!el || reduceMotion() || !el.classList.contains('is-entered')) {
      finish();
      return;
    }
    const anim = el.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 200,
      easing: 'cubic-bezier(0.23, 1, 0.32, 1)',
      fill: 'both',
    });
    anim.finished.then(finish, finish);
  }, []);

  const goHome = () => {
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
      const preset = contactService(t.getAttribute('data-contact-service'));
      lines.current = 0;
      if (text.current) text.current.style.height = '';
      const next = isContactPreset(preset) ? 2 : 1;
      serviceRef.current = isContactPreset(preset) ? preset : '';
      flushSync(() => {
        setService(isContactPreset(preset) ? preset : '');
        setProject('');
        setEmail('');
        setMsg(THANKS);
      });
      stepRef.current = next;
      flushSync(() => {
        setStep(next);
        setOpen(true);
      });
      syncPanel(panel.current, true, next, {
        service: isContactPreset(preset) ? preset : '',
        project: '',
        email: '',
      });
      announce(`Contact. Step ${next} of 3: ${TITLES[next]}`);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-contact-ready', '');
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
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const el = panel.current;
    if (!el) return;
    el.getAnimations().forEach((anim) => anim.cancel());
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
    if (!open || !hub.current) return;
    const root = hub.current;
    const onDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const el = (event.target as Element).closest<HTMLElement>('.arrow-pill, .arrow-back, .contact-option');
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

  const optionEls = () =>
    [...(hub.current?.querySelectorAll<HTMLElement>('.contact-option') ?? [])].filter((el) => el.offsetParent !== null);

  const focusStep = (s = step) => {
    const el =
      s === 2
        ? text.current
        : s === 3
          ? emailInput.current
          : s === 1
            ? hub.current?.querySelector<HTMLElement>(`[data-service="${serviceRef.current}"]`) ?? optionEls()[0]
            : s === 4
              ? msgRef.current
              : hub.current?.querySelector<HTMLElement>('.arrow-back');
    el?.focus({ preventScroll: true });
  };

  useEffect(() => {
    if (open && !moving.current) requestAnimationFrame(() => focusStep());
  }, [step, open]);

  const send = () => {
    const svc = serviceRef.current;
    const proj = projectRef.current.trim();
    const mail = emailValue.current.trim();
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

  const isFilled = (s = stepRef.current) => {
    if (s === 1) return !!serviceRef.current;
    if (s === 2) return !!projectRef.current.trim();
    if (s === 3) return !!emailValue.current && !!emailInput.current?.checkValidity();
    return false;
  };

  const go = (dir: 1 | -1, s = stepRef.current, ok = isFilled(s)) => {
    if (moving.current) return;
    if (dir === -1 && s === 1) {
      close();
      return;
    }
    if (dir === 1 && !ok) return;
    if (dir === 1 && s === 3) return void send();
    setStepChrome(Math.min(3, Math.max(1, s + dir)));
  };

  const pickService = (value: string) => {
    if (moving.current) return;
    serviceRef.current = value;
    if (service !== value) flushSync(() => setService(value));
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
    if (s === 1) {
      if (dir === 'down') controlFor('down')?.click();
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

  // Sideways along a row, up and down between rows, always the closest button in the row above or below.
  const moveOption = (key: string) => {
    const list = optionEls();
    if (!list.length) return;
    const rowOf = (el: HTMLElement) => Number(el.dataset.row);
    const rows = [...new Set(list.map(rowOf))];
    const active = document.activeElement as HTMLElement | null;
    const at = active ? list.indexOf(active) : -1;
    if (at < 0) {
      (key === 'ArrowUp' || key === 'ArrowLeft' ? list[list.length - 1] : list[0]).focus();
      return;
    }
    const current = list[at];
    if (key === 'ArrowLeft' || key === 'ArrowRight') {
      const line = list.filter((el) => rowOf(el) === rowOf(current));
      const i = line.indexOf(current);
      const shift = key === 'ArrowLeft' ? -1 : 1;
      line[(i + shift + line.length) % line.length].focus();
      return;
    }
    const index = rows.indexOf(rowOf(current));
    const nextRow = rows[(index + (key === 'ArrowUp' ? -1 : 1) + rows.length) % rows.length];
    const line = list.filter((el) => rowOf(el) === nextRow);
    const box = current.getBoundingClientRect();
    const middle = box.left + box.width / 2;
    const distance = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      return Math.abs(r.left + r.width / 2 - middle);
    };
    line.reduce((best, el) => (distance(el) < distance(best) ? el : best), line[0]).focus();
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
      if (s === 1) {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          if (!e.repeat) moveOption(e.key);
          return;
        }
        if (e.key === 'Backspace') {
          e.preventDefault();
          if (!e.repeat) close();
        }
        return;
      }

      const inField = isTypingTarget(e.target);
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
      if ((s === 2 || s === 3) && (dir === 'up' || dir === 'down')) {
      } else if (s === 4 && (dir === 'down' || dir === 'home' || dir === 'up')) {
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
  const showStep = open ? step : 1;
  const downLabel = showStep === 1 ? 'Next' : showStep === 2 ? 'Confirm' : 'Send';
  const downDisabled =
    showStep === 1 ? !service : showStep === 2 ? !project.trim() : showStep === 3 ? !email.trim() : false;

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
        data-chrome-vt={open ? '' : undefined}
        noValidate
        onSubmit={(e) => e.preventDefault()}
      >
        <p className="sr-only" aria-live="polite" data-contact-live="">
          {live}
        </p>
        <div className="arrow-stage">
          {showStep <= 3 && (
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
                <div className="contact-center" data-contact-center="">
                  <section className="contact-ask" data-contact-step="1" hidden={showStep !== 1}>
                    <h3 className="contact-ask-title" id="contact-ask-title">
                      What can i help you with?
                    </h3>
                    <div className="contact-options" role="group" aria-labelledby="contact-ask-title">
                      {contactChoiceRows.map((row, index) => (
                        <div className="contact-options-row" key={index}>
                          {row.map((value) => (
                            <button
                              key={value}
                              type="button"
                              className="contact-option"
                              data-row={index}
                              data-service={value}
                              onClick={() => pickService(value)}
                              onFocus={() => {
                                if (serviceRef.current !== value) {
                                  serviceRef.current = value;
                                  setService(value);
                                }
                              }}
                            >
                              {value}
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  </section>
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
                      ref={emailInput}
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

                <button
                  type="button"
                  className="arrow-pill"
                  data-dir="down"
                  data-contact-down=""
                  disabled={downDisabled}
                  onClick={() => {
                    if (showStep === 1) {
                      if (service) pickService(service);
                    } else go(1);
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
