# web/TESTING.md — frontend verification record

Everything below was executed on this machine on **14 October 2026**. Nothing is reported as tested
unless it was run; what could not be run is listed in [§8](#8-not-run-and-limits). The backend half of
the project, and the shared environment details, are in the [root TESTING.md](../TESTING.md).

## 1. Environment used

| | |
| --- | --- |
| Node.js | v22.19.0 |
| npm | bundled with the above |
| Browser for end-to-end | Chromium (Playwright 1.47.2, `devices['Desktop Chrome']`) |
| API | `NineCube.Api` on `http://127.0.0.1:5080`, LocalDB database |
| SPA | Vite dev server on `http://127.0.0.1:5173` |
| Three.js | 0.180.0 (the reference's version), installed from npm |

## 2. Typecheck

```bash
cd web && npm run typecheck
```

```
tsc --noEmit -p tsconfig.json      → exit 0, no output
```

## 3. Unit and component tests — 55 passed at the time, 159 now, 0 failed

```bash
cd web && npm run test:run
```

```
 Test Files  9 passed (9)
      Tests  55 passed (55)
   Duration  18.66s
```

That run is from the week the frontend suite was written. It has grown since — categories,
brands and series, images, bulk edits, notifications, profile, dashboard and the appearance
contracts — and the current shape is **23 files and 159 tests**; the 16 October rerun is
pasted in [../TESTING.md §16b](../TESTING.md). The table below still describes what each
area asserts, only the counts above it are historical.
| File | Tests | Covers |
| --- | --- | --- |
| `src/test/stock-badge.test.tsx` | 5 | In stock / Low stock / Out of stock, icon + text, threshold from the API |
| `src/test/stepper.test.tsx` | 4 | Keyboard operation and the client-side cap at available stock |
| `src/test/checkout.test.tsx` | 8 | 201 confirmation and cart clearing, 409 short-items list with the cart kept, double-click sends one request, inline errors and toasts |
| `src/test/orders.test.tsx` | 8 | Order lookup, status timeline, cancel affordances, invoice |
| `src/test/navbar.test.tsx` | 7 | Per-role links, active highlight including the most-specific-match rule, the showcase link on `/`, arrow-key navigation, sign-out |
| `src/test/guards.test.tsx` | 8 | Anonymous and wrong-role redirects, the public showcase, 404 |
| `src/test/catalogue-roles.test.tsx` | 4 | Customer ordering controls vs a read-only catalogue for the other three roles |
| `src/test/helix-showcase.test.tsx` | 8 | Static-grid fallback (no WebGL and reduced motion), card-artwork resolution/repetition, scroll takeover release, error boundary |
| `src/test/helpers.test.ts` | 3 | Money, status metadata, stock level |

The showcase tests run in jsdom, which has no WebGL at all — that *is* the "browser cannot run the
scene" case, so the fallback is exercised on every run rather than mocked.

## 4. Production build

```bash
cd web && npm run build
```

```
✓ 111 modules transformed.
dist/index.html                          1.13 kB │ gzip:   0.59 kB
dist/assets/ShowcasePage-Ba1OsC_n.css    4.72 kB │ gzip:   1.40 kB
dist/assets/index-DQnto4Mg.css          20.82 kB │ gzip:   5.02 kB
dist/assets/ShowcasePage-9uqxgGa6.js     5.44 kB │ gzip:   2.38 kB
dist/assets/OrdersPages-D7PV6WL2.js      6.42 kB │ gzip:   2.17 kB
dist/assets/AdminPage-CCzLA3M7.js        7.64 kB │ gzip:   2.39 kB
dist/assets/InventoryPage-XCXNJdNc.js    8.45 kB │ gzip:   2.67 kB
dist/assets/ProductsPage-Btj-QMlY.js     8.87 kB │ gzip:   3.29 kB
dist/assets/StaffPage-Bot-cSrx.js        9.54 kB │ gzip:   2.82 kB
dist/assets/hooks-D7IBiQWi.js           17.11 kB │ gzip:   5.41 kB
dist/assets/index-C-q1U8xt.js          214.81 kB │ gzip:  69.30 kB
dist/assets/HelixCanvas-33UUvdbU.js    486.62 kB │ gzip: 124.56 kB
✓ built in 6.59s
```

**Three.js is not in the main bundle.** Measured, not assumed — the built chunks were inspected for the
library's own symbol:

```
$ grep -c WebGLRenderer dist/assets/index-*.js         # main entry chunk
0
$ grep -c WebGLRenderer dist/assets/HelixCanvas-*.js   # lazy showcase chunk
5
$ grep -o 'assets/[A-Za-z0-9_.-]*\.js' dist/index.html
assets/index-C-q1U8xt.js
```

The only script the entry document loads is the 214 kB main chunk; the 486 kB scene chunk is fetched on
demand, when a visitor opens `/` in a browser that can run it.

## 5. End-to-end — 22 passed at the time, 107 now, 0 failed

```bash
cd web && NINECUBE_SEED_PASSWORD='<demo password>' npx playwright test
```

The list below is the run as it stood that week. The suite is now 23 spec files and 107 cases —
order flow, the bulk console, categories, images, themes, navbar states, actionable surfaces and the
role × viewport audit; [../TESTING.md §16c](../TESTING.md) has the 16 October record.

```
Running 22 tests using 1 worker
  ok 1  order-flow   a customer reserves stock and a staff member confirms the order
  ok 2  showcase     runs, times and blends correctly at 1440px
  ok 3  showcase     runs, times and blends correctly at 1024px
  ok 4  showcase     runs, times and blends correctly at 768px
  ok 5  showcase     runs, times and blends correctly at 390px
  ok 6  showcase     mounts and disposes cleanly on navigation, including a second visit
  ok 7  showcase     falls back to the static grid when the visitor prefers reduced motion
  ok 8  showcase     falls back to the static grid when WebGL is unavailable
  ok 9  theme-images logo is visible and selected themes persist across reloads
  ok 10 theme-images API catalogue photographs load and broken images have a fallback
  ok 11-22 ui-audit  every role (customer/staff/inventory/admin) × 390/768/1440 px
  22 passed (7.2m)
```

The `ui-audit` spec now walks `/` (the animated showcase) as well as `/products` and each console, for
every role at every viewport, and fails on any console error, page error, failed request or horizontal
overflow. All 12 combinations are clean.

`order-flow` still places a real order end to end: sign in as a customer, search the catalogue at
`/products`, add to cart, place the order, land on the order detail, confirm stock dropped by one, then
sign in as staff and confirm the order.

## 6. Showcase verification against the reference `VALIDATION.md`

The checklist is the one shipped with the reference implementation and vendored at
`src/helix/reference/VALIDATION.md`. The columns say how each item was decided, because "looks right"
is not evidence.

| VALIDATION.md item | How it was checked | Result |
| --- | --- | --- |
| Page begins with the dark hero treatment | Screenshot at 390/768/1024/1440 + measured `#introTrack` background `#0a0f1f` | Pass |
| Brand visible in the opening section | Rendered text asserted in the DOM | Pass |
| The hero scrolls naturally rather than remaining pinned | `#introTrack` has no sticky positioning and its rect moves 1:1 with scroll | Pass |
| Scene transitions smoothly from dark to light | Blend colours recomputed per frame; captured frame at 8% progress is light paper with the shade at 0.18 | Pass |
| Transition title appears and clears before the editorial titles | Opacity sampled per frame: > 0.2 at 8% progress, 0 by ~11% | Pass |
| `DESIGN +` and `MOTION` enter from opposite sides | Transform read at 15% progress: −5.2 vw and +5.2 vw | Pass |
| The `+` keeps its scale, spacing and alignment | Reference rules (`.plus-gap`, flex gap `0.62em`, scale `1.16em`) carried over unchanged | Pass (code-level) |
| Both titles hold visibly before exiting outward | Both at ~0 vw with opacity 0.78 across the hold window | Pass |
| Title sequence clears before the grid resolves | Transform read at 80% progress: displaced 86 vw, i.e. outside the frame | Pass |
| Nine cards appear in sequence | Nine textures requested; nine meshes in the scene | Pass |
| Cards move smoothly through the helix as the page scrolls | Frame-to-frame `#bar` progress tracks the eased scroll value | Pass |
| **Cards bend along the curve rather than flat planes** | Card top edges measured per column on a mid-travel 1440 px frame: they cross y 130 → 881 with a mean slope of 5.2 px per 4 px of x, i.e. continuously slanted edges rather than flat plateaus | Pass |
| Camera perspective, depth and card scale match the reference | Camera (FOV 35, z 9.25 / 11.8 below 800 px) and all card dimensions are the reference's values | Pass (code-level) |
| Images fill the card without stretching | Cover-crop shader with per-target aspect; independently computed for helix (2.8 × 1.34) and grid (2.54 × 1.77) | Pass |
| Mixed aspect ratios and SVG/JPG/PNG/WebP, including transparency | Manifest accepts all four extensions; the shader multiplies texture alpha by the card opacity | Pass (transparent PNG/WebP exercised by the shader path, not by a shipped transparent asset — see §8) |
| Two light-grey guide lines follow the helix in the opposite direction | 456 thin grey structures surrounded by paper were found on the mid-travel frame, in two separate height bands (y 130–416 and y 657–894) | Pass |
| Timing and spacing of the lines match the reference | Guide-line arc maths, phase and arc length are the reference's constants | Pass (code-level) |
| Upper line renders behind the cards, lower line above them | Reference depth setup carried over unchanged: upper `renderOrder 1` with depth test, lower `renderOrder 10` without | Pass (code-level) |
| **Closing grid: ≥1200 px is 3 × 2** | Card runs counted per scanline on the settled 1440 px frame: 2 row bands, 3 runs in each | **3 × 2** |
| **Closing grid: 601–1199 px is 2 × 3** | Same measurement at 1024 px and 768 px: 3 row bands, 2 runs in each | **2 × 3** |
| **Closing grid: ≤600 px is 1 × 6** | Same measurement at 390 px: 6 row bands, 1 run in each | **1 × 6** |
| Grid targets and scale recalculate after resize | The same scene re-runs `updateGridLayout()` on resize and the four widths above are separate page loads with different results | Pass |
| Multiple cards overlap in motion; sheet-like wave; order 01–06 preserved | Reference stagger, wave and `GRID_ORDER` carried over unchanged; the settled frames show 01–03 top row and 04–06 bottom row | Pass |
| Final card settles at the end of the sequence | Settle window is the reference's; the 99% frame is fully settled | Pass |
| Footer begins light and blends into dark | Background sampled per frame: paper (`#d6d6d3`) at the end of the track, `rgb(10, 15, 31)` at the page bottom, asserted for all four widths | Pass |
| Closing footer text resolves as light text on dark | `NINECUBE DIGITAL` renders in `#f5f9ff` on the dark blend | Pass |
| No local assets are missing | Each viewport test asserts at least nine `/assets/work-*` requests succeeded; no failed request is tolerated | Pass |
| No uncaught JS errors or warnings in the console | Asserted in all four viewport tests and in all 12 `ui-audit` combinations | Pass |
| Previewed through a local server, not `file://` | Runs on the Vite dev server (`http://127.0.0.1:5173`) | Pass |
| Scrolling remains smooth in a current desktop browser | Playwright's `scrollToProgress` walks the whole 690 vh track without a long task or a dropped frame report; the scene lerps 10.5% per frame | Pass |
| Responsive behaviour at ~1440 / 1024 / 768 / 430 / 390 px | 1440, 1024, 768 and 390 measured above; 430 px falls in the same 601–1199 px branch as 768 px, and the CSS breakpoints at 480/768/1200 px are the reference's | Pass (430 px shares the measured 2 × 3 branch) |

Screenshots of the settled closing composition, the footer blend and the mid-travel helix are written
to `web/artifacts/showcase-<width>-{helix,closing,footer}.png` on every run of the spec.

## 7. Defects found during this verification and fixed

1. **The showcase opened deep inside its own scroll track.** After a reload the browser restored a
   stale scroll offset (measured: 3 866 px into a 8 280 px track), so the landing page opened halfway
   through the story instead of on the hero. The reference never had to defend against this because it
   is a single page load. Fixed in `ShowcasePage` by taking over document scroll while the route is
   mounted (`history.scrollRestoration = 'manual'`, reset to the top, repeated on the next frame, and
   restored on unmount). Now covered by the lifecycle test in `showcase.spec.ts`.
2. **`window.scrollTo` was unmocked in jsdom**, which logged a jsdom "not implemented" error for every
   suite that rendered the showcase. Fixed in `src/test/setup.ts` alongside the existing stubs — a test
   environment limitation, not an application bug.
3. **Two of my own first-pass end-to-end assertions were wrong, and the tests were corrected rather
   than the product.** "Both titles enter from opposite sides" was measured at the *hold* position,
   where both sit at 0 vw (correct behaviour) — it is now measured during the entrance. "Titles clear
   before the grid resolves" was asserted as opacity ≈ 0, but the reference exits the titles sideways
   to ±86 vw while leaving them opaque — it is now asserted as displacement. Both changes make the
   tests match the reference's calibrated behaviour; they were not loosened to pass.
4. **Quoted `.env` values broke every credentialed end-to-end test** (14 failures). The value in
   `.env` is quoted, and the .NET configuration loader strips the quotes, so the password reached
   Playwright with them attached. Fixed once in `e2e/seed-password.ts`, which strips surrounding quotes
   and is shared by all three authenticated specs.

No product defect was found in the adapted scene: every constant, deformation and timing value matches
the reference, and the only behavioural changes are the three deviations documented in
[README.md § The showcase](./README.md#the-showcase).

## 8. NOT RUN and limits

- **Firefox and WebKit** were not run; the Playwright project is Chromium only (`--project` can be
  added). The scene uses no Chromium-specific API, but that is reasoning, not evidence.
- **A transparent PNG/WebP card asset was not shipped**, so the "transparency renders without
  texture-loading or shader errors" checklist item is satisfied by the shader path (texture alpha ×
  card opacity) and by SVG rendering, not by a photographic transparent asset.
- **The 430 px viewport was not measured separately**; it uses the same 601–1199 px branch measured at
  768 px and 1024 px.
- **Guide-line depth ordering** (`upper behind`, `lower above`) is verified by reading the carried-over
  render-order setup, not by an occlusion test. A pixel test for "which of the two is in front of which
  card" would need a per-pixel occlusion analysis, which was judged not worth the complexity; the code
  path is the reference's.
- The in-app Preview panel stopped producing composited frames late in the session (its own diagnostic:
  "the preview webview is not being composited"), so mid-travel frames could not be re-inspected by eye
  afterwards. The frames are saved under `web/artifacts/` for a reviewer, and every automated assertion
  above is independent of that panel.
- The containerised `docker compose --profile full` path and `dotnet format --verify-no-changes` remain
  not run for the frontend/backend respectively; see the root TESTING.md §8.

## 9. Reproduce all of it

```bash
# 0. both servers, if they are not already up
dotnet run --project src/NineCube.Api                 # :5080
cd web && npm run dev                                 # :5173

# 1. frontend typecheck, unit tests, production build
cd web
npm run typecheck
npm run test:run
npm run build
grep -c WebGLRenderer dist/assets/index-*.js          # expect 0: Three.js is not in the main chunk

# 2. showcase, in a real browser, at four widths (no credentials needed)
npx playwright test showcase

# 3. everything, including the credentialed specs
NINECUBE_SEED_PASSWORD='<demo password>' npx playwright test
```

## 14 October 2026 — public-only photographic home page

Scope: frontend files under web only. Backend implementation, API contract, JWT authentication, and role permissions were retained. The public reference helix remains lazy-loaded; its scene geometry, camera, timing, guide-line ordering, cropping, responsive grid calculation, and disposal code were not edited. Hero photography, supporting copy, early CTA, navbar styling, and guest/workspace routing were refined.

Actual commands and results:

```text
npm install --ignore-scripts --no-audit --no-fund
up to date in 2s

npm run build
? 114 modules transformed.
? built in 5.59s

npm run test:run -- --no-file-parallelism
Test Files 9 passed (9)
Tests 59 passed (59)
Duration 26.64s

NINECUBE_SEED_PASSWORD=<local demo password> npx playwright test showcase order-flow
8 passed (2.5m)

NINECUBE_SEED_PASSWORD=<local demo password> npx playwright test public-home
5 passed (22.2s)

npx playwright test public-home --grep "public home uses"
1 passed (10.5s)
```

The first concurrent Vitest attempt had four timing failures while the software-rendered WebGL suite was running. Running the same suite with one worker passed all 59 tests, and the final rerun passed again. No failed tests remain from that run.

### Checks against the canonical VALIDATION.md

The canonical index.html, styles.css, main.js, AI_SOURCE.md, AI_INSTRUCTIONS.md, and VALIDATION.md were inspected. Missing source copies were fetched into src/helix/reference for review. The adapted helixScene.ts animation implementation was retained.

The live Chromium checks exercised real WebGL at 390, 768, 1024, and 1440 pixels. They verified nine locally loaded photographs, initial scroll position, transition-title timing, opposing editorial title entrances and exits, the closing footer blend, no horizontal overflow, no uncaught errors or unexpected failed asset requests, disposal on navigation, and a working scene on remount. Screenshots of the bent helix, guide lines, and final 1x6 / 2x3 / 3x2 compositions were reviewed against the source checklist. Reduced-motion and unavailable-WebGL cases passed using the static nine-image grid.

The order-flow smoke test placed an order, verified stock dropped by one, and confirmed it as staff. The new public-home tests logged in as Customer, Staff, Inventory Manager, and Administrator; each landed on /products. Direct visits to / and logo clicks stayed in the workspace, without mounting the canvas, activating the tall scroll track, or requesting the Three.js / helix scene modules. The initial public home retains a working early collection CTA and a real local hero photograph.

### Photos and previews

Nine source photographs were downloaded to public/assets/photo-01.jpg through photo-09.jpg. They are editorial coffee, ceramic, and kitchen photographs, not promises about exact merchant stock. Source URLs, known photographer names, and the Unsplash licence are retained in public/assets/photo-credits.json. Original demo SVGs remain bundled as defaults. The active nine photos are selected in filename order by the generated manifest. Image delivery is local at runtime.

Preview artifacts: artifacts/home-desktop-hero.png, artifacts/home-mobile-hero.png, and artifacts/showcase-{width}-{helix,closing,footer}.png. Browser checks caught and fixed an absolute-position origin error in the navbar's sliding highlight. The public mobile header is compact so it does not obscure the hero or closing composition.

Backend tests were NOT RUN for this frontend-only update; backend files were not changed. The live order smoke test used the existing running API. The dev frontend remains running at http://127.0.0.1:5173/. Signed-in visitors are intentionally redirected to /products; view the public home while signed out.

Additional live format verification passed:

```text
npx playwright test showcase --grep "mixed formats"
1 passed (15.4s)
```

The WebGL scene successfully rendered SVG and JPG plus a tall transparent PNG fixture, transparent product WebP, and portrait JPEG, then settled them into the closing grid. The test recorded no asset or shader failures. Screenshot artifacts are showcase-mixed-formats-helix.png and showcase-mixed-formats-closing.png. Final production build passed in 4.48s after the restrained public-navbar shadow treatment.

Across the showcase, order flow, public home, and mixed-format runs, all 14 distinct browser tests passed. The targeted homepage recapture is an additional rerun of an already counted check.
Final home preview recapture passed (1 browser test); the local dev server returned HTTP 200 and remains running.
## Category imagery and typography refinement (2026-10-14)

The active image set covers coffee, technology, footwear, beauty, accessories,
plants, living, stationery, and fresh food. These are local editorial assets;
they do not imply that the sample kitchen inventory stocks all categories.
Sources and licence links are in public/assets/photo-credits.json.

Category previews fill the early scroll stages and fade as the helix arrives.
Technical headings were replaced with shop copy. Global tokens now use 16px body
text, 15px secondary text, and 14px captions, shared across app screens.
Decorative logo lettering is intentionally smaller.

Production build passed; all 59 Vitest tests passed with --no-file-parallelism.
Nine public showcase/browser checks passed, including photo loading and preview
visibility at early scroll positions at 390, 768, 1024, and 1440 pixels.
The previews disappear before the mid-travel screenshot. Fallback, mixed image
formats, disposal, footer blending, and absence of overflow remain verified.
Early-stage screenshots: artifacts/showcase-{width}-{intro,editorial}.png.

The authenticated browser run passed all 28 tests: login/register appearance and
footer placement at all four widths, real order placement and confirmation,
signed-in routing for all four roles, theme persistence, catalogue photography
and broken-image fallback, and every role's main screens in both themes.
The role audit also checks that visible inputs, buttons, and tables use at least
14px text. No horizontal overflow or unexpected browser errors were reported.
Backend files were not changed; these checks used the existing running API.

Four additional order detail/invoice appearance tests passed at all four widths
in light and dark themes. This check found 83px of invoice overflow at 390px;
the invoice now contains its line table in a keyboard-accessible scroll region,
with adjusted mobile padding and metadata alignment. The corrected screenshots
are artifacts/order-{detail,invoice}-{light,dark}-{width}.png. Wider pages and
the other screens remain unchanged by this invoice-specific correction.
Across the showcase, role audit, auth appearance, themes, order flow, public
routing, and order appearance suites, 40 distinct browser tests passed.

## Navbar glass and home promotions

Production build passed after the theme-specific translucent navigation tray and
active-button shading changes. The seven public-home/theme-image checks passed,
covering all four role redirects, theme persistence, and local catalogue images.
The expanded home test passed again with promotional card images, links, spacing,
and no horizontal overflow at 390, 768, 1024, and 1440 pixels. Reduced-motion
preferences disable the card animation; the static fallback retains both cards.
The Administrator audit at 1024px passed in both themes after the tray border change.

Screenshots: artifacts/home-promotions-{width}.png, home-desktop-hero.png,
home-mobile-hero.png, and catalogue-{light,dark}.png. The opening hero has enough
height to clear the fixed header and display the promotional cards on phones.
The 20% card is explicitly an offer preview; no checkout discount was introduced.

## Public home footer review

The animated home and static fallback now share ShowcaseFooterContent: catalogue
CTA, brand, existing collection/sign-in/registration links, and copyright. The
CTA's excessive glow was removed and the base uses a divider with responsive
alignment. No contact, policy, or social links were invented.

The original background blend is retained. Foreground interpolation through grey
caused poor contrast during the transition; black or white is now selected using
the current background luminance. Browser checks verified at least 4.5:1 contrast
at three sampled positions in each theme at 390, 768, 1024, and 1440 pixels.
They also verified brand visibility, link destinations, no horizontal overflow,
and working footer navigation from the reduced-motion fallback.

Production build passed, all 5 home-footer browser tests passed, and all 8 targeted
showcase/fallback Vitest tests passed. Screenshots of both theme selections are
artifacts/home-footer-{light,dark}-{width}.png. The public closing background
intentionally settles to dark regardless of the app theme selection.

## Missing coffee catalogue photographs

The ten original coffee SKUs now use locally bundled subject-matched photographs,
with sources and licence credits in public/products/coffee-photo-credits.json.
The live records were updated through the existing Inventory API, retaining names,
prices, activity, descriptions, and stock. All 26 product records have image URLs.
Development seeding supplies the same URLs for fresh data and backfills missing
images only on matching original SKU/name pairs. Custom images and renamed products
are preserved. These photos illustrate product types; they are not manufacturer
photographs of a verified merchant model.

Infrastructure and frontend builds passed. Five ProductMediaTests passed against
an isolated LocalDB test database, including the repeated-startup backfill regression.
Three browser tests passed: every image on all four catalogue pages loaded without
a placeholder, all ten coffee SKUs matched their individual local photo paths,
and theme persistence plus broken-image fallback remained working. This covers
the requested Showing 17–24 of 26 page and the final 25–26 page.
Screenshots: artifacts/catalogue-images-page-{1,2,3,4}.png.



## Product categorization and Bangladesh seed verification (14 October 2026)

Categorization adds the category/tag model, SQL Server migration, transactional
hierarchy rules, order-item snapshots, API filtering, URL-driven catalogue filters,
responsive category navigation and staff management. Validation completed before
the separate Bangladesh seed import:

- 56 backend tests passed against isolated real SQL Server LocalDB databases.
- 67 frontend tests passed with Vitest/RTL/MSW. The final category-only check
  passed all 8 tests after the direct-count and filter-label refinements.
- Production frontend build passed after those refinements.
- 24 browser checks passed: 16 role/theme/viewport audits, 6 categorization
  scenarios, the original 26-product photo check and an order flow.
- Browser and unit evidence: web/artifacts/category-final-browser-tests.log,
  category-browser-tests.log and category-frontend-tests.log, with category
  light/dark screenshots at 390, 768, 1024 and 1440 pixels.

The seed-only task then added 25 attributed products (51 total) using the existing
category tree. Five pipeline checks passed, including an intentional SQL Server
rollback after junction/tag inserts. Two subsequent load reruns inserted zero
rows; existing products including stock/rowversions, categories and OrderItems
were unchanged. SQL/public API counts match. Each current leaf has at least eight
products, every product has exactly one primary, and 8% of seed rows have zero
stock. Detailed reproducible evidence and limitations: [SEED_REPORT.md](../SEED_REPORT.md)
and [seed/README.md](../seed/README.md).

Historical photo checks concern the original 26 products. The 25 newly seeded
records intentionally have NULL image URLs under the requested license policy.
New prices are estimated BDT, while the unchanged UI formats USD; review/provenance
fields remain in clean files because the current schema has no columns for them.
The requested 15-root Bangladesh category tree was not present and was not created.
