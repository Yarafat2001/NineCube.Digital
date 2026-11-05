import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

interface RevealProps {
  children: ReactNode;
  /** Extra stagger in ms so neighbouring sections do not all move at once. */
  delay?: number;
  className?: string;
}

/**
 * Fades a section up the first time it scrolls into view, then leaves it alone.
 * Under prefers-reduced-motion the observer never runs and the content is visible immediately.
 */
export function Reveal({ children, delay = 0, className }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const reduced =
      typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || typeof IntersectionObserver === 'undefined') {
      setShown(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setShown(true);
            observer.disconnect();
          }
        });
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.04 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const style: CSSProperties | undefined = delay ? { transitionDelay: `${delay}ms` } : undefined;

  return (
    <div
      ref={ref}
      className={`reveal${className ? ` ${className}` : ''}`}
      style={style}
      data-revealed={shown || undefined}
    >
      {children}
    </div>
  );
}
