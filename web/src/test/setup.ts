import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './server';

// The suites run in parallel with the dev servers and the API on this machine, and a code-split
// route plus an MSW round trip can comfortably exceed the 1s default. Wait for elements rather
// than failing a test on machine load - a real hang still fails, just later. On a loaded Windows
// box the first lazy chunk alone has measured past 5s, so the budget is 10s.
configure({ asyncUtilTimeout: 10_000 });

// jsdom does not implement these, and the navbar uses them for the sliding highlight.
if (typeof window.ResizeObserver === 'undefined') {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false
  })) as unknown as typeof window.matchMedia;
}

if (!window.print) {
  window.print = () => {};
}

// jsdom reports window.scrollTo as "not implemented" (noise, not a failure). The showcase resets
// its scroll position on mount, so the stub keeps the suite output readable.
window.scrollTo = () => {};

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));

afterEach(() => {
  cleanup();
  server.resetHandlers();
  sessionStorage.clear();
  localStorage.clear();
});

afterAll(() => server.close());
