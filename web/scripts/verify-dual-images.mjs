import { chromium } from '@playwright/test';
import path from 'node:path';

const artifactsDir = 'C:/Users/yeasi/.gemini/antigravity/brain/c29260b8-4e39-4119-8fe7-84a12d0e5923';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  const targetUrl = 'http://localhost:5173/#/products';
  console.log(`1. Navigating to ${targetUrl} ...`);
  try {
    await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 15000 });
  } catch (err) {
    console.log('Local dev server timeout, falling back to GitHub Pages...');
    await page.goto('https://yarafat2001.github.io/NineCube.Digital/#/products', { waitUntil: 'networkidle' });
  }
  await page.waitForTimeout(2000);

  // Take catalogue initial screenshot
  await page.screenshot({ path: path.join(artifactsDir, 'verify_catalogue_initial.png') });
  console.log('Saved verify_catalogue_initial.png');

  const searchBox = page.locator('#product-search');

  // 1. Bashundhara Chinigura Rice
  if (await searchBox.count() > 0) {
    console.log('1. Searching Bashundhara Chinigura Rice...');
    await searchBox.fill('Bashundhara Aromatic');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(artifactsDir, 'verify_bashundhara_rice_packet.png') });

    const firstCard = page.locator('.product-card').first();
    if (await firstCard.count() > 0) {
      console.log('Hovering card to trigger open aromatic grains view...');
      await firstCard.hover();
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(artifactsDir, 'verify_bashundhara_rice_open.png') });

      const addBtn = firstCard.locator("button:has-text('Add to cart')");
      if (await addBtn.count() > 0) {
        console.log('Clicking Add to Cart for sequential animation...');
        await addBtn.click();
        await page.waitForTimeout(400);
        await page.screenshot({ path: path.join(artifactsDir, 'verify_bashundhara_rice_adding.png') });
      }
    }

    // 2. PRAN Chinigura Rice
    console.log('2. Searching PRAN Chinigura Rice...');
    await searchBox.fill('PRAN Aromatic');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(artifactsDir, 'verify_pran_rice_packet.png') });
    const pranCard = page.locator('.product-card').first();
    if (await pranCard.count() > 0) {
      await pranCard.hover();
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(artifactsDir, 'verify_pran_rice_open.png') });
    }

    // 3. Fresh Mustard Oil
    console.log('3. Searching Fresh Mustard Oil...');
    await searchBox.fill('Fresh Mustard Oil');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(artifactsDir, 'verify_fresh_mustard_oil.png') });
    const mustardCard = page.locator('.product-card').first();
    if (await mustardCard.count() > 0) {
      await mustardCard.hover();
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(artifactsDir, 'verify_fresh_mustard_oil_open.png') });
    }

    // 4. Olive Oil
    console.log('4. Searching Olive Oil...');
    await searchBox.fill('Extra Virgin Olive Oil');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(artifactsDir, 'verify_olive_oil.png') });
    const oliveCard = page.locator('.product-card').first();
    if (await oliveCard.count() > 0) {
      await oliveCard.hover();
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(artifactsDir, 'verify_olive_oil_open.png') });
    }

    // 5. Aarong Anklet
    console.log('5. Searching Aarong Anklet...');
    await searchBox.fill('Anklet Gold Plated');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(artifactsDir, 'verify_anklet.png') });
    const ankletCard = page.locator('.product-card').first();
    if (await ankletCard.count() > 0) {
      await ankletCard.hover();
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(artifactsDir, 'verify_anklet_open.png') });
    }

    // 6. Baby Winter Set
    console.log('6. Searching Baby Winter Set...');
    await searchBox.fill('Baby Winter Set');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(artifactsDir, 'verify_baby_winter.png') });
    const babyCard = page.locator('.product-card').first();
    if (await babyCard.count() > 0) {
      await babyCard.hover();
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(artifactsDir, 'verify_baby_winter_open.png') });
    }

    // 7. 10 Minute School
    console.log('7. Searching 10 Minute School...');
    await searchBox.fill('10 Minute School');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(artifactsDir, 'verify_10ms_courses.png') });
    const courseCard = page.locator('.product-card').first();
    if (await courseCard.count() > 0) {
      await courseCard.hover();
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(artifactsDir, 'verify_10ms_courses_open.png') });
    }
  }

  await browser.close();
  console.log('All verification screenshots captured successfully!');
}

main().catch(console.error);
