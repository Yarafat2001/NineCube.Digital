import { expect, test, type Page } from '@playwright/test';

/**
 * The showcase, in a real browser at the four widths the brief names.
 *
 * What is asserted here is what a test can honestly assert about a canvas animation: the scene
 * really starts (a live WebGL context, not a stub), all nine card images are fetched, the title
 * timeline lands where the reference calibration puts it, the footer blends to dark, the page never
 * grows a horizontal scrollbar, and nothing is logged to the console. The composition itself - the
 * bent cards, the two guide lines, and the 3x2 / 2x3 / 1x6 closing grid - is captured as a
 * screenshot artifact for each width and checked by eye against VALIDATION.md, because pixels are
 * the only honest oracle for it.
 *
 * It reuses the running dev server and needs no credentials: everything on this route is public.
 */
const viewports = [
  { name: '1440', width: 1440, height: 900 },
  { name: '1024', width: 1024, height: 768 },
  { name: '768', width: 768, height: 1024 },
  { name: '390', width: 390, height: 844 }
];

/** Mirrors how the scene measures itself: the track's start and its scrollable span. */
async function trackGeometry(page: Page) {
  return page.evaluate(() => {
    const intro = document.querySelector('#introTrack') as HTMLElement;
    const track = document.querySelector('#track') as HTMLElement;
    return {
      trackTop: intro.getBoundingClientRect().top + window.scrollY + intro.offsetHeight,
      span: track.offsetHeight - window.innerHeight
    };
  });
}

/** Scrolls to a fraction of the track and waits for the eased follow to settle. */
async function scrollToProgress(page: Page, progress: number) {
  const { trackTop, span } = await trackGeometry(page);
  await page.evaluate((y) => window.scrollTo(0, Math.round(y)), trackTop + progress * span);
  await page.waitForTimeout(1400);
}

function collectProblems(page: Page): string[] {
  const problems: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console.error: ${message.text()}`);
  });
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('requestfailed', (request) => {
    const failure = request.failure()?.errorText ?? '';
    if (request.url().includes('hot-update') || request.url().includes('ws')) return;
    if (failure.includes('ERR_ABORTED')) return;
    problems.push(`request failed: ${request.method()} ${request.url()} - ${failure}`);
  });

  return problems;
}

test.describe('showcase', () => {
  test('renders mixed formats and transparent textures without asset or shader failures', async ({ page }) => {
    const problems = collectProblems(page);
    // A transparent PNG fixture generated with the browser's native canvas API.
    const png = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 64; canvas.height = 128;
      const context = canvas.getContext('2d')!;
      context.fillStyle = 'rgba(245,151,38,0.5)';
      context.fillRect(8, 8, 48, 112);
      return canvas.toDataURL('image/png').split(',')[1];
    });
    await page.route('**/assets/assets.json', route => route.fulfill({ json: {
      files: ['work-01.svg', 'photo-01.jpg', 'mixed-transparent.png', 'mixed-transparent.webp', 'mixed-portrait.jpeg']
    } }));
    await page.route('**/assets/mixed-transparent.png', route => route.fulfill({ contentType: 'image/png', body: Buffer.from(png, 'base64') }));
    await page.route('**/assets/mixed-transparent.webp', route => route.fulfill({ contentType: 'image/webp', path: 'public/products/48.webp' }));
    await page.route('**/assets/mixed-portrait.jpeg', route => route.fulfill({ contentType: 'image/jpeg', path: 'public/assets/photo-04.jpg' }));
    await page.goto('/');
    await expect(page.locator('#scene')).toBeVisible();
    await scrollToProgress(page, .45);
    await page.screenshot({ path: 'artifacts/showcase-mixed-formats-helix.png' });
    await scrollToProgress(page, .99);
    await page.screenshot({ path: 'artifacts/showcase-mixed-formats-closing.png' });
    expect(problems).toEqual([]);
  });
  for (const viewport of viewports) {
    test(`runs, times and blends correctly at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const problems = collectProblems(page);

      await page.goto('/');

      const canvas = page.locator('#scene');
      await expect(canvas).toBeVisible();

      // A real context, not a placeholder: this is what distinguishes the scene from its fallback.
      expect(
        await page.evaluate(() => {
          const element = document.querySelector('#scene') as HTMLCanvasElement;
          return Boolean(element.getContext('webgl2') ?? element.getContext('webgl'));
        })
      ).toBe(true);

      // No local asset may be missing: every card texture must have been requested successfully.
      const cardRequests = await page.evaluate(() =>
        performance
          .getEntriesByType('resource')
          .filter((entry) => /\/assets\/photo-\d+\.jpg$/i.test(entry.name)).length
      );
      expect(cardRequests).toBeGreaterThanOrEqual(9);

      // It opens on the hero, not halfway down the track, even after a deep-link reload.
      expect(await page.evaluate(() => window.scrollY)).toBeLessThanOrEqual(1);

      // The transition title appears and clears before the editorial titles take over.
      await scrollToProgress(page, 0.08);
      await expect
        .poll(() => page.evaluate(() => Number((document.querySelector('#transitionTitle') as HTMLElement).style.opacity)))
        .toBeGreaterThan(0.2);
      const preview = page.getByTestId('category-preview');
      expect(await preview.evaluate(el => Number(getComputedStyle(el).opacity))).toBeGreaterThan(.9);
      expect(await preview.locator('img').evaluateAll(images => images.every(img => (img as HTMLImageElement).naturalWidth > 0))).toBe(true);
      await page.screenshot({ path: `artifacts/showcase-${viewport.name}-intro.png` });

      // `DESIGN +` enters from the left while `MOTION` enters from the right.
      const readTitles = () =>
        page.evaluate(() => {
          const read = (selector: string) => {
            const element = document.querySelector(selector) as HTMLElement;
            return {
              opacity: Number(element.style.opacity),
              x: Number(/(-?[\d.]+)vw/.exec(element.style.transform)?.[1] ?? NaN)
            };
          };

          return { line1: read('.line1'), line2: read('.line2') };
        });

      await scrollToProgress(page, 0.15);
      const entering = await readTitles();
      expect(entering.line1.x).toBeLessThan(-1); // travelling in from the left
      expect(entering.line2.x).toBeGreaterThan(1); // ...and from the right
      expect(entering.line1.opacity).toBeGreaterThan(0);

      // They then hold, centred, before exiting outward again.
      await scrollToProgress(page, 0.3);
      const holding = await readTitles();
      expect(holding.line1.opacity).toBeGreaterThan(0.5);
      expect(holding.line2.opacity).toBeGreaterThan(0.5);
      expect(Math.abs(holding.line1.x)).toBeLessThan(2);
      expect(Math.abs(holding.line2.x)).toBeLessThan(2);
      expect(await preview.evaluate(el => Number(getComputedStyle(el).opacity))).toBeGreaterThan(.9);
      await page.screenshot({ path: `artifacts/showcase-${viewport.name}-editorial.png` });

      // Mid-travel: the nine cards wrapped around the curve, with the guide lines running the
      // other way. Captured as an artifact so the geometry can be checked against the reference.
      await scrollToProgress(page, 0.45);
      expect(await preview.evaluate(el => Number(getComputedStyle(el).opacity))).toBeLessThan(.05);
      await page.screenshot({ path: `artifacts/showcase-${viewport.name}-helix.png` });

      // Both titles clear the frame before the closing grid resolves. The reference exits them
      // sideways (roughly 86vw past their entrance) rather than fading them, so displacement is the
      // property that matters: at this point neither can overlap the grid.
      await scrollToProgress(page, 0.8);
      const exited = await readTitles();
      expect(Math.abs(exited.line1.x)).toBeGreaterThan(50);
      expect(Math.abs(exited.line2.x)).toBeGreaterThan(50);

      // The closing composition, captured for the eye check against VALIDATION.md.
      await scrollToProgress(page, 0.99);
      await page.screenshot({ path: `artifacts/showcase-${viewport.name}-closing.png` });

      // The footer reverse-blends light to dark, and the CTA continues the journey.
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await expect
        .poll(() => page.evaluate(() => getComputedStyle(document.querySelector('#outro') as HTMLElement).backgroundColor))
        .toBe('rgb(10, 15, 31)');
      await expect(page.getByRole('link', { name: /open the catalogue/i })).toBeVisible();
      await page.screenshot({ path: `artifacts/showcase-${viewport.name}-footer.png` });

      // The editorial titles travel tens of viewports wide; the document must stay put.
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `horizontal overflow of ${overflow}px`).toBeLessThanOrEqual(1);

      expect(problems, `browser problems at ${viewport.width}px`).toEqual([]);
    });
  }

  test('mounts and disposes cleanly on navigation, including a second visit', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('#scene')).toBeVisible();
    await expect(page.locator('body')).toHaveClass(/showcase-active/);

    // SPA navigation away: the canvas and the scroll takeover must both go.
    // Scoped to the header, because the showcase page carries its own "Sign in" link further down.
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Sign in' }).click();
    await expect(page.getByRole('heading', { name: /^sign in$/i })).toBeVisible();
    await expect(page.locator('body')).not.toHaveClass(/showcase-active/);
    expect(await page.locator('#scene').count()).toBe(0);
    expect(await page.evaluate(() => window.history.scrollRestoration)).toBe('auto');

    // ...and the next visit still gets a working context, which is what proves the first one was
    // released rather than leaked.
    await page.locator('.navbar__brand').click();
    await expect(page.locator('#scene')).toBeVisible();
    expect(
      await page.evaluate(() => {
        const element = document.querySelector('#scene') as HTMLCanvasElement;
        return Boolean(element.getContext('webgl2') ?? element.getContext('webgl'));
      })
    ).toBe(true);
    expect(await page.evaluate(() => window.scrollY)).toBeLessThanOrEqual(1);
  });

  test('falls back to the static grid when the visitor prefers reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');

    await expect(page.getByTestId('showcase-fallback-reason')).toContainText(/reduced motion/i);
    await expect(page.getByRole('list').getByRole('listitem')).toHaveCount(9);
    expect(await page.locator('#scene').count()).toBe(0);
    await expect(page.getByRole('link', { name: /open the catalogue/i })).toBeVisible();
  });

  test('falls back to the static grid when WebGL is unavailable', async ({ page }) => {
    await page.addInitScript(() => {
      HTMLCanvasElement.prototype.getContext = () => null;
      // @ts-expect-error the probe checks for these interfaces before touching the canvas.
      delete window.WebGLRenderingContext;
      // @ts-expect-error see above.
      delete window.WebGL2RenderingContext;
    });

    await page.goto('/');

    await expect(page.getByTestId('showcase-fallback-reason')).toContainText(/webgl/i);
    await expect(page.getByRole('list').getByRole('listitem')).toHaveCount(9);
    expect(await page.locator('#scene').count()).toBe(0);
  });
});
