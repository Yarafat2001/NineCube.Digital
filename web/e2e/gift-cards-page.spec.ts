import { expect, test, type Page } from '@playwright/test';

/**
 * /gift-cards is the screen the owner sent a screenshot of and asked to be made modern, so this
 * asks the live DOM what it resolved rather than what the stylesheet intends: whether anything on
 * the page still carries a hand-written inline style or a colour emoji in place of an icon, whether
 * the one plate holds its three blocks on dividers instead of stacked glass cards, whether the
 * certificate corner and shadow agree with the rest of the shop, whether every field on the page
 * resolves to one height, and whether the live preview actually changes while a person types.
 *
 * Nothing here signs in: the balance check and the composer are both open to a visitor, so the spec
 * runs against a real stack or against the app's own fixtures without a password.
 *
 *   npm run dev                                       # http://127.0.0.1:5173
 *   npm run e2e gift-cards-page
 */
const LOADED = { timeout: 90_000 };

/** DatabaseSeeder creates this one, so the balance tab has a card to resolve on a seeded stack. */
const DEMO_CODE = 'GC-WELCOME-1000';

type Scenario = { width: number; height: number; theme: 'light' | 'dark' };
const SCENARIOS: Scenario[] = [
  { width: 1440, height: 900, theme: 'light' },
  { width: 1440, height: 900, theme: 'dark' },
  { width: 390, height: 844, theme: 'light' },
  { width: 390, height: 844, theme: 'dark' }
];

async function open(page: Page, scenario: Scenario) {
  await page.setViewportSize({ width: scenario.width, height: scenario.height });
  await page.goto('/#/gift-cards');
  await page.evaluate((theme) => localStorage.setItem('ninecube-theme', theme), scenario.theme);
  await page.reload();
  await expect(page.locator('.gift-plate')).toBeVisible(LOADED);
}

/**
 * Everything is read back as resolved paint. The plate paints a translucent *gradient*, so its
 * computed background-color is transparent and a colour-only walk reports a well sitting on the
 * page rather than on the plate - every stop has to be blended over what is behind it, all the way
 * up to <html>, before a contrast ratio or a step count means anything.
 */
const GIFT_PROBE = () => {
  const token = (value: string): { c: number[], a: number } => {
    if (value.startsWith('#')) {
      const hex = value.slice(1);
      const short = hex.length <= 4;
      const part = (i: number) => parseInt(short ? hex[i]! + hex[i]! : hex.slice(i * 2, i * 2 + 2), 16);
      return { c: [part(0), part(1), part(2)], a: hex.length === 8 ? part(3) / 255 : 1 };
    }
    const nums = (value.match(/[\d.]+/g) ?? ['0', '0', '0', '1']).map(Number);
    return { c: nums.slice(0, 3), a: nums.length > 3 ? nums[3]! : 1 };
  };
  const parse = (colour: string) => token(colour).c;
  const alphaOf = (colour: string) => token(colour).a;
  const over = (fg: number[], bg: number[], a: number) => fg.slice(0, 3).map((v, i) => Math.round(v * a + bg[i] * (1 - a)));
  const lum = (c: number[]) => {
    const s = c.map(v => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
    return 0.2126 * s[0]! + 0.7152 * s[1]! + 0.0722 * s[2]!;
  };
  const ratio = (a: number[], b: number[]) => {
    const l1 = lum(a), l2 = lum(b);
    return Math.round(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)) * 100) / 100;
  };
  const stopsOf = (image: string) => (image === 'none' ? [] : image.match(/rgba?\([^)]*\)|#[0-9a-fA-F]{3,8}/g) ?? []);
  /** The colour a person actually sees where this element is, gradients and all. */
  const paint = (el: Element | null): number[] => {
    if (!el || el.tagName === 'HTML') {
      const root = getComputedStyle(document.documentElement).backgroundColor;
      return alphaOf(root) > 0 ? over(parse(root), [255, 255, 255], alphaOf(root)) : [255, 255, 255];
    }
    const ground = paint(el.parentElement);
    const cs = getComputedStyle(el);
    const flatAlpha = alphaOf(cs.backgroundColor);
    const flat = flatAlpha > 0 ? over(parse(cs.backgroundColor), ground, flatAlpha) : ground;
    const stops = stopsOf(cs.backgroundImage).map(t => token(t)).filter(s => s.a > 0).map(s => over(s.c, flat, s.a));
    if (!stops.length) return flat;
    return stops.reduce((acc, c) => acc.map((v, i) => v + c[i]!), [0, 0, 0]).map(v => Math.round(v / stops.length));
  };
  /** How far an element's own fill sits from the surface it rests on, in 0-255 luminance steps. */
  const steps = (el: Element | null) => (el ? Math.round(Math.abs(lum(paint(el)) - lum(paint(el.parentElement))) * 255) : -1);
  const textRatio = (el: Element | null) => {
    if (!el) return -1;
    const cs = getComputedStyle(el);
    const ground = paint(el);
    return ratio(over(parse(cs.color), ground, alphaOf(cs.color)), ground);
  };
  const box = (el: Element | null) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  };

  const pageEl = document.querySelector('.gift-page')!;
  const plate = document.querySelector('.gift-plate');

  let emoji = 0;
  const walker = document.createTreeWalker(pageEl, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    for (const ch of (walker.currentNode as Text).nodeValue ?? '') {
      const c = ch.codePointAt(0)!;
      if ((c >= 0x1f000 && c <= 0x1faff) || (c >= 0x2600 && c <= 0x27bf) || c === 0xfe0f) emoji++;
    }
  }

  const fields = [...pageEl.querySelectorAll('input, textarea')]
    .map(el => ({ el, b: box(el) }))
    .filter(f => (f.b?.h ?? 0) > 0);

  const options = [...document.querySelectorAll('.gift-page__switch .segmented__option')];
  const amounts = [...document.querySelectorAll('.gift-amounts .segmented__option')];
  const amountsGrid = document.querySelector('.gift-amounts');
  const cert = document.querySelector('.gift-card-cert');
  const faqItems = [...document.querySelectorAll('.gift-faq__item')];

  const banner = document.querySelector('.inline-banner');

  return {
    styled: pageEl.querySelectorAll('[style]').length,
    emoji,
    svgs: pageEl.querySelectorAll('svg').length,
    glassCards: pageEl.querySelectorAll('.card-glass').length,
    pageHeight: Math.round(document.body.scrollHeight),
    overflow: Math.round(document.documentElement.scrollWidth - window.innerWidth),
    plate: plate ? { isTableSurface: plate.classList.contains('table-surface'), radius: getComputedStyle(plate).borderRadius } : null,
    plateBlocks: plate ? plate.querySelectorAll(':scope > .gift-block').length : 0,
    blockDivider: (() => {
      const second = plate?.querySelector(':scope > .gift-block + .gift-block');
      return second ? getComputedStyle(second).borderTopWidth : null;
    })(),
    h1: (() => {
      const el = pageEl.querySelector('h1');
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { px: Math.round(parseFloat(cs.fontSize) * 10) / 10, weight: cs.fontWeight, icon: !!el.querySelector('svg'), ratio: textRatio(el) };
    })(),
    fields: fields.map(f => ({
      h: f.b!.h,
      label: (f.el.getAttribute('aria-label') ?? f.el.getAttribute('placeholder') ?? f.el.id).slice(0, 24),
      mono: getComputedStyle(f.el).fontFamily.includes('mono'),
      px: Math.round(parseFloat(getComputedStyle(f.el).fontSize) * 10) / 10
    })),
    switcher: options.map(el => ({
      pressed: el.getAttribute('aria-pressed'),
      radius: getComputedStyle(el.closest('.segmented')!).borderRadius,
      active: el.classList.contains('segmented__option--active'),
      b: box(el),
      textRatio: textRatio(el)
    })),
    amounts: amountsGrid ? {
      display: getComputedStyle(amountsGrid).display,
      radius: getComputedStyle(amountsGrid).borderRadius,
      columns: getComputedStyle(amountsGrid).gridTemplateColumns.split(' ').length,
      rows: new Set(amounts.map(el => Math.round(el.getBoundingClientRect().y))).size,
      tiles: amounts.map(el => box(el))
    } : null,
    cert: cert ? {
      radius: getComputedStyle(cert).borderRadius,
      bg: 'rgb(' + paint(cert).join(',') + ')',
      bgLum: Math.round(lum(paint(cert)) * 1000) / 1000,
      plateLum: plate ? Math.round(lum(paint(plate)) * 1000) / 1000 : -1,
      shadow: getComputedStyle(cert).boxShadow,
      styled: cert.hasAttribute('style'),
      amountPx: Math.round(parseFloat(getComputedStyle(cert.querySelector('.gift-card-cert__amount strong')!).fontSize) * 10) / 10,
      amountRatio: textRatio(cert.querySelector('.gift-card-cert__amount strong')),
      codeRatio: textRatio(cert.querySelector('.gift-card-cert__code .mono')),
      brandRatio: textRatio(cert.querySelector('.gift-card-cert__brand')),
      footRatio: textRatio(cert.querySelector('.gift-card-cert__foot strong')),
      noteRatio: textRatio(cert.querySelector('.gift-card-cert__note')),
      copyBtn: (() => {
        const btn = cert.querySelector('.btn--on-cert');
        if (!btn) return null;
        return {
          radius: getComputedStyle(btn).borderRadius,
          ratio: textRatio(btn),
          own: 'rgb(' + paint(btn).join(',') + ')',
          raised: getComputedStyle(btn).boxShadow !== 'none'
        };
      })(),
      tag: (() => {
        const tag = cert.querySelector('.gift-card-cert__tag');
        return tag ? { text: tag.textContent?.trim() ?? '', ratio: textRatio(tag) } : null;
      })(),
      inPlate: !!plate?.contains(cert),
      text: cert.textContent?.replace(/\s+/g, ' ').trim() ?? ''
    } : null,
    faq: faqItems.map((el, index) => ({
      edge: getComputedStyle(el).borderBottomWidth,
      singleColumn: (() => {
        const dt = el.querySelector('dt')!.getBoundingClientRect();
        const dd = el.querySelector('dd')!.getBoundingClientRect();
        return Math.abs(dt.y - dd.y) > dt.height - 2;
      })(),
      ratio: textRatio(el.querySelector('dt')),
      mutedRatio: textRatio(el.querySelector('dd')),
      last: index === faqItems.length - 1
    })),
    banner: banner ? { ratio: textRatio(banner), styled: banner.hasAttribute('style') } : null,
    eyebrow: (() => {
      const el = pageEl.querySelector('.gift-eyebrow');
      return el ? { px: Math.round(parseFloat(getComputedStyle(el).fontSize) * 10) / 10, ratio: textRatio(el) } : null;
    })(),
    well: (() => {
      const el = pageEl.querySelector('.gift-demo');
      if (!el) return null;
      const cs = getComputedStyle(el);
      const own = paint(el);
      return {
        radius: cs.borderRadius,
        fill: 'rgb(' + own.join(',') + ')',
        ground: 'rgb(' + paint(el.parentElement!).join(',') + ')',
        steps: steps(el),
        edgeRatio: ratio(over(parse(cs.borderTopColor), own, alphaOf(cs.borderTopColor)), own)
      };
    })()
  };
};

test.describe('the gift cards page', () => {
  for (const scenario of SCENARIOS) {
    const tag = `${scenario.width}px/${scenario.theme}`;

    test(`is one plate of house controls on the balance tab (${tag})`, async ({ page }) => {
      await open(page, scenario);
      const balance = await page.evaluate(GIFT_PROBE);

      // 26 inline-styled elements on this tab and 47 once a card had been verified; every one of
      // them has to be a class the shop already paints.
      expect(balance.styled, `${tag}: ${balance.styled} elements still carry an inline style`).toBe(0);
      expect(balance.emoji, `${tag}: ${balance.emoji} colour emoji still standing in for icons`).toBe(0);
      expect(balance.svgs, `${tag}: only ${balance.svgs} line icons on the page`).toBeGreaterThanOrEqual(6);
      expect(balance.glassCards, `${tag}: a stacked glass card came back`).toBe(0);

      expect(balance.plate, `${tag}: no plate`).not.toBeNull();
      expect(balance.plate!.isTableSurface).toBe(true);
      expect(balance.plate!.radius, `${tag}: the plate is ${balance.plate!.radius}`).toBe('22px');
      expect(balance.plateBlocks, `${tag}: the plate holds ${balance.plateBlocks} blocks`).toBe(2);
      expect(balance.blockDivider, `${tag}: the two blocks are not divided`).toBe('1px');

      // The title used to be a 40px line of plain text with an emoji bolted in front of it.
      expect(balance.h1, `${tag}: no page title`).not.toBeNull();
      expect(balance.h1!.icon, `${tag}: the title has no line icon`).toBe(true);
      expect(balance.h1!.ratio, `${tag}: the title reads at ${balance.h1!.ratio}:1`).toBeGreaterThanOrEqual(7);

      // One input height on the page: the code field was 47px against the form's 43px.
      const heights = new Set(balance.fields.map(f => f.h));
      expect([...heights], `${tag}: the page resolves ${[...heights].join(', ')}px field heights`).toEqual([43]);
      const code = balance.fields.find(f => f.label.toLowerCase().includes('code'));
      expect(code, `${tag}: no code field`).not.toBeUndefined();
      expect(code!.mono, `${tag}: the code field is not monospace`).toBe(true);
      expect(code!.px, `${tag}: the code field is ${code!.px}px`).toBe(16);

      expect(balance.switcher).toHaveLength(2);
      expect(balance.switcher[0]!.pressed).toBe('true');
      expect(balance.switcher[1]!.pressed).toBe('false');
      expect(balance.switcher[0]!.radius, `${tag}: the switcher is not the shared pill`).toBe('999px');
      for (const option of balance.switcher) {
        expect(option.textRatio, `${tag}: a switcher option reads at ${option.textRatio}:1`).toBeGreaterThanOrEqual(4.5);
      }

      if (balance.well) {
        // The quick-test strip is a well inside the plate: its fill has to sit below the plate's
        // own paint and its edge has to be the thing a person actually reads.
        expect(balance.well!.radius, `${tag}: the well is ${balance.well!.radius}`).toBe('14px');
        expect(balance.well!.steps, `${tag}: the well (${balance.well!.fill}) is ${balance.well!.steps} steps from the plate (${balance.well!.ground})`)
          .toBeGreaterThanOrEqual(3);
        expect(balance.well!.edgeRatio, `${tag}: the well edge reads at ${balance.well!.edgeRatio}:1 on its own fill`).toBeGreaterThanOrEqual(1.3);
      }

      expect(balance.overflow, `${tag}: the page is ${balance.overflow}px wider than the viewport`).toBeLessThanOrEqual(0);

      // A code the shop knows resolves into the same plate the form lives in. Whether one exists is
      // the dataset's business, so the certificate is asserted on the branch that shows it and the
      // composer test asserts the same object unconditionally.
      await page.getByRole('textbox', { name: /gift card code/i }).fill(DEMO_CODE);
      await page.getByRole('button', { name: /^check balance$/i }).click();
      await expect(page.locator('.gift-result, .inline-banner').first()).toBeVisible(LOADED);
      const verified = await page.evaluate(GIFT_PROBE);
      expect(verified.styled, `${tag}: verifying a card re-introduced inline styles`).toBe(0);
      expect(verified.emoji, `${tag}: verifying a card re-introduced emoji`).toBe(0);
      expect(verified.plateBlocks, `${tag}: a verified card pushed the page into ${verified.plateBlocks} shells`).toBe(2);
      if (verified.cert) {
        expect(verified.cert!.inPlate, `${tag}: the verified certificate sits outside the plate`).toBe(true);
        expect(verified.cert!.radius, `${tag}: the verified certificate is ${verified.cert!.radius}`).toBe('14px');
        expect(verified.cert!.copyBtn, `${tag}: the verified certificate has no copy control`).not.toBeNull();
        // The default button paint out-specifies .btn--on-cert, so this is the check that it opted out.
        expect(verified.cert!.copyBtn!.raised, `${tag}: the copy control paints a raised face on the card`).toBe(false);
        expect(verified.cert!.copyBtn!.ratio, `${tag}: the copy control reads at ${verified.cert!.copyBtn!.ratio}:1`).toBeGreaterThanOrEqual(4.5);
      }

      // An unknown code has to fail in the house voice, not in a hand-painted box.
      await page.getByRole('textbox', { name: /gift card code/i }).fill('GC-NOT-A-CARD-0000');
      await page.getByRole('button', { name: /^check balance$/i }).click();
      const banner = page.locator('.inline-banner[role="alert"]');
      await expect(banner, `${tag}: an unknown code produced no in-plate message`).toBeVisible(LOADED);
      const afterError = await page.evaluate(GIFT_PROBE);
      expect(afterError.cert, `${tag}: a rejected code still left a certificate on the page`).toBeNull();
      expect(afterError.styled, `${tag}: the failure state re-introduced inline styles`).toBe(0);
      expect(afterError.banner, `${tag}: the banner is not measurable`).not.toBeNull();
      expect(afterError.banner!.styled).toBe(false);
      expect(afterError.banner!.ratio, `${tag}: the banner text reads at ${afterError.banner!.ratio}:1`).toBeGreaterThanOrEqual(4.5);

      await page.screenshot({ path: `artifacts/gift-balance-${scenario.width}-${scenario.theme}.png`, fullPage: true });
    });

    test(`composes a live certificate on the send tab (${tag})`, async ({ page }) => {
      await open(page, scenario);
      await page.getByRole('button', { name: /send a digital card/i }).click();
      await expect(page.locator('.gift-preview')).toBeVisible(LOADED);

      const send = await page.evaluate(GIFT_PROBE);
      expect(send.styled, `${tag}: ${send.styled} elements still carry an inline style`).toBe(0);
      expect(send.emoji, `${tag}: ${send.emoji} colour emoji on the composer`).toBe(0);

      // The denomination picker is tiles, not a pill: a 999px shell cannot hold four labels, so the
      // old control wrapped them onto a second row inside the rounding. Four tiles make one row on a
      // laptop and two on a phone, where a 2-up grid is what keeps each label on one line.
      expect(send.amounts, `${tag}: no amount picker`).not.toBeNull();
      expect(send.amounts!.display, `${tag}: the picker is not a grid`).toBe('grid');
      expect(send.amounts!.radius, `${tag}: the picker is ${send.amounts!.radius}`).toBe('14px');
      expect(send.amounts!.columns, `${tag}: the picker is ${send.amounts!.columns} columns wide`).toBe(scenario.width <= 640 ? 2 : 4);
      expect(send.amounts!.rows, `${tag}: the picker stacked into ${send.amounts!.rows} rows`).toBe(scenario.width <= 640 ? 2 : 1);
      expect(send.amounts!.tiles).toHaveLength(4);

      const cert = send.cert;
      expect(cert, `${tag}: no certificate rendered`).not.toBeNull();
      expect(cert!.styled, `${tag}: the certificate is still hand-styled`).toBe(false);
      // 22px inside a 22px plate read as a second card in the card; the plate is 22 and the cert 14.
      expect(cert!.radius, `${tag}: the certificate is ${cert!.radius}`).toBe('14px');
      // The card used to paint itself over the page and report white; it has its own ground now, and
      // that ground has to stay dark in both themes or the gold amount stops being legible.
      expect(cert!.bgLum, `${tag}: the certificate resolves ${cert!.bg} against a plate of ${cert!.plateLum}`)
        .toBeLessThanOrEqual(0.25);
      expect(cert!.shadow, `${tag}: the certificate still floats on a 48px smear`).not.toMatch(/48px/);
      expect(cert!.amountRatio, `${tag}: the amount reads at ${cert!.amountRatio}:1`).toBeGreaterThanOrEqual(7);
      expect(cert!.codeRatio, `${tag}: the code reads at ${cert!.codeRatio}:1`).toBeGreaterThanOrEqual(4.5);
      expect(cert!.brandRatio, `${tag}: the brand line reads at ${cert!.brandRatio}:1`).toBeGreaterThanOrEqual(4.5);
      expect(cert!.footRatio, `${tag}: the footer reads at ${cert!.footRatio}:1`).toBeGreaterThanOrEqual(4.5);
      // A preview has no code to copy yet, so it carries the scope tag in that slot instead.
      expect(cert!.tag, `${tag}: the preview shows neither a copy control nor a tag`).not.toBeNull();
      expect(cert!.tag!.text, `${tag}: the preview slot is empty`).not.toBe('');
      expect(cert!.tag!.ratio, `${tag}: the ${cert!.tag!.text} tag reads at ${cert!.tag!.ratio}:1`).toBeGreaterThanOrEqual(4.5);

      // "Dynamic" is testable: the preview is the same object the shop hands over, so what a person
      // types has to land on it.
      await page.getByRole('spinbutton', { name: /custom amount/i }).fill('3750');
      await page.locator('#send-rec-name').fill('Ayesha Rahman');
      await page.locator('#send-note').fill('Happy Eid!');
      const typed = await page.locator('.gift-card-cert').first().innerText();
      expect(typed.replace(/\s+/g, ' '), `${tag}: the preview ignored what was typed`).toContain('3,750');
      expect(typed.replace(/\s+/g, ' '), `${tag}: the preview dropped the recipient`).toContain('Ayesha Rahman');
      expect(typed.replace(/\s+/g, ' '), `${tag}: the preview dropped the message`).toContain('Happy Eid!');

      const preset = page.locator('.gift-amounts .segmented__option').nth(2);
      await preset.click();
      expect(await preset.getAttribute('aria-pressed'), `${tag}: the picked tile did not become the pressed one`).toBe('true');
      expect(await page.locator('.gift-amounts .segmented__option').nth(0)!.getAttribute('aria-pressed')).toBe('false');
      expect((await page.locator('.gift-card-cert').first().innerText()).replace(/\s+/g, ' ')).toContain('2,500');

      // The FAQ is full-width question/answer rows on a phone and stays legible in both themes.
      for (const item of send.faq) {
        expect(item.ratio, `${tag}: a question reads at ${item.ratio}:1`).toBeGreaterThanOrEqual(7);
        expect(item.mutedRatio, `${tag}: an answer reads at ${item.mutedRatio}:1`).toBeGreaterThanOrEqual(4.5);
        if (!item.last) expect(item.edge, `${tag}: a question lost its divider`).toBe('1px');
        if (scenario.width <= 640) expect(item.singleColumn, `${tag}: a question and its answer share a line`).toBe(true);
      }
      expect(send.overflow, `${tag}: the page is ${send.overflow}px wider than the viewport`).toBeLessThanOrEqual(0);

      await page.screenshot({ path: `artifacts/gift-send-${scenario.width}-${scenario.theme}.png`, fullPage: true });
    });
  }

  test('keeps the laptop composition together', async ({ page }) => {
    await open(page, { width: 1440, height: 900, theme: 'light' });
    await page.getByRole('button', { name: /send a digital card/i }).click();
    await expect(page.locator('.gift-preview')).toBeVisible(LOADED);

    const layout = await page.evaluate(() => {
      const b = (sel: string) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), bottom: Math.round(r.bottom) };
      };
      const items = [...document.querySelectorAll('.gift-faq__item')].map(el => Math.round(el.getBoundingClientRect().height));
      return {
        form: b('.gift-send form'),
        preview: b('.gift-preview'),
        cert: b('.gift-card-cert'),
        plate: b('.gift-plate'),
        faqHeights: items,
        faqWidth: Math.round(document.querySelector('.gift-faq')!.getBoundingClientRect().width)
      };
    });

    // Form and preview are two columns of one block, so they start on the same line.
    expect(layout.form, 'no composer form').not.toBeNull();
    expect(layout.preview, 'no live preview').not.toBeNull();
    expect(layout.preview!.y, `the preview starts ${layout.preview!.y - layout.form!.y}px below the form`).toBeLessThan(layout.form!.bottom);
    expect(layout.preview!.x, 'the preview is not beside the form').toBeGreaterThan(layout.form!.x + layout.form!.w / 2);

    // The certificate is a card, not a second plate: it has to fit inside the column that holds it.
    expect(layout.cert!.w, `the certificate is ${layout.cert!.w}px in a ${layout.preview!.w}px column`).toBeLessThanOrEqual(layout.preview!.w);
    expect(layout.cert!.h, `the certificate collapsed to ${layout.cert!.h}px`).toBeGreaterThanOrEqual(180);

    for (const h of layout.faqHeights) {
      expect(h, `an FAQ row is ${h}px tall`).toBeLessThanOrEqual(120);
    }

    // One plate from the switcher to the last answer: nothing may paint a shell outside it.
    const shells = await page.evaluate(() => document.querySelectorAll('.gift-page .table-surface, .gift-page .card-glass').length);
    expect(shells, 'the page is built from more than one shell').toBe(1);
  });
});
