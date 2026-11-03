import { expect, test } from '@playwright/test';

test('gift card controls align and both views fit desktop and mobile', async ({ page }, testInfo) => {
  let lookups = 0;
  let releaseFirstLookup!: () => void;
  const firstLookup = new Promise<void>(resolve => { releaseFirstLookup = resolve; });
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (!path.startsWith('/api/')) return route.continue();
    if (path === '/api/gift-cards/validate') {
      lookups++;
      if (lookups === 1) await firstLookup;
      const { code } = route.request().postDataJSON();
      return route.fulfill({ json: code === 'GC-TEST-1000'
        ? { isValid: true, code, currentBalance: 1000, currency: 'BDT', recipientName: 'Preview recipient', reason: null }
        : { isValid: false, code, currentBalance: 0, currency: 'BDT', reason: 'Invalid or inactive gift card code.' } });
    }
    if (path === '/api/checkout/options') return route.fulfill({ json: { onlinePaymentsEnabled: false } });
    return route.fulfill({ json: [] });
  });
  const release = process.env.E2E_DEPLOYMENT_SHA;
  await page.goto(release ? `./?v=${encodeURIComponent(release)}#/gift-cards` : './#/gift-cards');
  if (release) {
    const version = await page.request.get(new URL(`version.json?check=${Date.now()}`, testInfo.project.use.baseURL).href);
    expect((await version.json()).version).toBe(release);
  }
  const gift = page.locator('.gift-page');
  await expect(gift.getByRole('heading', { level: 1 })).toBeVisible();
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ['light', 'dark']) {
      if (await page.locator('html').getAttribute('data-theme') !== theme)
        await page.getByRole('button', { name: `Switch to ${theme} theme`, exact: true }).click();
      await gift.getByRole('button', { name: 'Check Card Balance', exact: true }).click();
      const switcher = gift.getByRole('group', { name: 'Gift Cards', exact: true });
      for (const button of await switcher.getByRole('button').all()) {
        const alignment = await button.evaluate(element => {
          const icon = element.querySelector('svg')!.getBoundingClientRect();
          const range = document.createRange();
          range.selectNodeContents(element.lastChild!);
          const text = range.getBoundingClientRect();
          return { iconCenter: (icon.top + icon.bottom) / 2, textCenter: (text.top + text.bottom) / 2 };
        });
        expect(Math.abs(alignment.iconCenter - alignment.textCenter)).toBeLessThan(3);
      }
      const headingAlignment = await gift.locator('.gift-faq h3').evaluate(element => {
        const icon = element.querySelector('svg')!.getBoundingClientRect();
        const range = document.createRange(); range.selectNodeContents(element.lastChild!);
        const text = range.getBoundingClientRect();
        return Math.abs((icon.top + icon.bottom - text.top - text.bottom) / 2);
      });
      expect(headingAlignment).toBeLessThan(3);
      expect(await gift.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`gift-balance-${theme}-${width}.png`), fullPage: true });
      await gift.getByRole('button', { name: 'Send a Digital Card', exact: true }).click();
      await expect(gift.locator('.gift-preview .gift-card-cert')).toBeVisible();
      expect(await gift.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`gift-send-${theme}-${width}.png`), fullPage: true });
    }
  }
  await gift.getByRole('button', { name: 'Check Card Balance', exact: true }).click();
  const input = gift.getByRole('textbox', { name: 'Gift Card Code', exact: true });
  await input.fill('gc-test-1000');
  await input.press('Enter');
  await expect(input).toBeDisabled();
  releaseFirstLookup();
  await expect(gift.getByText('Active Digital Certificate Verified')).toBeVisible();
  expect(lookups).toBe(1);
  await input.fill('UNKNOWN');
  await expect(gift.locator('.gift-result')).toHaveCount(0);
  await input.press('Enter');
  await expect(gift.getByRole('alert')).toContainText('Invalid or inactive');
  await input.fill('GC-TEST-1000');
  await expect(gift.getByRole('alert')).toHaveCount(0);
});
