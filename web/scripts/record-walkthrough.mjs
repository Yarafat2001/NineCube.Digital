/**
 * Records the live system walkthrough.
 *
 * One continuous take of a real browser against the running API, walking a customer, the inventory
 * manager, a staff member and an administrator through the workflow while the documented test cases
 * are applied on screen. Nothing is mocked: every figure the take shows is the figure the server
 * returned at that moment.
 *
 *   cd web && set -a && . ../.env && set +a && node scripts/record-walkthrough.mjs
 *
 * Writes docs/walkthrough/ninecube-walkthrough.webm (the picture) and docs/walkthrough/scenes.json
 * (the narration text and the measured length of each scene, which the voice track is cut from).
 *
 * The cursor, highlight, captions and scene cards are drawn inside the page, so the recorder captures
 * them along with the application. Sign-in goes through the login form for the first take and through
 * sessionStorage for the role switches afterwards; the password field is masked, and the token is
 * never rendered.
 */
import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { chromium } from '@playwright/test';
import { player } from './walkthrough-player.mjs';

const BASE = process.env.WALKTHROUGH_BASE_URL ?? 'http://127.0.0.1:5173';
const API = process.env.WALKTHROUGH_API_URL ?? 'http://127.0.0.1:5080';
const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_DIR = join(ROOT_DIR, 'docs', 'walkthrough');
const VIDEO_DIR = join(OUT_DIR, 'video');
const VIEWPORT = { width: 1440, height: 900 };
const SCENE_COUNT = 15;

const password = (process.env.NINECUBE_SEED_PASSWORD ?? '').replace(/^(['"])(.*)\1$/, '$2');
if (!password) {
  console.error('NINECUBE_SEED_PASSWORD is not set; load it from the repository .env first.');
  process.exit(1);
}

mkdirSync(VIDEO_DIR, { recursive: true });

// The closing card quotes the suites, so it quotes the numbers this machine just measured rather than
// ones somebody typed. tools/walkthrough-numbers.mjs runs all three and writes the file.
const numbers = JSON.parse(readFileSync(join(OUT_DIR, 'numbers.json'), 'utf8'));
for (const key of ['backend', 'frontend', 'browser']) {
  if (!Number.isInteger(numbers[key])) throw new Error(`numbers.json has no measured ${key} count`);
}
// The recorder flushes into this directory as it films, so a take that threw half way leaves a
// partial file behind. Only this script writes here, and a finished take is renamed out of it.
for (const entry of readdirSync(VIDEO_DIR)) {
  if (entry.endsWith('.webm')) rmSync(join(VIDEO_DIR, entry));
}

/** Words per second of the desktop narration voice, used to pad a scene to its own commentary. */
const NARRATION_WPS = 2.4;
const narrationMs = text => (text.trim().split(/\s+/).length / NARRATION_WPS) * 1000 + 900;

// ------------------------------------------------------------------ api
async function apiCall(method, path, token, body) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const text = await response.text();
  return { status: response.status, json: text ? JSON.parse(text) : null };
}

async function loginAs(email) {
  const { status, json } = await apiCall('POST', '/api/auth/login', null, { email, password });
  if (!json || !json.accessToken) throw new Error(`login for ${email} returned ${status}`);
  return json;
}

// ------------------------------------------------------------------ plan
// Everything the take needs from the server is read up front, so a scene cannot fail half way
// because a product ran out of stock while the camera was rolling.
const accounts = {
  customer: await loginAs('customer@ninecube.demo'),
  inventory: await loginAs('inventory@ninecube.demo'),
  staff: await loginAs('staff@ninecube.demo'),
  admin: await loginAs('admin@ninecube.demo')
};

// The catalogue is paged at a hundred per request, so the whole list is read before the take starts.
const products = { items: [], totalCount: 1 };
for (let pageNumber = 1; products.items.length < products.totalCount; pageNumber += 1) {
  const { status, json } = await apiCall('GET', `/api/products?page=${pageNumber}&pageSize=100`, accounts.customer.accessToken);
  if (status !== 200) throw new Error(`product search returned ${status}`);
  products.items.push(...json.items);
  products.totalCount = json.totalCount;
}
// A short line of stock makes both halves of the conflict case visible without a long click sequence,
// and the shortest name in that band is the one that reads best when the recorder paints it large.
const band = products.items.filter(p => p.isActive && p.stockQuantity >= 2 && p.stockQuantity <= 6 && p.price > 0);
const target = band.sort((a, b) => a.name.length - b.name.length)[0];
if (!target) throw new Error('no product in the 2-6 stock band; restock the demo data before recording');

const tree = await apiCall('GET', '/api/categories?includeInactive=false', accounts.staff.accessToken);
if (tree.status !== 200) throw new Error(`category tree returned ${tree.status}`);
const flatten = (nodes, out = []) => {
  for (const node of nodes) { out.push(node); flatten(node.children ?? [], out); }
  return out;
};
// The cycle case needs a branch that actually has children, and a child to try to put it under.
const branch = flatten(tree.json).find(c => (c.children ?? []).length > 0 && c.id !== 1);
if (!branch) throw new Error('no category with children; the cycle case cannot be shown');
const descendant = branch.children[0];
const labelOf = category => category.breadcrumb.map(c => c.name).join(' / ');
const branchLabel = labelOf(branch);

const plan = { target, branchLabel, descendantName: descendant.name };
console.log(`   target ${target.sku} · stock ${target.stockQuantity} · branch "${branchLabel}" under "${descendant.name}"`);

// ------------------------------------------------------------------ browser
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: VIEWPORT,
  deviceScaleFactor: 1,
  recordVideo: { dir: VIDEO_DIR, size: VIEWPORT }
});
const page = await context.newPage();
page.setDefaultTimeout(30_000);

await context.addInitScript(() => {
  const install = () => {
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', install, { once: true });
      return;
    }
    const style = document.createElement('style');
    style.textContent = [
      '#wc-root, #wc-root * { pointer-events: none; }',
      '#wc-root { position: fixed; inset: 0; z-index: 2147483600; }',
      '#wc-ring { position: fixed; left: 0; top: 0; border: 3px solid #ffab4d; border-radius: 14px; opacity: 0;',
      '  background: rgba(245,158,11,.10); box-shadow: 0 0 0 9999px rgba(9,6,3,.34), 0 0 26px 4px rgba(245,158,11,.5);',
      '  transition: opacity .28s ease; }',
      '#wc-ring[data-on="1"] { opacity: 1; }',
      '#wc-cursor { position: fixed; left: 0; top: 0; width: 22px; height: 22px; margin: -11px 0 0 -11px;',
      '  border-radius: 50%; background: rgba(245,158,11,.92); border: 3px solid #fff;',
      '  box-shadow: 0 2px 10px rgba(0,0,0,.5); opacity: 0; transition: opacity .25s ease; }',
      '#wc-cursor[data-on="1"] { opacity: 1; }',
      '#wc-ripple { position: fixed; left: 0; top: 0; width: 22px; height: 22px; margin: -11px 0 0 -11px;',
      '  border-radius: 50%; border: 3px solid #ffab4d; opacity: 0; }',
      '#wc-ripple[data-hit="1"] { animation: wc-hit .5s ease-out; }',
      '@keyframes wc-hit { from { opacity: .95; transform: scale(1); } to { opacity: 0; transform: scale(3.4); } }',
      '#wc-bar { position: fixed; left: 28px; right: 28px; bottom: 26px; padding: 14px 20px 15px; border-radius: 16px;',
      '  background: rgba(16,12,8,.86); border: 1px solid rgba(255,171,77,.42); backdrop-filter: blur(10px);',
      '  transform: translateY(18px); opacity: 0; transition: transform .34s cubic-bezier(.2,.9,.2,1), opacity .34s ease; }',
      '#wc-bar[data-on="1"] { transform: none; opacity: 1; }',
      '#wc-bar b { display: block; color: #ffab4d; font: 700 15px/1.25 system-ui, sans-serif; letter-spacing: .09em;',
      '  text-transform: uppercase; margin-bottom: 5px; }',
      '#wc-bar span { display: block; color: #fff8ef; font: 400 21px/1.42 system-ui, sans-serif; }',
      '#wc-card { position: fixed; inset: 0; display: grid; place-items: center; background: rgba(12,9,6,.92);',
      '  opacity: 0; transition: opacity .34s ease; }',
      '#wc-card[data-on="1"] { opacity: 1; }',
      '#wc-card > div { text-align: center; transform: scale(.94); transition: transform .5s cubic-bezier(.2,.9,.2,1); }',
      '#wc-card[data-on="1"] > div { transform: none; }',
      '#wc-card h2 { margin: 0; color: #ffab4d; font: 800 54px/1.1 system-ui, sans-serif; letter-spacing: -.01em; }',
      '#wc-card p { margin: 14px 0 0; color: #f3e7d8; font: 400 22px/1.4 system-ui, sans-serif; }',
      '#wc-card i { display: block; width: 96px; height: 4px; margin: 22px auto 0; border-radius: 2px; background: #ffab4d; }',
      '#wc-badge { position: fixed; top: 18px; left: 22px; padding: 6px 13px; border-radius: 999px; opacity: 0;',
      '  background: rgba(16,12,8,.8); border: 1px solid rgba(255,171,77,.45); color: #ffab4d;',
      '  font: 700 14px/1.4 system-ui, sans-serif; letter-spacing: .08em; transition: opacity .3s ease; }',
      '#wc-badge[data-on="1"] { opacity: 1; }',
      '#wc-progress { position: fixed; left: 0; right: 0; bottom: 0; height: 5px; background: rgba(255,255,255,.14); }',
      '#wc-progress > i { display: block; height: 100%; width: 0; background: linear-gradient(90deg, #f59e0b, #ffab4d);',
      '  transition: width .6s cubic-bezier(.2,.9,.2,1); }'
    ].join('\n');
    document.head.append(style);

    const root = document.createElement('div');
    root.id = 'wc-root';
    root.innerHTML =
      '<div id="wc-ring"></div><div id="wc-cursor"></div><div id="wc-ripple"></div>' +
      '<div id="wc-badge"></div>' +
      '<div id="wc-bar"><b></b><span></span></div>' +
      '<div id="wc-card"><div><h2></h2><p></p><i></i></div></div>' +
      '<div id="wc-progress"><i></i></div>';
    document.body.append(root);

    const ring = root.querySelector('#wc-ring');
    const cursor = root.querySelector('#wc-cursor');
    const ripple = root.querySelector('#wc-ripple');
    const bar = root.querySelector('#wc-bar');
    const card = root.querySelector('#wc-card');
    const badge = root.querySelector('#wc-badge');
    const progress = root.querySelector('#wc-progress > i');

    // One smoothing loop drives every motion, so a new target simply becomes the next destination
    // and the animation never has to be cancelled mid-flight.
    const now = { x: innerWidth / 2 - 60, y: innerHeight / 2 - 30, w: 120, h: 60, cx: -80, cy: -80 };
    const goal = { ...now };
    function frame() {
      for (const key of ['x', 'y', 'w', 'h', 'cx', 'cy']) now[key] += (goal[key] - now[key]) * 0.16;
      ring.style.left = `${now.x}px`;
      ring.style.top = `${now.y}px`;
      ring.style.width = `${Math.max(0, now.w)}px`;
      ring.style.height = `${Math.max(0, now.h)}px`;
      cursor.style.transform = `translate(${now.cx}px, ${now.cy}px)`;
      ripple.style.transform = `translate(${now.cx}px, ${now.cy}px)`;
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    window.__wc = {
      ring(box) {
        if (!box) { ring.dataset.on = '0'; return; }
        goal.x = box.x; goal.y = box.y; goal.w = box.w; goal.h = box.h;
        ring.dataset.on = '1';
      },
      cursor(point) {
        goal.cx = point.x; goal.cy = point.y;
        cursor.dataset.on = '1';
      },
      tap(point) {
        goal.cx = point.x; goal.cy = point.y;
        ripple.dataset.hit = '0';
        void ripple.offsetWidth;
        ripple.dataset.hit = '1';
      },
      caption(title, text) {
        bar.querySelector('b').textContent = title;
        bar.querySelector('span').textContent = text;
        bar.dataset.on = '1';
      },
      hideCaption() { bar.dataset.on = '0'; },
      badge(text) {
        badge.textContent = text;
        badge.dataset.on = text ? '1' : '0';
      },
      progress(ratio) { progress.style.width = `${Math.round(ratio * 100)}%`; },
      async card(title, sub, ms) {
        card.querySelector('h2').textContent = title;
        card.querySelector('p').textContent = sub ?? '';
        card.dataset.on = '1';
        await new Promise(resolve => setTimeout(resolve, ms));
        card.dataset.on = '0';
        await new Promise(resolve => setTimeout(resolve, 380));
      },
      clear() { ring.dataset.on = '0'; cursor.dataset.on = '0'; }
    };
  };
  install();
});

const startedAt = Date.now();
const elapsed = () => Date.now() - startedAt;

async function wc(fn, arg) {
  try {
    await page.evaluate(fn, arg);
  } catch {
    // A navigation can land between the measure and the paint; the next scene repaints anyway.
  }
}

const hold = ms => page.waitForTimeout(ms);

async function caption(title, text) {
  await wc(a => window.__wc.caption(a.title, a.text), { title, text });
}

/** Draw the highlight around a control and glide the cursor to it, then optionally press. */
async function show(loc, { press = true, pad = 8, dwell = 700, optional = false } = {}) {
  // A control that is not there is a finding, not something to wait thirty seconds for: the default
  // actionability timeout is left short so a blocked scene says so inside a breath.
  await loc.first().waitFor({ state: 'visible', timeout: 6_000 }).catch(() => {});
  await loc.first().scrollIntoViewIfNeeded().catch(() => {});
  await hold(160);
  const box = await loc.first().boundingBox().catch(() => null);
  if (!box) {
    if (optional) return null;
    throw new Error(`nothing to highlight on screen: ${loc}`);
  }
  await wc(b => window.__wc.ring(b), { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), w: box.width + pad * 2, h: box.height + pad * 2 });
  const point = { x: box.x + box.width - Math.min(28, box.width / 2), y: box.y + box.height / 2 };
  await wc(p => window.__wc.cursor(p), point);
  await hold(dwell);
  if (press) {
    await wc(p => window.__wc.tap(p), point);
    await hold(240);
  }
  return box;
}

async function click(loc, { pad = 8, dwell = 700 } = {}) {
  await show(loc, { press: true, pad, dwell });
  await loc.click();
}

async function type(loc, text, { pad = 8 } = {}) {
  await show(loc, { press: true, pad, dwell: 420 });
  await loc.click();
  await loc.fill('');
  await loc.pressSequentially(text, { delay: 52 });
  await hold(320);
}

const quantityIn = line => line.locator('.stepper__value').textContent().then(text => Number(text.trim()));

/** The line prints "… each · N available" straight from the server's refetched quantity. */
async function availableIn(line) {
  const meta = await line.locator('.cart-line__meta').nth(1).textContent();
  const matched = /(\d+)\s+available/.exec(meta ?? '');
  if (!matched) throw new Error(`the cart line did not report available stock: "${meta}"`);
  return Number(matched[1]);
}

/** Drives one cart line to a target quantity one click at a time, checking the rendered figure after each. */
async function setCartQuantity(line, wanted) {
  for (let step = 0; step < 40; step += 1) {
    const current = await quantityIn(line);
    if (current === wanted) return current;
    const up = wanted > current;
    const button = line.getByRole('button', { name: up ? /^Increase quantity/ : /^Decrease quantity/ });
    if (await button.isDisabled()) throw new Error(`${up ? 'increase' : 'decrease'} was disabled at ${current}, target ${wanted}`);
    await button.click();
    await hold(320);
  }
  throw new Error(`the cart line never reached ${wanted}`);
}

/** After a 409 the panel re-checks each line without blocking the customer, so the picture waits for the figure to land. */
async function awaitAvailable(line, expected, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  let seen = null;
  while (Date.now() < deadline) {
    seen = await availableIn(line).catch(() => null);
    if (seen === expected) return seen;
    await hold(400);
  }
  throw new Error(`the cart line never reported ${expected} available (last read ${seen})`);
}

const toastTexts = () => page.locator('.toast').allTextContents().then(list => list.map(text => text.replace(/\s+/g, ' ').trim()));

/** Whichever lands first — the order URL or a refusal we have not already seen — decides the scene. */
async function settle(page, beforeTexts, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (/\/orders\/\d+$/.test(new URL(page.url()).pathname)) return { kind: 'order' };
    const fresh = (await toastTexts()).filter(text => !beforeTexts.includes(text) && text.length > 0);
    if (fresh.length > 0) return { kind: 'error', text: fresh[0].slice(0, 200) };
    await hold(250);
  }
  return { kind: 'timeout' };
}

/** The narration of a scene also sets how long the picture dwells on it. */
const scenes = [];
let sceneNumber = 0;
async function scene(id, title, subtitle, captionText, narration, body) {
  sceneNumber += 1;
  const started = elapsed();
  await wc(a => window.__wc.badge(a), `SCENE ${sceneNumber} / ${SCENE_COUNT}`);
  await wc(a => window.__wc.card(a.title, a.sub, 1500), { title, sub: subtitle });
  await caption(title, captionText);
  await hold(400);
  // A scene that cannot complete is said so on screen and recorded in the manifest, rather than
  // costing the whole take: this is a single continuous film, and re-shooting five minutes because
  // one control moved is not a reasonable price.
  let failure = null;
  try {
    await body();
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
    await caption('Blocked', failure.split('\n')[0].slice(0, 180));
    await hold(2400);
  }
  const spent = elapsed() - started;
  const need = narrationMs(narration);
  if (spent < need) await hold(need - spent);
  await wc(() => window.__wc.clear());
  await caption(title, captionText);
  await wc(a => window.__wc.progress(a.ratio), { ratio: sceneNumber / SCENE_COUNT });
  await hold(500);
  scenes.push({
    id,
    scene: sceneNumber,
    title,
    subtitle,
    caption: captionText,
    narration,
    error: failure,
    startMs: started,
    endMs: elapsed(),
    durationMs: elapsed() - started
  });
  console.log(`   ${String(sceneNumber).padStart(2, '0')} ${id}  ${((elapsed() - started) / 1000).toFixed(1)}s`);
}

// ------------------------------------------------------------------ the take
const customerEmail = 'customer@ninecube.demo';

/**
 * Switch role without leaving the take: the session is written straight into the tab's session
 * storage, which is what the app reads on boot, and the next navigation picks it up. Signing through
 * the form every time would be a longer take for the same picture, and the credential adds nothing
 * to it a second time.
 */
async function setSession(session) {
  await page.evaluate(stored => sessionStorage.setItem('ninecube.auth.session', JSON.stringify(stored)), session);
}

await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await hold(1400);

await scene(
  'opening', 'NineCube.Digital', 'Order processing for a Bangladeshi marketplace',
  'Everything in this take is the live application against a live database. No slide, no mock-up.',
  'This is NineCube Digital, an order processing system for a Bangladeshi marketplace. What you are ' +
  'about to see is the running application against the running database, and every rule shown here is ' +
  'a rule the test suite asserts.',
  async () => {
    await show(page.locator('.navbar__brand'), { press: false, dwell: 600 });
    await show(page.locator('.navbar__tray'), { press: false, dwell: 700 });
    await show(page.locator('.theme-controls'), { press: false, dwell: 500 });
    await show(page.locator('.navbar a.btn--primary'), { press: false, dwell: 600 });
    await wc(() => window.__wc.ring(null));
  }
);

await scene(
  'sign-in', 'Signing in', 'Live stock is commercial data',
  'The catalogue needs an account, because availability is business information.',
  'A visitor lands on the showcase. The catalogue itself needs an account, because live stock is ' +
  'treated as commercial information. Signing in issues a bearer token that is held in memory for the ' +
  'tab and mirrored into session storage, so a refresh does not sign you out.',
  async () => {
    await click(page.locator('.navbar a.btn--primary'));
    await page.waitForSelector('#login-email', { timeout: 30_000 });
    await hold(600);
    await type(page.locator('#login-email'), customerEmail);
    // The field is a masked input, so the take shows bullets rather than the credential.
    await type(page.locator('#login-password'), password);
    await caption('Signing in', 'The password field is masked; the token it returns is never rendered on screen.');
    await show(page.locator('form button[type=submit]'), { press: false, dwell: 600 });
    await page.locator('form button[type=submit]').click();
    await page.getByRole('button', { name: 'Account' }).waitFor({ timeout: 60_000 });
    await hold(900);
  }
);

await scene(
  'catalogue', 'The catalogue', 'Server-side truth, URL-side state',
  'Filters live in the address bar, so any view can be linked, reloaded or shared.',
  'This is the catalogue. Filters are held in the address bar rather than in component state, so any ' +
  'view can be reloaded or shared. Each card carries the quantity the server reported, and the badge ' +
  'spells the state out rather than relying on colour.',
  async () => {
    await page.goto(`${BASE}/products?${new URLSearchParams({ q: target.sku }).toString()}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.product-card', { timeout: 60_000 });
    await hold(800);
    await caption('The catalogue', `Deep link: /products?q=${target.sku} — the search box and the result list agree with it.`);
    await show(page.locator('#product-search'), { press: false, dwell: 900 });
    const typedValue = await page.locator('#product-search').inputValue();
    if (typedValue !== target.sku) throw new Error(`URL state did not restore the search: got "${typedValue}"`);
    await show(page.locator('.product-card').first(), { press: false, dwell: 800 });
    await show(page.locator('.product-card .badge').first(), { press: false, dwell: 700 });
    await wc(() => window.__wc.ring(null));
  }
);

await scene(
  'stepper-cap', 'Test case: the stepper cannot outrun stock', 'Rule asserted in the suite',
  'The plus button switches itself off at the quantity actually on the shelf.',
  'First test case. The card is offering four units because four units exist. The stepper caps at the ' +
  'live figure by disabling the increase control, so an over-order cannot be built in the interface at ' +
  'all. This is the same rule the frontend suite asserts.',
  async () => {
    const card = page.locator('.product-card').first();
    const stepper = card.locator('[role=group][aria-label^="Quantity"]');
    const increase = stepper.getByRole('button', { name: /^Increase quantity/ });
    await show(stepper, { press: false, dwell: 700 });
    const steps = Math.max(1, target.stockQuantity - 1);
    for (let index = 0; index < steps; index += 1) {
      await increase.click();
      await hold(260);
    }
    const shown = await stepper.locator('[data-testid=stepper-value]').textContent();
    if (Number(shown) !== target.stockQuantity) throw new Error(`stepper stopped at ${shown}, expected ${target.stockQuantity}`);
    const disabled = await increase.isDisabled();
    if (!disabled) throw new Error('the increase control stayed live at the stock cap');
    await show(increase, { press: false, dwell: 1100 });
    await caption('Test case passed', `Quantity ${shown} equals stock ${target.stockQuantity}; the control is disabled and the click was refused.`);
  }
);

await scene(
  'conflict', 'Test case: stock moved while the cart waited', 'The 409 that names the line',
  'The server refuses the order and the panel says which item, by name and SKU.',
  'Second test case, and the interesting one. The cart holds the whole remaining stock. While it sat ' +
  'there, another order took one unit. The server answers with a conflict that names the short line, ' +
  'the panel keeps the cart so it can be fixed, and the stock figure is refetched from the server ' +
  'rather than guessed.',
  async () => {
    await click(page.getByRole('button', { name: /^Add to cart/ }).first(), { dwell: 500 });
    const sheetButton = page.getByRole('button', { name: /^Cart, / }).first();
    await show(sheetButton, { press: false });
    await sheetButton.click();
    await page.waitForSelector('[aria-label="Your cart"]', { timeout: 30_000 });
    await hold(700);

    const competing = await apiCall('POST', '/api/orders', accounts.customer.accessToken, {
      items: [{ productId: target.id, quantity: 1 }]
    });
    if (competing.status !== 201) throw new Error(`the competing order returned ${competing.status}`);
    plan.competingOrderId = competing.json.id;
    await caption('While the cart waited', `Order #${competing.json.id} took one unit through the API. Stock on ${target.sku} is now ${target.stockQuantity - 1}.`);
    await hold(1200);

    await show(page.locator('.sheet').getByRole('button', { name: 'Place order' }), { press: false });
    await page.locator('.sheet').getByRole('button', { name: 'Place order' }).click();
    await page.waitForSelector('[data-testid="short-items"]', { timeout: 30_000 });
    await hold(700);
    await show(page.locator('[data-testid="short-items"]'), { press: false, dwell: 1400 });
    const banner = await page.locator('[data-testid="short-items"]').textContent();
    if (!banner.includes(target.name)) throw new Error('the conflict banner did not name the short product');
    await caption('Test case passed', 'A 409 with the short line named. The cart was kept and the quantities were refetched, exactly as the contract promises.');
  }
);

await scene(
  'place-order', 'Test case: order placed, stock reserved', 'One transaction, one promise',
  'Reduce to what exists, place the order, and the stock is reserved in the same transaction.',
  'Third test case: the recovery. The line is reduced to the quantity that really exists and the order ' +
  'goes through. Placement and reservation happen in one transaction, and the request carries an ' +
  'idempotency key, so a retry on a flaky network returns the original order instead of a second one.',
  async () => {
    const line = page.locator(`[data-testid="cart-line-${target.id}"]`);
    await show(line, { press: false, dwell: 600 });

    const wanted = await awaitAvailable(line, target.stockQuantity - 1);
    const before = await quantityIn(line);
    await caption('The server figure', `The line now reads ${wanted} available; the cart is still holding ${before}.`);
    await setCartQuantity(line, wanted);
    const settled = await quantityIn(line);
    if (settled !== wanted) throw new Error(`the cart line settled at ${settled}, wanted ${wanted}`);

    await page.locator('[data-testid="short-items"]').waitFor({ state: 'detached', timeout: 10_000 });
    await caption('The banner answers itself', 'The line now fits the server figure, so the shortage notice retires instead of staying to accuse a corrected cart.');
    await show(page.locator('[data-testid=cart-total]'), { press: false, dwell: 700 });

    const beforeTexts = await toastTexts();
    const placeButton = page.locator('.sheet').getByRole('button', { name: 'Place order' });
    await show(placeButton, { press: true, dwell: 400 });
    await placeButton.click();

    const outcome = await settle(page, beforeTexts, 45_000);
    if (outcome.kind !== 'order') {
      const sheet = (await page.locator('.sheet').textContent().catch(() => '')) ?? '';
      throw new Error(
        `${outcome.kind === 'error' ? `the server refused the order: ${outcome.text}` : 'no order and no refusal within 45s'} ` +
          `| cart line quantity ${settled}, available ${wanted} | panel said: ${sheet.replace(/\s+/g, ' ').slice(0, 260)}`
      );
    }
    await hold(1500);
    plan.orderId = Number(new URL(page.url()).pathname.split('/').pop());
    plan.orderQuantity = settled;
    await caption('Order placed', `Order #${plan.orderId} was created with ${settled} units and the stock was reserved in the same transaction.`);
  }
);

await scene(
  'order-detail', 'The order and its timeline', 'Snapshot prices, not live ones',
  'The lines record the price the server charged at that moment, so a later price change rewrites no history.',
  'The order page shows where the order is. The timeline is the state machine made visible: pending, ' +
  'confirmed, shipped, with rejected and cancelled as terminals. The lines snapshot the name and the ' +
  'unit price from the moment of purchase, so a price change next week changes no history. The invoice ' +
  'is the same order on one printable page.',
  async () => {
    await show(page.locator('.page-header .badge').first(), { press: false, dwell: 800 });
    await show(page.locator('[aria-label="Order status timeline"]'), { press: false, dwell: 1000 });
    await show(page.locator('table').first(), { press: false, dwell: 900 });
    await caption('Snapshot, not live data', `Line prices and names were written when order #${plan.orderId} was placed.`);
    await show(page.locator('.page-header a.btn').first(), { press: false, dwell: 800, optional: true });
  }
);

await scene(
  'account', 'Dashboard and notifications', 'Both roles get told',
  'The customer sees their own totals; staff get a notification for the same event.',
  'Fourth test case, on the customer side: the dashboard counts only your own orders, and the ' +
  'notification inbox recorded the placement. Notifications are per user and per event, so the same ' +
  'order tells the buyer it was received and tells the sales desk it arrived.',
  async () => {
    await page.goto(`${BASE}/account`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="dashboard-stats"]', { timeout: 60_000 });
    await hold(700);
    await show(page.locator('[data-testid="dashboard-stats"]'), { press: false, dwell: 1100 });
    await page.goto(`${BASE}/notifications`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('main', { timeout: 60_000 });
    await hold(900);
    await show(page.locator('.notif-list--page .notif-item').first(), { press: false, dwell: 1200 });
  }
);

await scene(
  'adjust-refused', 'Test case: stock cannot go below zero', 'The database refuses, not the form',
  'A signed adjustment that would leave the product short is refused by the server.',
  'Fifth test case, now as the inventory manager. Stock is corrected with a signed adjustment and a ' +
  'mandatory reason. An adjustment that would take the product below zero is refused by the server, ' +
  'and the constraint that refuses it sits in the database, so it holds no matter which client asks.',
  async () => {
    await setSession(accounts.inventory);
    await page.goto(`${BASE}/inventory`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#inventory-search', { timeout: 60_000 });
    await hold(700);
    await type(page.locator('#inventory-search'), target.sku);
    await page.waitForSelector('tbody tr', { timeout: 60_000 });
    await hold(900);
    const row = page.locator('tbody tr').first();
    await show(row, { press: false, dwell: 800 });
    await caption('Inventory manager', `${target.name} · ${target.sku} · stock as the server reports it.`);
    await click(page.getByRole('button', { name: 'Adjust stock' }).first(), { dwell: 600 });
    await page.waitForSelector('#adjust-delta', { timeout: 30_000 });
    await hold(700);
    await type(page.locator('#adjust-delta'), String(-(target.stockQuantity + 1)));
    await type(page.locator('#adjust-reason'), 'Walkthrough: impossible withdrawal');
    await click(page.locator('.modal .btn--primary'), { dwell: 500 });
    await page.waitForSelector('.modal [role="alert"]', { timeout: 30_000 });
    await hold(600);
    await show(page.locator('.modal [role="alert"]').first(), { press: false, dwell: 1400 });
    const refusal = await page.locator('.modal [role="alert"]').first().textContent();
    await caption('Test case passed', `A withdrawal of ${target.stockQuantity + 1} against ${target.stockQuantity} on the shelf was refused: ${refusal}`);
  }
);

await scene(
  'ledger', 'Test case: a real receipt lands in the ledger', 'Append-only, with a name against it',
  'A positive adjustment with a reason appends a movement and the history shows who made it.',
  'Sixth test case: the same dialog, used properly. A positive adjustment with a reason appends one ' +
  'row to an append-only ledger with the actor and the reason attached. The history below the form is ' +
  'that ledger, read back.',
  async () => {
    await page.locator('#adjust-delta').fill('5');
    await hold(200);
    await page.locator('#adjust-reason').fill('Walkthrough: goods received');
    await hold(300);
    await show(page.locator('#adjust-delta'), { press: false, dwell: 500 });
    await show(page.locator('#adjust-reason'), { press: false, dwell: 500 });
    await click(page.locator('.modal .btn--primary'), { dwell: 400 });
    await page.waitForSelector('.toast--success', { timeout: 30_000 });
    const toast = await page.locator('.toast--success').last().textContent();
    if (!/is now/.test(toast ?? '')) throw new Error(`no confirmation toast: ${toast}`);
    await hold(1200);
    await show(page.locator('#movement-history'), { press: false, dwell: 700 });
    await page.evaluate(() => document.querySelector('#movement-history')?.scrollIntoView({ block: 'center' }));
    await hold(700);
    await page.waitForSelector('.modal table', { timeout: 30_000 }).catch(() => {});
    await show(page.locator('.modal table').first(), { press: false, dwell: 1400 });
    await caption('One row appended', 'The movement records when, by how much, why and who. History is never edited, only added to.');
    await page.keyboard.press('Escape');
    await hold(500);
  }
);

await scene(
  'bulk', 'Test case: bulk edits leave stock alone', 'The action list has no stock entry',
  'Category, tags, brand and active state go in bulk. Stock is not offered, by design.',
  'Seventh test case. A page of products can be refiled, retagged, rebranded or switched off in one ' +
  'action, and the whole point of this screen is what is missing from the list: there is no stock ' +
  'action. Stock keeps its atomic, single-product path with the row version guard. Nothing is written ' +
  'until the review dialog is confirmed, and this take cancels it.',
  async () => {
    await type(page.locator('#inventory-search'), '', { pad: 6 });
    await page.waitForSelector('tbody tr', { timeout: 60_000 });
    await hold(1200);
    await show(page.getByRole('checkbox', { name: /^Select all products on this page$/ }), { press: false });
    await page.getByRole('checkbox', { name: /^Select all products on this page$/ }).check();
    await page.waitForSelector('[data-testid="product-bulk-bar"]', { timeout: 30_000 });
    await hold(700);
    await show(page.locator('[data-testid="bulkbar-count"]'), { press: false, dwell: 800 });
    await show(page.locator('#bulk-action'), { press: false, dwell: 600 });
    const options = await page.locator('#bulk-action option').allTextContents();
    if (options.some(option => /stock|quantity/i.test(option))) {
      throw new Error(`a stock action is offered in bulk: ${options.join(', ')}`);
    }
    await page.locator('#bulk-action').selectOption('deactivate');
    await hold(400);
    await show(page.getByRole('button', { name: /Review changes/i }), { press: false });
    await page.getByRole('button', { name: /Review changes/i }).click();
    await page.waitForSelector('[role="dialog"]', { timeout: 30_000 });
    await hold(800);
    await show(page.locator('.modal').first(), { press: false, dwell: 1200 });
    await caption('Bulk actions offered', options.join(' · '));
    await click(page.getByRole('button', { name: /Cancel/i }).last(), { dwell: 500 });
    await show(page.getByRole('checkbox', { name: /^Select all products on this page$/ }), { press: false });
    await page.getByRole('checkbox', { name: /^Select all products on this page$/ }).uncheck();
    await hold(500);
    await caption('Test case passed', 'The dialog opened, the selection was cancelled, and no product was touched.');
  }
);

await scene(
  'category-cycle', 'Test case: a category cannot move under itself', 'Refused by the service, not the widget',
  'Moving a branch under one of its own descendants is refused, and the tree stays exactly as it was.',
  'Eighth test case, as staff. The category manager moves branches by picking a new parent. Choosing ' +
  'one of the branch’s own descendants would create a cycle in the tree, and the service refuses it ' +
  'with the sentence on screen. Nothing changed: the branch is still where it was.',
  async () => {
    await setSession(accounts.staff);
    await page.goto(`${BASE}/staff`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Categories & products', exact: true }).waitFor({ timeout: 60_000 });
    await click(page.getByRole('button', { name: 'Categories & products', exact: true }), { dwell: 600 });
    await page.waitForSelector('.category-manager td .btn', { timeout: 60_000 });
    await hold(600);
    await type(page.locator('#category-search'), branch.name);
    await hold(900);
    const edit = page.getByRole('button', { name: `Edit ${branchLabel}`, exact: true });
    await edit.waitFor({ timeout: 30_000 });
    await click(edit, { dwell: 500 });
    await page.waitForSelector('[aria-label="Category editor"]', { timeout: 30_000 });
    await hold(700);
    await show(page.locator('[aria-label="Category editor"] .field:nth-of-type(3) select'), { press: false, dwell: 600 });
    await page.locator('[aria-label="Category editor"] .field:nth-of-type(3) select').selectOption(String(descendant.id));
    await hold(500);
    await caption('New parent chosen', `${branchLabel} → its own descendant ${descendant.name}.`);
    await click(page.getByRole('button', { name: 'Move category', exact: true }), { dwell: 500 });
    await page.waitForSelector('.category-manager__error', { timeout: 30_000 });
    await hold(600);
    await show(page.locator('.category-manager__error').first(), { press: false, dwell: 1600 });
    const message = await page.locator('.category-manager__error').first().textContent();
    if (!/cannot move under itself or a descendant/i.test(message)) throw new Error(`unexpected refusal: ${message}`);
    await page.keyboard.press('Escape');
    await hold(700);
  }
);

await scene(
  'sales', 'Sales summary and the staff queue', 'Read-only reporting, guarded transitions',
  'Reporting is a read over every order; the queue moves an order one step with a conditional update.',
  'Ninth test case is about the boundary between roles. The sales summary is read-only reporting over ' +
  'every order, with cancelled and rejected orders counted but bringing in no revenue. Staff can move ' +
  'an order from pending to confirmed or rejected, and that transition is a conditional update, so ' +
  'two people pressing the same button at once cannot both change the outcome.',
  async () => {
    await page.goto(`${BASE}/staff`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('tbody tr', { timeout: 60_000 });
    await hold(800);
    await show(page.locator('[aria-label="Order queues"]'), { press: false, dwell: 1000 });
    await show(page.locator('tbody tr').first(), { press: false, dwell: 900 });
    await page.goto(`${BASE}/staff/sales`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.stat-tile, table', { timeout: 60_000 });
    await hold(900);
    await show(page.locator('.stat-tile').first(), { press: false, dwell: 1100 });
    await show(page.locator('table').first(), { press: false, dwell: 900 });
    await caption('No writes on this screen', 'The figures are a read over the orders table, priced in BDT.');
  }
);

await scene(
  'admin', 'Administration: roles, audit and the one setting', 'Separation of duties',
  'Roles are assigned here, every change is in the audit log, and one business number is editable.',
  'Tenth test case, as administrator. Staff logins are created here and roles are changed here, and ' +
  'the change takes effect on the next request the user makes. The audit log is the record the ' +
  'concurrency design writes as it goes. One business number is editable, the low stock threshold, ' +
  'and it is stored in the database rather than a config file. Administrators are read-only on orders ' +
  'and inventory, so nobody can both sell and quietly restock.',
  async () => {
    await setSession(accounts.admin);
    await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('tbody tr', { timeout: 60_000 });
    await hold(800);
    await show(page.locator('select').first(), { press: false, dwell: 900 });
    await show(page.locator('tbody tr').nth(1), { press: false, dwell: 700 });
    await click(page.getByRole('tab', { name: /Audit log/i }), { dwell: 500 });
    await page.waitForSelector('tbody tr', { timeout: 30_000 });
    await hold(800);
    await show(page.locator('table').first(), { press: false, dwell: 1300 });
    await click(page.getByRole('tab', { name: /Settings/i }), { dwell: 500 });
    await page.waitForSelector('input[type=number]', { timeout: 30_000 });
    await hold(600);
    await show(page.locator('input[type=number]').first(), { press: false, dwell: 1100 });
    await caption('Read, not written', 'The threshold is shown as stored. This take saves nothing here.');
  }
);

await scene(
  'closing', 'The whole workflow, shown running', 'Tests, screens and the same database',
  'Every refusal, cap and ledger row in this take is asserted by the suite and visible here.',
  'That is the workflow end to end: catalogue, cart, conflict, order, account, stock, bulk edit, ' +
  'categories, sales and administration. Every rule shown here is asserted by an automated test, and ' +
  'every screen is documented with the same picture in the user manual.',
  async () => {
    await wc(() => window.__wc.ring(null));
    const currencies = [...new Set(products.items.map(product => product.currency).filter(Boolean))];
    const money = currencies.join(' / ') || 'BDT';
    const counts = `${products.totalCount} products in ${money} · ${numbers.backend} backend tests · `
      + `${numbers.frontend} frontend tests · ${numbers.browser} browser checks`;
    await caption('The numbers behind the take', counts);
    await hold(1800);
    await wc(a => window.__wc.card(a.title, a.sub, 2200), { title: 'NineCube.Digital', sub: 'Order processing, running live' });
  }
);

// ------------------------------------------------------------------ package
const video = page.video();
await context.close();
const recorded = await video.path();
const finalVideo = join(OUT_DIR, 'ninecube-walkthrough.webm');
renameSync(recorded, finalVideo);
await browser.close();

const totalMs = scenes.reduce((sum, entry) => sum + entry.durationMs, 0);
const manifest = {
  generatedAt: new Date().toISOString(),
  base: BASE,
  api: API,
  viewport: VIEWPORT,
  video: 'ninecube-walkthrough.webm',
  narration: 'ninecube-narration.wav',
  totalMs,
  words: scenes.reduce((sum, entry) => sum + entry.narration.trim().split(/\s+/).length, 0),
  measured: { products: products.totalCount, ...numbers },
  plan,
  scenes
};
writeFileSync(join(OUT_DIR, 'scenes.json'), JSON.stringify(manifest, null, 2));

// The recorder produces a silent picture (that is what the browser captures) and the voice is cut
// against the same measured timeline by tools/narrate_walkthrough.py. Nothing on this machine can
// mux the two into one file without ffmpeg, so this page plays them together and carries the script
// as readable text: open it and press play, and the take runs with its narration.
writeFileSync(join(OUT_DIR, 'index.html'), player(manifest));

console.log(`\nrecording: ${(totalMs / 1000).toFixed(1)}s over ${scenes.length} scenes -> ${finalVideo}`);
console.log(`narration: ${manifest.words} words -> scenes.json, player written to index.html`);

const blocked = scenes.filter(entry => entry.error);
for (const entry of blocked) console.error(`scene ${entry.scene} (${entry.id}) was blocked: ${entry.error}`);
// The counter is painted into the picture as it films, so a scene added without telling it would be
// wrong in the finished take rather than merely wrong in the manifest.
if (sceneNumber !== SCENE_COUNT) {
  console.error(`the take ran ${sceneNumber} scenes while the on-screen counter reads ${SCENE_COUNT}`);
}
if (blocked.length || sceneNumber !== SCENE_COUNT) process.exitCode = 1;
