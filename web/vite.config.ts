import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const buildVersion = process.env.GITHUB_SHA ?? `${Date.now()}`;

// GitHub Pages serves the site from a /<repo>/ subpath, so production assets
// must be relative (import.meta.env.BASE_URL); local dev keeps root paths.
export default defineConfig(({ mode }) => ({
  plugins: [react(), {
    name: 'site-version',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: buildVersion }) });
    }
  }],
  define: { __APP_VERSION__: JSON.stringify(buildVersion) },
  base: mode === 'production' ? './' : '/',
  server: {
    port: 5173,
    strictPort: true,
    host: '127.0.0.1'
  },
  preview: {
    port: 4173,
    strictPort: true
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
    // A failed findByRole waits the full asyncUtilTimeout (5s); without a larger test timeout the
    // harness reports "timed out" instead of the real "element not found" message.
    testTimeout: 30000,
    // Playwright specs live in ./e2e and must not be picked up by Vitest.
    exclude: ['node_modules', 'dist', 'e2e']
  }
}));
