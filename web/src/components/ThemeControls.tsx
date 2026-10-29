import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { getLanguage, setLanguage, t, useLanguage, type Language } from '../i18n/language';

export function ThemeControls() {
  useLanguage();
  // Light is the default theme; no theme switcher remains in the UI. The inline
  // script in index.html sets this before hydration, and this effect keeps the
  // attribute correct after remounts and in tests.
  useEffect(() => {
    document.documentElement.dataset.theme = 'light';
  }, []);
  return <div className="theme-controls nav-control" role="group" aria-label={t('Language')}>
    <LanguageMenu />
  </div>;
}

function LanguageMenu() {
  const language = useLanguage();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>();
  const openedByHover = useRef(false);
  const clearClose = () => { if (closeTimer.current) clearTimeout(closeTimer.current); };
  const scheduleClose = () => { clearClose(); closeTimer.current = setTimeout(() => setOpen(false), 180); };
  const show = () => { clearClose(); setOpen(true); };
  const close = (focus = false) => { clearClose(); openedByHover.current = false; setOpen(false); if (focus) trigger.current?.focus(); };
  useEffect(() => () => clearClose(), []);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(224, window.innerWidth - 24);
      const height = panel.current?.offsetHeight ?? 180;
      const below = rect.bottom + 10;
      setPosition({ left: Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12)),
        top: below + height < window.innerHeight - 12 ? below : Math.max(12, rect.top - height - 10) });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panel.current?.contains(target) && !trigger.current?.contains(target)) close();
    };
    const escape = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); close(true); } };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true);
      document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape);
    };
  }, [open]);
  const select = (next: Language) => { setLanguage(next); close(true); };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const options = Array.from(panel.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? []);
    const index = options.indexOf(document.activeElement as HTMLButtonElement);
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1
        : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
      options[next]?.focus();
    }
  };
  return <div className="language-switch" onPointerEnter={event => {
    if (event.pointerType === 'mouse') { if (!open) openedByHover.current = true; show(); }
  }} onPointerLeave={scheduleClose}>
    <button ref={trigger} type="button" className="theme-control language-trigger" aria-label={t('Choose language')}
      title={t('Language')} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}
      data-language={getLanguage()} onClick={() => {
        if (openedByHover.current) { openedByHover.current = false; show(); }
        else open ? close() : show();
      }}
      onBlur={event => { if (!panel.current?.contains(event.relatedTarget as Node)) scheduleClose(); }}
      onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault(); show();
          requestAnimationFrame(() => {
            const options = panel.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]');
            options?.[event.key === 'ArrowUp' ? 1 : 0]?.focus();
          });
        }
      }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 8 6 6m-7 0 6-6 2-3H2m5-3h1m6 20 5-11 5 11m-8-4h6" transform="translate(-1 0)" /></svg>
    </button>
    {open && createPortal(<div ref={panel} id={id} role="menu" aria-label={t('Language')} className="language-menu"
      data-overlay-open="true" style={position} onKeyDown={onKeyDown} onPointerEnter={clearClose} onPointerLeave={scheduleClose}
      onFocus={clearClose} onBlur={event => {
        if (!panel.current?.contains(event.relatedTarget as Node) && event.relatedTarget !== trigger.current) close();
      }}>
      <p className="language-menu__heading">Language <span lang="bn">/ ভাষা</span></p>
      <button type="button" role="menuitemradio" aria-checked={language === 'en'} aria-label="English" onClick={() => select('en')}>
        <span className="language-menu__code" aria-hidden="true">EN</span><span lang="en">English</span><span className="language-menu__check" aria-hidden="true">{language === 'en' ? '✓' : ''}</span>
      </button>
      <button type="button" role="menuitemradio" aria-checked={language === 'bn'} aria-label="বাংলা" onClick={() => select('bn')}>
        <span className="language-menu__code" aria-hidden="true">বাং</span><span lang="bn">বাংলা</span><span className="language-menu__check" aria-hidden="true">{language === 'bn' ? '✓' : ''}</span>
      </button>
    </div>, document.body)}
  </div>;
}
