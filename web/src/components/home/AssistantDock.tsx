import { useEffect, useRef, useState } from 'react';
import { t, useLanguage } from '../../i18n/language';
import { useAuth } from '../../state/AuthContext';
import { Icon } from '../Icon';
import { AssistantStage } from './HomeAssistant';

const HINT_LIFETIME_MS = 8000;

/**
 * The public assistant launcher on the home page: a floating corner button with a "Chat with me"
 * hint, gentle motion, and a panel that opens the live assistant stage for guests and customers
 * alike. For signed-in customers the launcher stacks above the support chat button so the two
 * corners never collide.
 */
export function AssistantDock() {
  useLanguage();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [hintVisible, setHintVisible] = useState(true);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Position state with localStorage persistence, synchronized with CommerceCopilot
  const [pos, setPos] = useState<{ x: number; y: number } | null>(() => {
    try {
      const saved = localStorage.getItem('ninecube:copilot-pos');
      if (saved) return JSON.parse(saved);
    } catch {}
    return null;
  });

  const dragRef = useRef<{
    startX: number;
    startY: number;
    startLeft: number;
    startTop: number;
    isDragging: boolean;
    hasMoved: boolean;
  } | null>(null);

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    const btn = e.currentTarget;
    const rect = btn.getBoundingClientRect();
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startLeft: rect.left,
      startTop: rect.top,
      isDragging: true,
      hasMoved: false,
    };
    if (typeof btn.setPointerCapture === 'function') {
      try {
        btn.setPointerCapture(e.pointerId);
      } catch {}
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || !drag.isDragging) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.hasMoved && Math.hypot(dx, dy) > 5) {
      drag.hasMoved = true;
      setHintVisible(false);
    }
    if (drag.hasMoved) {
      const maxX = Math.max(10, window.innerWidth - 64);
      const maxY = Math.max(10, window.innerHeight - 64);
      const newX = Math.min(maxX, Math.max(10, drag.startLeft + dx));
      const newY = Math.min(maxY, Math.max(10, drag.startTop + dy));
      setPos({ x: newX, y: newY });
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (typeof e.currentTarget.releasePointerCapture === 'function') {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
    }
    if (!drag.hasMoved) {
      setOpen(true);
      setHintVisible(false);
    } else if (pos) {
      try {
        localStorage.setItem('ninecube:copilot-pos', JSON.stringify(pos));
      } catch {}
    }
    dragRef.current = null;
  };

  useEffect(() => {
    const timer = window.setTimeout(() => setHintVisible(false), HINT_LIFETIME_MS);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  return (
    <div
      className={`assistant-dock${user ? ' assistant-dock--above' : ''}`}
      data-testid="assistant-dock"
      style={pos ? { position: 'fixed', left: `${pos.x}px`, top: `${pos.y}px`, bottom: 'auto', right: 'auto' } : undefined}
    >
      {open ? (
        <section className="assistant-panel card-glass" role="dialog" aria-label={t('Ask the store assistant')}>
          <header className="assistant-panel__head">
            <div>
              <span className="assistant-panel__kicker">
                <span className="home-assistant__live" aria-hidden="true" />
                <Icon name="spark" width={13} height={13} /> {t('AI assistant')}
              </span>
              <strong>{t('Ask the store assistant')}</strong>
            </div>
            <button type="button" ref={closeRef} className="assistant-panel__close" onClick={() => setOpen(false)} aria-label={t('Close chat')}>
              <Icon name="x" width={16} height={16} />
            </button>
          </header>
          <div className="assistant-panel__body">
            <AssistantStage />
          </div>
        </section>
      ) : null}

      {!open ? (
        <div className="assistant-dock__entry">
          {hintVisible ? (
            <span className="assistant-dock__hint" data-testid="assistant-hint">{t('Chat with me')}</span>
          ) : null}
          <button
            type="button"
            className="assistant-launcher"
            style={{ touchAction: 'none' }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            aria-label={t('Chat with me')}
          >
            <Icon name="spark" width={24} height={24} />
            <span className="assistant-launcher__ring" aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
