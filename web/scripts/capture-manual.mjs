/**
 * Captures the annotated screens for USER_MANUAL.md.
 *
 * Every image is a real browser at a real URL against the running API, with the numbered callouts
 * drawn over the actual controls rather than over a mock-up, so a reader can match the picture to
 * their own screen. It writes docs/manual/<name>.png plus docs/manual/callouts.json, which holds the
 * wording behind each number for the manual's legends.
 *
 *   cd web && set -a && . ../.env && set +a && node scripts/capture-manual.mjs
 *
 * Needs the API on :5080 and the SPA on :5173, with the demo accounts seeded.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const BASE = process.env.MANUAL_BASE_URL ?? 'http://127.0.0.1:5173';
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'manual');
const password = (process.env.NINECUBE_SEED_PASSWORD ?? '').replace(/^["']|["']$/g, '');

if (!password) {
  console.error('NINECUBE_SEED_PASSWORD is not set; load it from the repository .env first.');
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });

const record = [];

/** Draw a numbered badge and an outline over each callout, in order. */
async function annotate(page, callouts) {
  // A callout is either a CSS selector or a Playwright locator; the locator form is used where the
  // class is not stable but the visible text is.
  const boxes = [];
  for (const entry of callouts) {
    const box = entry.loc
      ? await entry.loc.first().boundingBox().catch(() => null)
      : null;
    boxes.push(box ? { x: box.x, y: box.y, w: box.width, h: box.height } : null);
  }
  const drawn = await page.evaluate(({ items, rects }) => {
    const style = document.createElement('style');
    style.textContent = `
      .manual-mark { position: fixed; z-index: 2147483000; width: 26px; height: 26px; border-radius: 50%;
        background: #F59E0B; color: #1A1100; border: 2px solid #FFF; box-shadow: 0 1px 6px rgba(0,0,0,.45);
        font: 700 14px/22px system-ui, sans-serif; text-align: center; pointer-events: none; }
      .manual-box { position: fixed; z-index: 2147483000; border: 2px solid #F59E0B; border-radius: 10px;
        box-shadow: 0 0 0 2px rgba(20,12,0,.35); pointer-events: none; }`;
    document.head.append(style);
    const out = [];
    items.forEach(({ n, selector, fit, text }, index) => {
      let box = rects[index];
      if (!box && selector) {
        const node = document.querySelector(selector);
        if (node) {
          // A block-level heading or kicker spans the whole column, so its box would be a stripe
          // across the page. text:true measures the words themselves instead of the element.
          const range = text && node.firstChild ? document.createRange() : null;
          if (range) range.selectNodeContents(node);
          const rect = range ? range.getBoundingClientRect() : node.getBoundingClientRect();
          box = { x: rect.x, y: rect.y, w: rect.width, h: rect.height };
        }
      }
      if (!box || box.w === 0 || box.y + box.h < 0 || box.y > innerHeight) { out.push({ n, found: false }); return; }
      const frame = document.createElement('div');
      frame.className = 'manual-box';
      Object.assign(frame.style, {
        left: `${Math.max(0, box.x - 3)}px`, top: `${Math.max(0, box.y - 3)}px`,
        width: `${Math.min(innerWidth, box.x + box.w + 3) - Math.max(0, box.x - 3)}px`,
        height: `${box.h + 6}px`
      });
      const badge = document.createElement('div');
      badge.className = 'manual-mark';
      badge.textContent = String(n);
      const at = fit === 'right' ? { x: box.x + box.w - 30, y: box.y - 13 } : { x: box.x - 13, y: box.y - 13 };
      Object.assign(badge.style, {
        left: `${Math.max(2, Math.min(innerWidth - 30, at.x))}px`,
        top: `${Math.max(2, at.y)}px`
      });
      document.body.append(frame, badge);
      out.push({ n, found: true });
    });
    return out;
  }, { items: callouts.map((entry, index) => ({ n: index + 1, selector: entry.selector, fit: entry.fit, text: entry.text })), rects: boxes });

  const missing = drawn.filter(entry => !entry.found).map(entry => entry.n);
  if (missing.length) console.warn(`   ! callouts not found on screen: ${missing.join(', ')}`);
  return callouts.map((entry, index) => ({ n: index + 1, label: entry.label, found: drawn[index].found }));
}

async function clearMarks(page) {
  await page.evaluate(() => {
    document.querySelectorAll('.manual-mark, .manual-box, style[data-manual]').forEach(node => node.remove());
  });
}

async function shot(page, name, title, purpose, callouts, scrollTo) {
  // A callout can only be drawn where the reader can see it, so a screen whose points of interest sit
  // below the fold is captured with that region scrolled in instead.
  if (scrollTo) {
    await page.evaluate(target => document.querySelector(target)?.scrollIntoView({ block: 'center' }), scrollTo);
    await page.waitForTimeout(400);
  }
  const withText = await annotate(page, callouts);
  const file = `${name}.png`;
  await page.screenshot({ path: join(OUT_DIR, file) });
  await clearMarks(page);
  record.push({ name, file, title, purpose, callouts: withText.map(({ n, label, found }) => ({ n, label, found })) });
  console.log(`   ${file}  (${withText.length} callouts)`);
}

async function signIn(page, email) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  const box = page.getByRole('textbox', { name: 'Email' });
  // React may still be mounting the form when the navigation resolves, so give it a moment before
  // deciding that the visitor must already be signed in.
  const onForm = await box.waitFor({ state: 'visible', timeout: 5_000 }).then(() => true, () => false);
  if (!onForm) {
    // /login sends a signed-in visitor straight to the catalogue, so the previous role has to be
    // signed out before the next one can be captured. Where the sign-out leaves you depends on the
    // page you were on, so the test is the login form itself, not any particular button on it.
    await page.getByRole('button', { name: 'Account' }).click();
    await page.getByRole('menuitem', { name: 'Log out' }).click();
    await box.waitFor({ state: 'visible', timeout: 30_000 }).catch(async () => {
      await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
      await box.waitFor({ state: 'visible', timeout: 30_000 });
    });
  }
  await box.fill(email);
  await page.getByRole('textbox', { name: 'Password' }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: 'Account' }).waitFor({ timeout: 90_000 });
}

async function light(page) {
  await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
  await page.waitForTimeout(250);
}

async function dark(page) {
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
  await page.waitForTimeout(250);
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await context.newPage();
// A screen that will not settle is a bug to fix, not a reason to spend ten minutes retrying one click.
page.setDefaultTimeout(20_000);

// ---------------------------------------------------------------- public
console.log('public screens');
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await light(page);
await page.waitForTimeout(1200);
await shot(page, '01-showcase-hero', 'The public showcase, at the top of the page',
  'The only screen a visitor sees before signing in. It calls no API, so no stock, price or customer data appears here.',
  [
    { label: 'The brand mark. It links to the catalogue once you are signed in, and to this page while you are not', selector: '.navbar__brand' },
    { label: 'The navigation tray. While signed out it holds Home and Collection only', selector: '.navbar__tray' },
    { label: 'Language selector', selector: '.theme-controls' },
    { label: 'Sign in opens the login page', selector: '.navbar a.btn--primary' },
    { label: 'The opening line of the showcase', selector: '.kicker', text: true },
    { label: 'Explore the collection goes straight to the catalogue, where you still have to sign in', selector: '.showcase__hero-cta', fit: 'right' }
  ]);

await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(1500);
await shot(page, '02-showcase-end', 'The end of the showcase',
  'The scroll scene ends on a closing panel and a footer, so the way into the shop is never more than a scroll away.',
  [
    { label: 'Open the catalogue is the main route into the shop', selector: '.showcase__cta' },
    { label: 'Sign in and Create account are repeated here so a reader who scrolled past the header is not stuck', selector: '.showcase-footer__links' }
  ]);

await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await shot(page, '03-sign-in', 'Signing in',
  'Every screen except this showcase needs an account, because live stock is treated as commercial information.',
  [
    { label: 'Your email address, exactly as it was registered', selector: '#login-email' },
    { label: 'Your password. It is never shown in the address bar or stored in the browser beyond the session', selector: '#login-password' },
    { label: 'Sign in. The button reads Signing in… while the request is in flight and cannot be pressed twice', selector: 'form button[type=submit]' },
    { label: 'New customer? Create an account', selector: 'a[href="/register"]' }
  ]);

await page.goto(`${BASE}/register`, { waitUntil: 'domcontentloaded' });
await shot(page, '04-register', 'Creating a customer account',
  'Self-registration always creates a Customer. Staff, Inventory and Administrator logins are made by an Administrator on the Administration screen.',
  [
    { label: 'Your full name, as it will appear on orders and invoices', selector: '#register-name' },
    { label: 'Email address, which is also your login', selector: '#register-email' },
    { label: 'A password of at least 8 characters', selector: '#register-password' },
    { label: 'Create account', selector: 'form button[type=submit]' }
  ]);

// ---------------------------------------------------------------- customer
console.log('customer screens');
await signIn(page, 'customer@ninecube.demo');
await light(page);
await page.goto(`${BASE}/products`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.product-card', { timeout: 90_000 });
await page.waitForTimeout(800);
await shot(page, '05-catalogue', 'The catalogue',
  'The working screen for a customer: live availability straight from stock, with the server as the source of truth for every quantity.',
  [
    { label: 'The tab you are on is filled with the amber selection colour, the same look the open account menu and the switched-on theme take', selector: `.navbar__link[aria-current='page']` },
    { label: 'Your role’s tabs. A customer sees Products and My Orders', selector: '.navbar__tray', fit: 'right' },
    { label: 'Cart, notification bell and account menu live in this group', selector: '.navbar__actions' },
    { label: 'Search by product name or SKU. It waits 300 ms after you stop typing', selector: 'input[type=search]' },
    { label: 'The category tree with product counts. Clicking a branch filters the grid', selector: '.category-tree' },
    { label: 'Availability, price range and sort live in the same panel', selector: '.category-filter-panel', fit: 'right' },
    { label: 'A product card. The chips under the name are shortcuts that apply that filter', selector: '.product-card' },
    { label: 'The stock badge: In stock, Low stock with the count left, Out of stock or Inactive. It carries a glyph and a word, never colour alone', selector: '.product-card .badge', fit: 'right' },
    { label: 'The quantity stepper cannot be raised above what is in stock', selector: '.product-card [role=group][aria-label^="Quantity"]', fit: 'right' }
  ]);

// Two in-stock lines, so the cart shows more than one row. Out-of-stock cards keep their button
// present but disabled, which is why this walks the list rather than clicking a fixed index.
const addable = page.getByRole('button', { name: 'Add to cart' });
const addableCount = await addable.count();
let filled = 0;
for (let index = 0; index < addableCount && filled < 2; index++) {
  const button = addable.nth(index);
  if (!(await button.isEnabled().catch(() => false))) continue;
  await button.click();
  await page.waitForTimeout(500);
  filled += 1;
}
await page.getByRole('button', { name: /^Cart, / }).first().click();
await page.waitForSelector('[aria-label="Your cart"]', { timeout: 30_000 });
await page.waitForTimeout(500);
await shot(page, '06-cart', 'The cart and checkout',
  'The cart lives in your browser until you place the order. Stock is only reserved at that moment, which is the first point where the promise can actually be kept.',
  [
    { label: 'Each line shows the unit price and what is available right now', selector: '.sheet' },
    { label: 'The stepper per line, capped at live stock', selector: '.sheet [role=group][aria-label^="Quantity"]' },
    { label: 'Remove takes just that line out', selector: '.sheet button[aria-label^="Remove"]' },
    { label: 'Total, priced in the store currency', selector: '[data-testid=cart-total]', fit: 'right' },
    { label: 'Place order sends the whole basket as one request with an idempotency key', selector: '.sheet .btn--primary', fit: 'right' }
  ]);
await page.keyboard.press('Escape');

await page.goto(`${BASE}/orders`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('tbody tr', { timeout: 90_000 });
await page.waitForTimeout(500);
await shot(page, '07-my-orders', 'My orders',
  'Every order on the account with its current status, and the printable invoice for each.',
  [
    { label: 'Filter by status. The list is paged at ten orders', selector: 'select' },
    { label: 'A row: order number, when it was placed, how many items, the total and where it is now', selector: 'tbody tr', fit: 'right' },
    { label: 'View opens the order with its timeline', selector: 'tbody tr .btn', fit: 'right' },
    { label: 'Invoice opens the printable version', selector: 'tbody tr .link-button', fit: 'right' }
  ]);

// "View" routes through a button rather than a link, so the order is read back from the address bar.
await page.getByRole('button', { name: 'View' }).first().click();
await page.waitForURL(/\/orders\/\d+$/, { timeout: 30_000 });
const firstOrder = new URL(page.url()).pathname;
await page.waitForSelector('table', { timeout: 90_000 });
await shot(page, '08-order-detail', 'One order, start to finish',
  'The timeline says exactly where the order is, and the sentence under it says what that status means for you.',
  [
    { label: 'The current status', selector: '.page-header .badge' },
    { label: 'Pending, Confirmed, Shipped, or the terminal Rejected or Cancelled', selector: '[aria-label="Order status timeline"]' },
    { label: 'Printable invoice', selector: '.page-header a.btn', fit: 'right' },
    { label: 'The lines as they were bought, with the price the server charged at that moment', selector: 'table' },
    { label: 'Cancel order releases the reserved stock. It is offered only while the order is Pending or Confirmed', loc: page.getByRole('button', { name: /Cancel order/i }), fit: 'right' }
  ]);

await page.goto(`${BASE}${firstOrder}/invoice`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[aria-label^="Invoice for order"]', { timeout: 90_000 });
await shot(page, '09-invoice', 'The invoice',
  'A single page you can print or save as PDF. Printing always uses white paper, whatever theme you read it in.',
  [
    { label: 'Print calls the browser’s own print dialog', loc: page.getByRole('button', { name: 'Print' }), fit: 'right' },
    { label: 'Billed to', selector: '.invoice .grid-form > div:first-child' },
    { label: 'Payment is handled outside this system, and the invoice says so rather than implying it was taken', selector: '.invoice .grid-form > div:last-child' },
    { label: 'Line items with quantity, unit price and amount', selector: '[aria-label="Invoice line items"]' }
  ]);

await page.goto(`${BASE}/account`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-testid="dashboard-stats"]', { timeout: 90_000 });
await shot(page, '10-dashboard', 'Your dashboard',
  'The account summary: what you have ordered, what it cost, and what needs your attention.',
  [
    { label: 'Total orders, total spent, active orders and delivered, counted from your own orders', selector: '[data-testid="dashboard-stats"]' },
    { label: 'Shortcuts to the three pages a customer uses', selector: '[aria-label="Quick actions"]' },
    { label: 'Orders by status. Shipped means in transit here; delivery confirmation is a separate status this system does not have', selector: 'section[aria-labelledby="dashboard-status"]' },
    { label: 'Edit profile', selector: 'a[href="/account/profile"]', fit: 'right' }
  ]);

await page.goto(`${BASE}/account/profile`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#profile-name, [aria-label="Profile details"]', { timeout: 90_000 });
await shot(page, '11-profile', 'Profile, password and addresses',
  'Your contact details, the password you sign in with, and the delivery addresses checkout offers.',
  [
    { label: 'Name and phone. Your email is the login, so it is shown but not editable', selector: '[aria-label="Profile details"]' },
    { label: 'Save changes', selector: '[aria-label="Profile details"] .btn--primary', fit: 'right' },
    { label: 'Change password asks for the current one first, and rates the strength of the new one', selector: '[aria-label="Change password"]' }
  ]);

await shot(page, '11b-addresses', 'Saved delivery addresses',
  'The address book checkout offers, on the same profile page below the password card.',
  [
    { label: 'Saved delivery addresses. The default one is offered at checkout', selector: 'section[aria-labelledby="address-book"]' },
    { label: 'The form below the list adds an address; Save address keeps it for the next order', selector: 'form[aria-label="Add address"]' }
  ], 'section[aria-labelledby="address-book"]');

await page.goto(`${BASE}/notifications`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('main', { timeout: 90_000 });
await page.waitForTimeout(700);
await shot(page, '12-notifications', 'Notifications',
  'Order updates for everyone, plus new-order and low-stock messages for staff.',
  [
    { label: 'Filter the inbox: All, Unread, Orders, Promotions', selector: '[aria-label="Filter notifications"]' },
    { label: 'Mark all as read', loc: page.getByRole('button', { name: 'Mark all as read' }), fit: 'right' },
    { label: 'The inbox: what changed, when, and a link to the order it is about. Ticking rows makes Mark as read and Delete apply to the selection', selector: '.notif-list--page .notif-item' },
    { label: 'Preferences. Order notices are always on; promotions can be muted per channel, with quiet hours', selector: 'section[aria-labelledby="notif-prefs-heading"]' }
  ]);

// ---------------------------------------------------------------- staff
console.log('staff screens');
await signIn(page, 'staff@ninecube.demo');
await light(page);
await page.goto(`${BASE}/staff`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('tbody tr', { timeout: 90_000 });
await page.waitForTimeout(600);
await shot(page, '13-staff-console', 'The staff order console',
  'Staff move orders through the lifecycle. They cannot create products or touch stock - that is the Inventory Manager’s job.',
  [
    { label: 'A staff member’s tabs: Products, Orders, Sales', selector: '.navbar__tray' },
    { label: 'The three queues a staff member works through: To confirm, To ship, and Invoices & history', selector: '[aria-label="Order queues"]' },
    { label: 'Switch between the order list and category management', selector: '[aria-label="Staff sections"]' },
    { label: 'The queue you are in: every order still Pending, oldest first', selector: 'tbody tr', fit: 'right' },
    { label: 'Confirm accepts the order and keeps the stock reserved', selector: 'tbody tr .btn--primary', fit: 'right' },
    { label: 'Reject declines it and releases the reserved stock back to the shelf', selector: 'tbody tr .btn--danger', fit: 'right' },
    { label: 'Tick rows to confirm or reject a batch at once', selector: 'input[type=checkbox][aria-label^="Select order"]' }
  ]);

await page.goto(`${BASE}/staff/sales`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.stat-tile, table', { timeout: 90_000 });
await page.waitForTimeout(600);
await shot(page, '14-sales-summary', 'Sales summary',
  'Read-only reporting over every order. Cancelled and rejected orders are counted but bring in no revenue.',
  [
    { label: 'From and To are calendar days in your own time zone, converted to UTC at the edges', selector: 'input[type=date]' },
    { label: 'Apply range', loc: page.getByRole('button', { name: /Apply range/i }) },
    { label: 'Orders, revenue and the range you asked for', selector: '.stat-tile' }
  ]);

await shot(page, '14b-sales-breakdown', 'The same figures as a breakdown',
  'Below the tiles on the sales page: the charts, and the table behind them with each status’s share.',
  [
    { label: 'Orders and revenue by status, drawn as charts', selector: 'canvas, svg', fit: 'right' },
    { label: 'The same numbers as a table, so the report is readable without the chart', selector: 'table' }
  ], 'table');

// The category manager is the other half of the staff screen. It is captured in the dark theme, which
// is the theme the request came in with; the marks carry a white ring, so they read on either surface.
console.log('staff category manager (dark theme)');
await dark(page);
await page.goto(`${BASE}/staff`, { waitUntil: 'domcontentloaded' });
await page.getByRole('button', { name: 'Categories & products', exact: true }).click();
// The table renders an empty-search row before the tree arrives, so wait for a real Edit button
// rather than for a row.
await page.waitForSelector('.category-manager td .btn', { timeout: 90_000 });
await page.waitForTimeout(700);
await shot(page, '13b-category-stock-dark', 'Categories & stock, in the dark theme',
  'The staff screen has a second half: the category tree, with the stock that sits under each branch. The figures are read from the catalogue and are never edited here.',
  [
    { label: 'The staff screen splits in two: the order console and this category manager. The half you are on carries the amber fill', selector: '[aria-label="Staff sections"]' },
    { label: 'The section heading', selector: '#category-manager-heading', text: true },
    { label: 'The two views: the tree with its stock summary, and the product category and tag editor', selector: '[aria-label="Organization sections"]' },
    { label: 'Find a category by its own name or its parent’s. It filters as you type and goes back to the first page', selector: '#category-search' },
    { label: 'Create category opens the same form on an empty record', selector: '.category-manager__toolbar .btn--primary', fit: 'right' },
    { label: 'The summary counts every product in the branch, not only the ones filed directly under it', selector: '.category-manager table caption', text: true },
    { label: 'Category, Products, In stock, Low stock and Manage', selector: '.category-manager thead tr', fit: 'right' },
    { label: 'One row per category, indented by how deep it sits. An inactive category carries its own badge', selector: '.category-manager tbody tr' },
    { label: 'Edit opens the category form. Nothing on this screen changes a stock figure', selector: '.category-manager td .btn', fit: 'right' }
  ]);

await page.getByRole('searchbox', { name: 'Find a category' }).fill('Home');
await page.getByRole('button', { name: 'Edit Home', exact: true }).click();
await page.waitForSelector('.modal', { timeout: 30_000 });
await page.waitForTimeout(600);
await shot(page, '13c-category-editor-dark', 'The category editor, in the dark theme',
  'Everything that can be done to one category: rename it, change its slug, move it under another parent, reorder it, switch it off and delete it.',
  [
    { label: 'The dialog is named after the category, so a screen reader and the address of the request agree', selector: '.modal h3', text: true },
    { label: 'Close dialog. Escape does the same thing and hands focus back to the Edit button you came from', selector: '[aria-label="Close dialog"]', fit: 'right' },
    { label: 'Category name, required, up to 120 characters', selector: '[aria-label="Category editor"] .field:nth-of-type(1) input' },
    { label: 'The slug used in the address bar, written for you from the name and still editable', selector: '[aria-label="Category editor"] .field:nth-of-type(2) input' },
    { label: 'Parent category. Choosing another branch is what moves this one', selector: '[aria-label="Category editor"] .field:nth-of-type(3) select' },
    { label: 'Sort order inside the parent', selector: '[aria-label="Category editor"] .field:nth-of-type(4) input' },
    { label: 'Active category. Switching it off hides the branch and everything under it from browsing, and leaves stock alone', selector: '[aria-label="Category editor"] .checkbox' },
    { label: 'Save category', selector: '.modal .btn--primary' },
    { label: 'Move category reparents on its own. A branch moved under one of its own descendants is refused: "A category cannot move under itself or a descendant."', loc: page.getByRole('button', { name: 'Move category', exact: true }) },
    { label: 'Reassign products and children to: where the contents go when the category is deleted', selector: '[aria-label="Category editor"] .field:nth-of-type(5) select' },
    { label: 'Delete category. Greyed out while the category still holds products or children, so nothing is orphaned', loc: page.getByRole('button', { name: 'Delete category', exact: true }), fit: 'right' }
  ]);
await page.keyboard.press('Escape');

await page.getByRole('searchbox', { name: 'Find a category' }).fill('');
await page.getByRole('button', { name: 'Product categories & tags', exact: true }).click();
await page.waitForSelector('#organization-product-search', { timeout: 30_000 });
// The picker is disabled while its page of products is still in flight, and it is the one control on
// these screens that needs the answer before the picture can be taken.
const productSelect = page.locator('.category-manager .card-glass > .field:nth-of-type(2) select');
await page.waitForFunction(target => {
  const node = document.querySelector(target);
  return !!node && !node.disabled && node.options.length > 1;
}, '.category-manager .card-glass > .field:nth-of-type(2) select', { timeout: 90_000 });
await productSelect.selectOption({ index: 1 });
await page.waitForSelector('[aria-label="Product category editor"]', { timeout: 90_000 });
await page.waitForTimeout(700);
await shot(page, '13d-product-organization-dark', 'Product categories & tags: choosing the product',
  'The second view files a product under the categories and tags the catalogue filters on. It is paged at twenty products, the same list the customer browses.',
  [
    { label: 'The two views, with this one selected', selector: '[aria-label="Organization sections"]' },
    { label: 'The heading of the view', selector: '.category-manager .card-glass > h3', text: true },
    { label: 'Find a product by name or SKU. It waits a quarter of a second after you stop typing', selector: '#organization-product-search' },
    { label: 'The product, named with its SKU so two similar names cannot be confused', selector: '.category-manager .card-glass > .field:nth-of-type(2) select' },
    { label: 'Twenty products to a page; the inventory list pages the same table at fifty', selector: '.category-manager .card-glass .pager', fit: 'right' },
    { label: 'Once a product is chosen its own editor appears below, holding the categories it is filed under today', selector: '[aria-label="Product category editor"] p', text: true }
  ]);

// The assignment list is a scroll box of its own, and the categories this product is actually filed
// under sit below it, so the box is scrolled to the first tick before the picture is taken.
await page.evaluate(() => {
  const box = document.querySelector('.category-manager__assignments');
  const ticked = box?.querySelector('input:checked');
  if (!box || !ticked) return;
  const top = ticked.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
  box.scrollTop = Math.max(0, top - 20);
});
await shot(page, '13e-product-tags-dark', 'Filing a product under categories and tags',
  'The same screen scrolled to that editor: what a product belongs to, which of those is its primary category, and its tags.',
  [
    { label: 'Every category in the tree, indented, with the ones this product is filed under ticked. The list scrolls inside its own box', selector: '.category-manager__assignments' },
    { label: 'Primary category: the one the product page marks "· primary" and the order line records. Always one of the ticked ones', selector: '[aria-label="Product category editor"] > .field:nth-of-type(1) select', fit: 'right' },
    { label: 'Tags, comma separated. The customer’s filter chips are built from these', selector: '[aria-label="Product category editor"] > .field:nth-of-type(2) input' },
    { label: 'Save product categories sends the whole set as one request, so a product is never left between two states', selector: '[aria-label="Product category editor"] .btn--primary', fit: 'right' }
  ], '[aria-label="Product category editor"]');
// ---------------------------------------------------------------- inventory
console.log('inventory screens');
await signIn(page, 'inventory@ninecube.demo');
await light(page);
await page.goto(`${BASE}/inventory`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('tbody tr', { timeout: 90_000 });
await page.waitForTimeout(600);
await shot(page, '15-inventory', 'Inventory',
  'Where products are created and stock is corrected. Every change is appended to the ledger, and the database refuses to go below zero.',
  [
    { label: 'Search by name or SKU', selector: '#inventory-search' },
    { label: 'New product. A new product starts at zero stock on purpose - stock arrives through an adjustment so it is audited', selector: '.page .btn--primary', fit: 'right' },
    { label: 'Stock and availability per row. Rows at or below the low-stock threshold are marked', selector: 'tbody tr', fit: 'right' },
    { label: 'Edit opens the product form', selector: 'td.actions .btn' },
    { label: 'Adjust stock opens the signed adjustment', selector: 'td.actions .btn--primary' },
    { label: 'History opens the same dialog on the movement ledger', selector: 'td.actions .link-button', fit: 'right' }
  ]);

await page.getByRole('checkbox', { name: /^Select all products on this page$/ }).check();
await page.waitForSelector('[data-testid="product-bulk-bar"]', { timeout: 30_000 });
await page.waitForTimeout(400);
await shot(page, '16-bulk-edit', 'Bulk editing products',
  'Category, tag, brand and active state can be set for a page of products at once. Stock is never part of a bulk edit - it keeps its atomic, single-product path.',
  [
    { label: 'How many products are selected', selector: '[data-testid="bulkbar-count"]' },
    { label: 'The action. Stock is deliberately absent from this list', selector: '#bulk-action' },
    { label: 'The parameter the action needs: a category, tags, or a brand and series', selector: '.bulkbar .field:nth-of-type(2), #bulk-category' },
    { label: 'Review changes opens the confirmation dialog', selector: '.bulkbar .btn--primary', fit: 'right' },
    { label: 'Clear drops the selection and the bar goes with it', loc: page.getByRole('button', { name: /Clear/i }), fit: 'right' }
  ]);

await page.selectOption('#bulk-action', 'deactivate');
await page.getByRole('button', { name: /Review changes/i }).click();
await page.waitForSelector('[role="dialog"]', { timeout: 30_000 });
await page.waitForTimeout(400);
await shot(page, '17-bulk-confirm', 'Confirming a bulk edit',
  'Nothing is written until this dialog is confirmed, and the summary says what will happen.',
  [
    { label: 'What is about to change, and to how many products', selector: '.modal' },
    { label: 'Products that already match are skipped, so re-running is safe', selector: '.modal p' },
    { label: 'Apply changes sends one request for the whole selection', selector: '.modal .btn--primary', fit: 'right' },
    { label: 'Cancel closes it without a request', loc: page.getByRole('button', { name: /Cancel/i }).last(), fit: 'right' }
  ]);
await page.getByRole('button', { name: /Cancel/i }).last().click();

await page.getByRole('checkbox', { name: /^Select all products on this page$/ }).uncheck();
await page.getByRole('button', { name: 'Adjust stock' }).first().click();
await page.waitForSelector('[role="dialog"]', { timeout: 30_000 });
await page.waitForTimeout(500);
await shot(page, '18-adjust-stock', 'Adjusting stock',
  'The only way stock changes outside an order, and it always carries a reason.',
  [
    { label: 'The product and its current quantity', selector: '.modal h3' },
    { label: 'A signed number: negative for shrinkage or damage, positive for a delivery', selector: '#adjust-delta' },
    { label: 'Reason is mandatory, and lands in the ledger with your name', selector: '#adjust-reason' },
    { label: 'Apply adjustment. If it would take the product below zero the server refuses it', selector: '.modal .btn--primary', fit: 'right' }
  ]);

await page.waitForSelector('.modal table, .modal p.muted', { timeout: 30_000 });
await shot(page, '18b-movement-history', 'The movement ledger for one product',
  'The same dialog, scrolled down: every stock change against the product, with who made it and why. A product nobody has touched says so.',
  [
    { label: 'The ledger heading. Opening it from a row puts the keyboard focus here, so the history can be read straight away', selector: '#movement-history' },
    { label: 'Movement history for this product: when, by how much, why and who. A product with no movements yet says so', selector: '.modal table, .modal p.muted' }
  ], '#movement-history');
await page.keyboard.press('Escape');

// ---------------------------------------------------------------- admin
console.log('admin screens');
await signIn(page, 'admin@ninecube.demo');
await light(page);
await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('tbody tr', { timeout: 90_000 });
await page.waitForTimeout(600);
await shot(page, '19-admin-users', 'Administration: users',
  'Administrators create staff logins, change roles and switch accounts off. They are read-only on orders and inventory, so nobody can both sell and silently restock.',
  [
    { label: 'The three sections: Users, Audit log, Settings', selector: '[role=tablist]' },
    { label: 'Create a user: email, password, role, and a name when the role is Customer', selector: 'form' },
    { label: 'Change a role from the row itself. It takes effect on the user’s next request', selector: 'select' },
    { label: 'Deactivate keeps the history and blocks the login. The last active administrator cannot be removed', selector: 'td.actions .btn', fit: 'right' }
  ]);

await page.getByRole('tab', { name: /Audit log/i }).click();
await page.waitForSelector('tbody tr', { timeout: 30_000 });
await page.waitForTimeout(400);
await shot(page, '20-admin-audit', 'Administration: audit log',
  'What happened, who did it and when. It is the record the concurrency design writes as it goes.',
  [
    { label: 'Filter by action prefix, for example order. or user.', selector: 'input[type=search], input[placeholder*="order."]' },
    { label: 'When, actor, action, entity and the details of the change', selector: 'table' }
  ]);

await page.getByRole('tab', { name: /Settings/i }).click();
await page.waitForSelector('input[type=number]', { timeout: 30_000 });
await page.waitForTimeout(400);
await shot(page, '21-admin-settings', 'Administration: settings',
  'The one business number an administrator can edit.',
  [
    { label: 'Low stock threshold. Products at or below it are flagged everywhere in the app, and the inventory rows are marked', selector: 'input[type=number]' },
    { label: 'Save settings writes it to the database, not to a config file', selector: '.btn--primary', fit: 'right' }
  ]);

await writeFileSync(join(OUT_DIR, 'callouts.json'), JSON.stringify(record, null, 2));
console.log(`\nwrote ${record.length} screens and callouts.json to ${OUT_DIR}`);
await browser.close();
