import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end smoke test over the real stack. It deliberately does *not* start the servers: the API
 * and the SPA are expected to be running already, so the test exercises exactly what a reviewer
 * sees in a browser.
 *
 *   dotnet run --project src/NineCube.Api      # http://127.0.0.1:5080
 *   cd web && npm run dev                      # http://127.0.0.1:5173
 *   cd web && NINECUBE_SEED_PASSWORD='<demo password>' npm run e2e
 *
 * The demo password is not defaulted anywhere, so no credential is committed; the spec skips itself
 * with an explanation when the variable is missing.
 */
export default defineConfig({
  testDir: './e2e',
  // Every page of the real catalogue is backed by real SQL Server and has measured ~26 s on this box
  // (see the environment caveat in FIX_REPORT.md), so an assertion that waits for loaded data needs a
  // budget of its own and a scroll-animated page needs room to finish before teardown. Specs that
  // want a tighter bound can lower it again locally.
  timeout: 300_000,
  expect: { timeout: 90_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }]
});
