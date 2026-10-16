import { useEffect, useState } from 'react';

type Theme = 'system' | 'light' | 'dark';
export function ThemeControls() {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem('ninecube-theme');
      if (saved === 'light' || saved === 'dark') return saved;
    } catch { /* Browser storage may be disabled. */ }
    return 'system';
  });
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.dataset.theme = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme;
    };
    apply();
    try { localStorage.setItem('ninecube-theme', theme); } catch { /* Keep the current session usable. */ }
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
  return (
    <div className="theme-controls nav-control" role="group" aria-label="Colour theme">
      {(['system', 'light', 'dark'] as const).map((option) => (
        <button key={option} type="button" className="theme-control" aria-pressed={theme === option}
          aria-label={`${option[0].toUpperCase()}${option.slice(1)} theme`}
          title={option === 'system' ? 'Follow your device theme' : `Use ${option} theme`}
          onClick={() => setTheme(option)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {option === 'system' ? <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></>
              : option === 'light' ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>
              : <path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2Z" />}
          </svg>
        </button>
      ))}
    </div>
  );
}
