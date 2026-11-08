import { chromium } from '@playwright/test';

const LIVE = 'https://yarafat2001.github.io/NineCube.Digital/#/';

const run = async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
  await page.goto(LIVE, { waitUntil: 'commit', timeout: 120000 });
  await page.waitForSelector('.showcase--static', { timeout: 120000 });
  await page.waitForTimeout(4000);
  await page.evaluate(async () => {
    const step = window.innerHeight * 0.8;
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 250));
    }
    window.scrollTo(0, 0);
    await new Promise((r) => setTimeout(r, 500));
  });
  await page.screenshot({ path: '../scratch/round37-live-home.png', fullPage: true });

  const facts = await page.evaluate(() => {
    const home = document.querySelector('.showcase--static');
    const q = (sel) => document.querySelectorAll(sel).length;
    const text = (sel) => document.querySelector(sel)?.textContent?.trim().slice(0, 120) ?? null;
    return {
      pageHeight: document.body.scrollHeight,
      storePulse: q('.home-store-pulse'),
      band: text('.home-campaign-banner__code-value'),
      bandCta: text('.home-campaign-banner__cta'),
      offerCards: q('.home-offer-card'),
      brandChips: q('.home-brand-chip'),
      brandCards: q('.home-brand-card'),
      categoryCards: q('.home-category-card'),
      categoryPhotos: q('.home-category-photo'),
      dealCards: q('.hero-deal__card'),
      dealBadge: text('.hero-deal__badge'),
      dealPrice: text('.hero-deal__price'),
      newBadges: q('.home-deal-new-badge'),
      footerColumns: q('.showcase-footer__grid > div'),
      footerSupport: [...document.querySelectorAll('.showcase-footer__col a')].map((a) => a.getAttribute('href')),
      heroGrid: getComputedStyle(document.querySelector('.showcase__hero-layout')).gridTemplateColumns,
      dealsGrid: getComputedStyle(document.querySelector('.home-deals-grid')).gridTemplateColumns
    };
  });
  console.log(JSON.stringify(facts, null, 1));
  console.log('console errors:', errors.length, errors.slice(0, 5));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: '../scratch/round37-live-home-phone.png', fullPage: true });
  const phone = await page.evaluate(() => ({
    pageHeight: document.body.scrollHeight,
    dealsGrid: getComputedStyle(document.querySelector('.home-deals-grid')).gridTemplateColumns,
    scrollWidth: document.documentElement.scrollWidth - document.documentElement.clientWidth
  }));
  console.log('phone', JSON.stringify(phone));
  await browser.close();
};

run();
