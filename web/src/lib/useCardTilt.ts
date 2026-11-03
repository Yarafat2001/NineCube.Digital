import { useEffect, useRef, type PointerEvent } from 'react';

/** No React state updates on pointermove. CSS owns touch and reduced-motion fallbacks. */
export function useCardTilt() {
  const frame = useRef<number>();
  const card = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!card.current || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        card.current?.setAttribute('data-revealed', 'true');
        observer.disconnect();
      }
    }, { threshold: .12 });
    observer.observe(card.current);
    return () => { observer.disconnect(); if (frame.current !== undefined) cancelAnimationFrame(frame.current); };
  }, []);
  const reset = (element: HTMLElement) => {
    if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    element.style.setProperty('--rx', '0deg'); element.style.setProperty('--ry', '0deg');
  };
  return {
    ref: card,
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      const element = event.currentTarget;
      if (event.pointerType === 'touch' || !window.matchMedia('(hover: hover) and (pointer: fine)').matches || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { reset(element); return; }

      // When the cursor is over interactive buttons or steppers, stabilize the card to prevent misclicks
      const target = event.target as HTMLElement | null;
      if (target?.closest('.product-card__actions, .product-card__footer, .stepper, button, a, input')) {
        reset(element);
        return;
      }

      const rect = element.getBoundingClientRect();
      const x = Math.max(-1, Math.min(1, (event.clientX - rect.left) / rect.width * 2 - 1));
      const y = Math.max(-1, Math.min(1, (event.clientY - rect.top) / rect.height * 2 - 1));
      if (frame.current !== undefined) cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => {
        // Option 2: Tamed micro-tilt capped at ±2.5° (down from ±8°) for comfortable, premium tactile response
        element.style.setProperty('--rx', `${(-y * 2.5).toFixed(2)}deg`);
        element.style.setProperty('--ry', `${(x * 2.5).toFixed(2)}deg`);
      });
    },
    onPointerLeave: (event: PointerEvent<HTMLElement>) => reset(event.currentTarget)
  };
}
