
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Drawer } from 'vaul';
import { typePx } from '../lib/type-scale';

const TITLES: Record<number, string> = { 1: 'Pick a service', 2: 'Describe your project', 3: 'Add your email' };
const SERVICES = ['Physical Build', 'Digital Build', 'Other'];
const THANKS = 'Thank you, i’ll be in touch shortly!';

export default function ContactDrawer({ email: address }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [service, setService] = useState('');
  const [project, setProject] = useState('');
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState(THANKS);
  const [live, setLive] = useState('');
  const opener = useRef<HTMLElement | null>(null);
  const text = useRef<HTMLTextAreaElement>(null);
  const field = useRef<HTMLDivElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const msgRef = useRef<HTMLParagraphElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const lines = useRef(0);

  const announce = (t: string) => {
    setLive('');
    requestAnimationFrame(() => setLive(t));
  };

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const t = (e.target as Element).closest<HTMLElement>('[data-contact-open]');
      if (!t) return;
      e.preventDefault();
      opener.current = t;
      const preset = t.getAttribute('data-contact-service');
      setProject('');
      setEmail('');
      setMsg(THANKS);
      lines.current = 0;
      if (text.current) text.current.style.height = '';
      const next = preset && SERVICES.includes(preset) ? 2 : 1;
      if (preset && SERVICES.includes(preset)) setService(preset);
      else setService('');
      setStep(next);
      setOpen(true);
      announce(`Contact. Step ${next} of 3: ${TITLES[next]}`);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('is-contact-open', open);

    if (!open) opener.current?.focus({ preventScroll: true });
    if (!open && step === 4) {
      const t = setTimeout(reset, 500);
      return () => clearTimeout(t);
    }
  }, [open]);

  const reset = () => {
    setStep(1);
    setService('');
    setProject('');
    setEmail('');
    setMsg(THANKS);
    lines.current = 0;
    if (text.current) text.current.style.height = '';
  };

  const measure = useCallback(() => {
    const el = text.current;
    const box = field.current;
    if (!el || !box) return;
    const lh = parseFloat(getComputedStyle(el).lineHeight) || typePx('lh');
    const before = el.getBoundingClientRect().top;
    el.style.height = `${lh}px`;
    const n = Math.max(1, Math.round(el.scrollHeight / lh));
    const max = Math.max(1, Math.floor(box.clientHeight / lh));
    const shown = Math.min(n, max);
    el.style.height = `${shown * lh}px`;
    box.classList.toggle('is-multi', n > 1);
    box.classList.toggle('is-full', n > max);
    if (n <= max) el.scrollTop = 0;
    else if (el.selectionEnd === el.value.length) el.scrollTop = el.scrollHeight;
    if (lines.current && shown !== Math.min(lines.current, max) && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const d = before - el.getBoundingClientRect().top;
      if (d) el.animate([{ transform: `translateY(${d}px)` }, { transform: 'none' }], { duration: 240, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
    }
    lines.current = n;
  }, []);
  useLayoutEffect(() => {
    if (open && step === 2) measure();
  }, [project, step, open]);
  useEffect(() => {
    const r = () => step === 2 && measure();
    addEventListener('resize', r);
    return () => removeEventListener('resize', r);
  }, [step]);

  const focusStep = (s = step) => {
    const el =
      s === 2 ? text.current : s === 3 ? emailRef.current : s === 1 ? form.current?.querySelector<HTMLElement>('[data-service]') : msgRef.current;
    el?.focus({ preventScroll: true });
  };
  useEffect(() => {
    if (open) requestAnimationFrame(() => focusStep());
  }, [step]);

  const filled = (s = step) =>
    s === 1 ? !!service : s === 2 ? !!project.trim() : s === 3 ? !!email && !!emailRef.current?.checkValidity() : false;

  const send = async () => {
    setStep(4);
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ service, project: project.trim(), email: email.trim() }),
      });
      if (!res.ok) throw new Error(String(res.status));
      announce(THANKS);
    } catch {
      const m = `That didn’t go through. Please email ${address} instead.`;
      setMsg(m);
      announce(m);
    }
  };
  const go = (dir: 1 | -1, s = step, ok = filled()) => {
    if (dir === 1 && !ok) return;
    if (dir === 1 && s === 3) return void send();
    const n = Math.min(3, Math.max(1, s + dir));
    setStep(n);
    announce(`Step ${n} of 3: ${TITLES[n]}`);
  };

  const controls = step >= 2 && step <= 3;
  const stepAttr = step === 4 ? 'done' : String(step);

  return (
    <Drawer.Root open={open} onOpenChange={setOpen} noBodyStyles repositionInputs>
      <Drawer.Portal>
        <Drawer.Overlay className="contact-backdrop" />
        <Drawer.Content
          className="contact-panel"
          data-contact=""
          data-no-letter=""
          data-step={stepAttr}
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            focusStep();
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            opener.current?.focus({ preventScroll: true });
          }}
        >
          <Drawer.Title className="sr-only">Contact</Drawer.Title>
          <form
            ref={form}
            noValidate
            onSubmit={(e) => e.preventDefault()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && controls) {
                e.preventDefault();
                go(1);
              }
            }}
          >
            <p className="sr-only" aria-live="polite" data-contact-live>{live}</p>
            <section className="contact-step" data-step="1" hidden={step !== 1}>
              <p className="contact-q is-muted" id="contact-q1">Pick a service</p>
              <div className="contact-options" role="group" aria-labelledby="contact-q1">
                {SERVICES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    data-service={s}
                    className={service === s ? 'is-picked' : undefined}
                    onClick={() => {
                      setService(s);
                      go(1, 1, true);
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </section>
            <section className="contact-step" data-step="2" hidden={step !== 2}>
              <label className={`contact-q${project.trim() ? ' is-muted' : ''}`} htmlFor="contact-project">Describe your project</label>
              <div className="contact-field" data-contact-field ref={field}>
                <textarea
                  ref={text}
                  id="contact-project"
                  name="project"
                  rows={1}
                  placeholder="Type here..."
                  value={project}
                  onChange={() => {}}
                  onInput={(e) => setProject(e.currentTarget.value)}
                />
              </div>
            </section>
            <section className="contact-step" data-step="3" hidden={step !== 3}>
              <label className={`contact-q${email ? ' is-muted' : ''}`} htmlFor="contact-email">Add your email</label>
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
            </section>
            <section className="contact-step" data-step="done" hidden={step !== 4}>
              <p className="contact-done" data-contact-msg ref={msgRef} tabIndex={-1}>{msg}</p>
            </section>
            <div className={`contact-nav${controls ? ' has-controls' : ''}`} data-contact-nav inert={!controls}>
              <button type="button" className="contact-back" data-contact-back onClick={() => go(-1)}>Back</button>
              <span className="contact-dots" aria-hidden="true">
                {[1, 2, 3].map((i) => <i key={i} className={i === step ? 'is-on' : undefined} />)}
              </span>
              <button type="button" className="contact-next" data-contact-next disabled={!filled()} onClick={() => go(1)}>
                {step === 3 ? 'Send' : 'Next'}
              </button>
            </div>
          </form>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
