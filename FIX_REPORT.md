# FIX_REPORT

# Round 8 — the deck carries the product, and the manual gets a printed form

Date: 2026-10-16. Brief: "update the ppt use more relevant type data give some sample screen image and
Logo use give as professional type ppt and also give the User manual as docx file with image".

## What the deck was, and what it is now

`tools/build_deck.py` produced 18 slides of text and tables — accurate, but nothing of it looked like
the system it describes, and the brand appeared only as the word "NineCube" in a title. The deck is now
23 slides:

- The cover carries `logos/ninecube-logo-vector.png`, and every content slide carries the cube mark.
  The artwork is near-black and orange on white, so on the ink background it sits on a white plate;
  laid straight onto `#1B181A` the black faces of the cube would have vanished. `logos/ninecube-mark.png`
  is the cube cropped from the same file, so the mark and the logo cannot diverge.
- Four slides show eight real screens, taken from `docs/manual/` at their true 1440×900 ratio with the
  caption the manual gives them: the catalogue and the cart (2.1-2.2), the dashboard and the inbox
  (2.4, 6.3), the order console and the category manager in the dark theme (3.1, 3.3), the bulk editor
  and the movement ledger (4.2-4.3). Each names the tests that hold what the picture shows.
- A new slide, "What is in the system, counted on 16 October", replaces adjectives with counts, and
  says where each was counted: 183 products, all 183 with an image; 29 brands and 103 product lines;
  43 categories to a depth of 3, 198 product-category links; 46 tags over 501 product-tag links;
  160 in stock, 10 low, 23 out; 20 orders and 21 lines; 38 stock movements, 1,018 audit entries,
  20 notifications; 55 endpoints (24 GET, 17 POST, 10 PUT, 4 DELETE); 13 migrations over 18 tables;
  15,631 lines of C# and 15,554 of TypeScript and CSS.

The orders are Development seed plus the browser runs, so the slide says so rather than presenting
574.50 of mixed-BDT demo total as revenue.

## The geometry audit found the branding did not fit

Adding the mark to `title_bar()` put it on top of the heading on all 22 content slides — 38×26 px over
the kicker and 38×17 px over the title — because the heading boxes ran the full text width. The cover
title box also overshot the line below it by 29 px, and nine text boxes — three long titles and six
notes — overflowed their frames by 10 to 38 px.

Fixed in the helpers rather than slide by slide: `title_bar()` now reserves 0.78 in for the mark and
sizes the heading by length (30 pt to 48 characters, 26 pt to 62, 23 pt beyond), and `note()` sizes its
box from the text instead of assuming one line. Two titles were rewritten shorter rather than shrunk
into unreadability. The deterministic audit over the rebuilt file reports **23 slides, no issues**.
It is a geometry and shaped-text check, not a visual one: this machine has no PowerPoint or LibreOffice
automation, so nobody has seen the slides rendered.

## The manual as a document

`NineCube-User-Manual.docx` (10.9 MB) is generated from `USER_MANUAL.md` by the new
`tools/build_manual_docx.py` — nothing is retyped, so the two cannot drift. A4, 2 cm margins, Segoe UI
with Consolas for commands, a cover with the brand artwork, a contents list built from the part and
section headings, a page break per part, a page number in the footer, and the 28 screens as numbered
figures at 16.2 cm with the captions the Markdown already carries. The Markdown's own legend numbering
is kept literally, because Word list numbering restarts per list and the legends are per figure.

Verified on the package rather than on screen: the zip is intact, all 14 XML parts parse, 29 media
files are embedded (28 screens plus the logo), 3 tables came across with 6, 5 and 9 rows, 99 bullet
and 137 numbered legend paragraphs, and no paragraph leaks `**`, a backtick, a leading `#` or a pipe —
after the first build leaked the document's own H1, which the cover now supplies instead.

## The counts the deck would have contradicted

Writing the numbers down exposed three current-state sentences still claiming 171 products, which was
true before the 12 laptop configurations in the first section of this report landed. README (two
places) and TESTING.md now read 183 with the date and the command used. `SEED_REPORT.md` and the dated
entries above keep their own figures, since they record runs rather than state.

## Blocked, not skipped

PowerPoint has `NineCube-OrderProcessing.pptx` open, so the submission filename cannot be rewritten.
The current build is `NineCube-OrderProcessing-2026-10-16.pptx`; closing the deck and running
`python tools/build_deck.py` puts the same 23 slides under the submission name.

---

## Laptop configurations and compact SKUs — 16 October 2026

- Added 12 real laptop configurations across Apple, Dell, HP, Lenovo, ASUS, Acer, MSI and Walton,
  each with two checked local gallery images, concise configuration names, sourced BDT prices,
  CPU/RAM/SSD/display facts, category/brand/series links, and filter tags.
- Migrated 145 hash-only SKUs to readable deterministic codes of at most 24 characters. All 183
  database SKUs are unique; existing product IDs, prices, stock, images and order snapshots stayed intact.
- New laptops start at zero stock and become orderable after Inventory receives stock.
- Passed: three SKU unit tests, five real SQL safety tests, a real browser test covering laptop brand
  filtering/gallery switching/mobile layout, and an HTTP/decode audit of all 183 product images.
  The production build passed. Reapplying changes no products, gallery rows, categories or tags. The earlier image backfill also
  re-runs successfully after the SKU migration.
- Evidence and commands: `seed/README.md`, `seed/clean/laptop-verification.json`,
  `seed/clean/sku-migration.json`, and `web/e2e/laptop-catalogue.spec.ts`.


## Product image database backfill — 16 October 2026

- Added 145 validated, locally cached source images to the products that had no database image.
- All 171 products now load images successfully; the real browser also verified all 171 URLs.
- Matched manufacturer catalogues, exact food barcodes, and model-specific Wikimedia images.
  Generic items carry a visible "Representative image" label. Source/creator/license information
  is published at `/products/image-credits.html` and recorded in the backfill manifest.
- Added primary gallery records; preserved existing images and prices, stock and active flags.
  The guarded, parameterized transaction only changes product media. Reapplication is idempotent.
- Repeatable scripts: `seed/backfill_product_images.py`, `seed/verify_product_images.py`,
  `web/verify-product-images.mjs`. See `seed/README.md` for commands and scope.
- Production build and TypeScript checks passed. Reapplying the backfill left gallery records unchanged.
- Verification evidence: `seed/clean/image-backfill-verification.json`; catalogue and mobile detail
  screenshots in `web/artifacts/modern/sourced-product-*.png`.

# Round 7 — the category manager joins the manual, in the theme it was reported in

Date: 2026-10-16. Brief: a dark-mode screenshot of `http://localhost:5173/staff` showing the
**Categories & product organization** block — "this pages user manuals are missing and in dark mode
screen sample also missing fix these also".

## What was missing, and why

USER_MANUAL §3.3 was five lines of prose and no screen. The reason was in the capture harness rather
than in the manual: its staff block photographed `/staff` (the order console), then `/staff/sales` and
its breakdown, and stopped. `Categories & products` — the second half of the same route, with two
views, a category dialog and a product assignment form — had never been opened by
`web/scripts/capture-manual.mjs`. And no screen in `docs/manual/` was in the dark theme, because every
block called `light()` straight after signing in; the reader who reported the defect was looking at a
theme the manual had never shown.

## Fix

`dark()` was added beside `light()`, and four screens photographed in the dark theme:
`13b-category-stock-dark` (the tree with its stock summary), `13c-category-editor-dark` (the dialog
behind a row's Edit button), `13d-product-organization-dark` (the product picker) and
`13e-product-tags-dark` (the categories-and-tags form for one product) — 30 numbered callouts between
them, 9 + 11 + 6 + 4. §3.3 was rewritten around those pictures with the rules they show, §1.3's route
row now names the category manager, Part 7 gained the block of tests that cover it, and the appendix
count moved from 24 screens to 28.

## Two claims that did not survive being written down

- The old §3.3 said a move into one's own descendant is "refused **with the cycle named**". It is not
  named: the server message is `A category cannot move under itself or a descendant.`
  (`src/NineCube.Application/Services/CategoryService.cs:86`), with the code `category_cycle`. The
  manual now quotes the sentence instead of describing it.
- A first draft of the callout said the product picker pages "exactly as the inventory list pages
  them". It does not: `InventoryPage.tsx:241` asks for 50 rows, `CategoryManager.tsx:32` for 20. The
  wording was corrected before the pictures were regenerated, so the PNG, `callouts.json` and the
  manual all carry the same sentence.

## A screen that had drifted since the last capture

The first run of this pass reported `! callouts not found on screen: 3` for `12-notifications`. The
callout pointed at `.notification-empty`, and that element is no longer on the page: the customer
account now has notifications of its own (20 rows in `Notifications`, written by the order-flow browser
runs since). The legend claimed "Nothing has arrived for this account yet", which the picture could not
support. Callout 3 now marks a real row, and §6.3 says what the empty state is rather than implying the
inbox is one — the empty states remain asserted by `filters to unread and says so when nothing is left`.

## A documented rule with no test behind it

`CategoryService` refuses to rename, reparent, switch off or delete `Uncategorized` (id 1) — the
fallback every uncategorized product is filed under. Only the delete branch was asserted, and only
incidentally, at the end of
`Delete_requires_reassignment_and_reparents_children_atomically`. Since §3.3 now tells a reader the
category is protected, `CategoryTests.Uncategorized_stays_active_at_the_root_under_its_original_name`
asserts all four refusals, that nothing moved, and that the one editable field (sort order) still
saves. The backend sources now hold 93 `[Fact]` plus 15 `[InlineData]` cases, which is the 108 the run
reports — superseding the 92 + 15 = 107 arithmetic in Round 6 Problem 4.

## Two harness races, both caught by the run rather than by reading

- The category table renders its "No categories match your search." row while the tree is still
  loading, so waiting for `tbody tr` is not waiting for data. The capture now waits for
  `.category-manager td .btn` — a real Edit button.
- The product picker is disabled while its page of products is in flight
  (`products.isLoading || products.isPlaceholderData`), and `selectOption` retried 41 times before
  giving up on the first attempt at this screen. It now waits for the node to be enabled and to have
  options.

## Verification

- `node scripts/capture-manual.mjs` → exit 0, **28 screens**, no `! callouts not found` line, and
  `docs/manual/callouts.json` carries 28 entries with every `found` true.
- `dotnet test src/NineCube.Tests` → `Passed! - Failed: 0, Passed: 108, Skipped: 0, Total: 108, Duration: 3 m 15 s - NineCube.Tests.dll (net10.0)`, verbatim in `web/artifacts/backend-16oct-108.log`.
- `USER_MANUAL.md` references 28 images; 28 PNGs exist in `docs/manual/`, none unreferenced.
- Nothing on the product side changed: the category, brand, tag, stock and URL-state rules are
  untouched, and the capture writes nothing — it opens dialogs and presses Escape.

## Packaging the repository found two credential literals

The documentation promised "no credential is committed" (README, `appsettings.Sample.json`, and
`build_deck.py`'s demo-login slide all say the seed password comes from `NINECUBE_SEED_PASSWORD`), and
the appsettings files keep that promise with `__SET_VIA_ENV__`. Two launcher files did not:
`.run-api.sh:12` defaulted `NINECUBE_SEED_PASSWORD` to a literal, and
`src/NineCube.Api/Properties/launchSettings.json:11` carried the same value in plain JSON. Both were
the only places the live seed password existed outside `.env`, which is ignored.

The fallback in `.run-api.sh` became `: "${NINECUBE_SEED_PASSWORD:?…}"`, so the script stops with a
named reason instead of silently seeding with a published password; the entry was dropped from
`launchSettings.json`, which is the shape README already documents (export it, or source `.env`).
`bash -n` and a JSON parse both pass on the edited files. The dev-only `Jwt__SigningKey` values were
left alone: they are labelled as local-development keys, they sign nothing outside this machine, and
removing them would break `dotnet run` for a reader who has not set the environment yet.

`git init` and the first commit followed, staging 860 files: source, tests, the seed pipeline, the
28 annotated screens and every report. `.gitignore` gained `__pycache__/` and the per-run
`web/artifacts/*-results/` scratch directories; the `web/artifacts/*.log` files the reports cite by
path stay tracked. `.env` is not in the commit, and no staged blob contains the seed password. Nothing
was pushed.

---

# Round 6 — the selected navigation state, button material, and the manual that documents it

Date: 2026-10-16. Brief: the tab you are on must carry the same amber "this one" fill as the opened
account menu and the switched-on theme choice; and the whole system had to be documented screen by
screen from live pages, with the tests that cover each behaviour named.

## Problem 1 — the current tab and the open account menu looked like two different kinds of control

### Root cause

Not one cause but a cascade of four, which is why screenshots disagreed with the stylesheet every time
they were compared by eye:

1. `app.css:397` still carried a `.navbar__highlight` rule — a separate moving pill layer from an
   earlier attempt. The layer had already been deleted from `Navbar.tsx`, so the rule matched nothing
   while the contract test still asserted against it. The test was passing on a rule that rendered
   nothing at all.
2. The real selected state lives on the link itself (`aria-current="page"`), declared in `modern.css`.
   `modern.css` is the last of the five stylesheets, but the rule was written as
   `.navbar .navbar__link[aria-current='page']` (specificity 0,3,0) while `Navbar.css:58` opened the
   account trigger with `.navbar__actions .nav-pop__trigger[aria-expanded='true']` (0,3,0) and won the
   tie on order in one theme and lost it in the other. The result was an account button in dark ink on
   amber in light theme and pale ink on amber in dark theme — one of the two was always wrong.
3. The hover rule did not exclude the current tab, so a selected tab under the cursor swapped its amber
   for the faint hover wash and appeared to deselect itself.
4. The amber was only on the tab. The theme control's `aria-pressed` state and the expanded trigger
   used three different recipes between `Navbar.css`, `app.css` and `modern.css`.

### Fix

One rule owns the selected state, and it names all three controls so they can never drift apart
(`modern.css:490`):

```css
:root .navbar :is(.navbar__link[aria-current='page'],
                  .nav-pop__trigger[aria-expanded='true'],
                  .theme-control[aria-pressed='true']) {
  background: var(--accent-gradient); color: var(--on-accent);
  border-color: var(--accent-text);
  box-shadow: inset 0 1px 0 var(--surface-highlight), var(--shadow-sm);
}
```

`-webkit-text-fill-color` is set alongside `color` (a `text-fill-color` in an earlier rule kept
painting pale ink over the new `color` — the kind of thing only a composited pixel shows). The hover
rule now excludes the switched-on controls (`:not([aria-current='page'])`,
`:not([aria-pressed='true'])`), and the trigger rule in `modern.css` carries `.nav-control` a second
time to raise its specificity to 0,6,0 so it wins the exchange with `Navbar.css:58` in both themes.
`.navbar__highlight` is gone from the CSS, and `app.css:397` is a comment saying the selected state is
styled through `aria-current`.

### Evidence — measured on composited pixels, not read from the file

The same probe method used in Round 5: the page is screenshotted, the screenshot is drawn into a
canvas, and the pixels inside the control and inside the tray behind it are compared.

| Theme | Selected pill | Tray behind it | Separation (RGB distance) | Ink on pill | Contrast |
| --- | --- | --- | --- | --- | --- |
| Light | `rgb(181, 125, 30)` | `rgb(245, 248, 252)` | 262 | `rgb(26, 17, 0)` | 5.27:1 |
| Dark | `rgb(184, 133, 65)` | `rgb(118, 123, 137)` | 97 | `rgb(26, 17, 0)` | 5.72:1 |

Thresholds enforced by the test: separation ≥ 40, contrast ≥ 4.5. The open Account button was then
sampled the same way and compared against the current tab: both themes report
`fill = 'gradient'`, and the `{gradient, ink, edge}` triple of the open menu `toEqual` the current
tab's. Navigating to Staff moves the fill to the Orders tab in the same run, so the test proves the
state follows the route rather than being painted on one lucky link.

### Tests

- `web/src/test/actionable-surfaces.test.ts` → *marks the current navbar tab with the same selected
  amber as the other switched-on controls*. Contract test: the selected rule must contain
  `background: var(--accent-gradient)` and `color: var(--on-accent)`, the hover rule must contain the
  `:not([aria-current='page'])` exclusion, and the expanded-trigger rule must also be amber. It
  replaced the test that had been asserting the deleted `.navbar__highlight` layer.
- `web/e2e/navbar-matched.spec.ts` → *${theme}: the current tab is selected in the same amber as the
  open account menu*. Signs in through the API and `addInitScript`, so the password never appears in
  the transcript or a screenshot.
- `web/e2e/actionable-surfaces.spec.ts` → *the current navbar tab is filled as the selected one, and
  stays readable inside it*. Pixel version, writes `web/artifacts/navbar-tab-level.json`.
- `web/e2e/public-home.spec.ts` — the dead geometry check on `.navbar__highlight` was replaced by the
  real contract: the current tab computes to a gradient, every non-current tab to `none`.

## Problem 2 — secondary buttons were invisible on the surface they sat on

### Root cause

`.btn` took its background from the translucent `--surface-glass`, which on a glass card is the same
colour as the card. A row of actions on the inventory table therefore rendered as text with no edges;
the buttons existed, were clickable, and read as labels. `Navbar.css` and the queue headers each
re-solved this locally, which is why some tables were fine and others were not.

### Fix

One rule gives every button a material of its own (`modern.css:228-237`), leaving the deliberate
primary/danger/ghost treatments alone:

```css
:root .btn:not(.btn--primary):not(.btn--danger):not(.btn--ghost) {
  background: var(--surface-raised); border-color: var(--border-strong); …
}
```

Covered by `web/e2e/actionable-surfaces.spec.ts` (*every row action reads as a control on its own
table*) which samples each action cell against its row, and
`web/src/test/actionable-surfaces.test.ts` (*paints a secondary button as a control, not as the
surface it sits on*).

## Problem 3 — the documentation pass could not be produced from the live app

The manual had to be photographed from the running system, and three separate defects stopped the
capture script from doing that honestly. All three were bugs in the harness, not in the application,
but each one was a real race that a reader would have inherited:

1. **`waitUntil: 'networkidle'` never resolves for a signed-in SPA.** The notification layer polls, so
   the network never goes idle and every navigation timed out at 30 s. The 16 navigations in
   `web/scripts/capture-manual.mjs` now use `domcontentloaded` plus an explicit wait for the element
   that proves the screen is actually there (`[role="dialog"]`, the queue table, the ledger row). A
   screen is not "loaded" because no request is pending; it is loaded because the control to be
   annotated exists.
2. **The sign-in helper decided "already signed in" from a single `isVisible()` check.** React may not
   have mounted the form yet when `domcontentloaded` resolves, so the script guessed wrong and then
   waited for a *Sign in* button on a page that had none. It now waits 5 s for the email field, and
   where the previous role really is signed in, the check for success is the login form appearing
   again after logging out — not a particular button, because where sign-in lands depends on the page
   you were on.
3. **The movement ledger was photographed mid-request.** The stock dialog renders a loading skeleton
   while the ledger loads, and the annotation step ran 500 ms after the dialog opened, so both the
   table and the empty-state paragraph were absent and the callout reported "not found". The script
   now waits for `.modal table, .modal p.muted`.

The script also gained two things the manual needed: `scrollTo`, because a callout can only be drawn
where the reader can see it, so a screen whose points of interest are below the fold is captured with
that region scrolled in (`18b-movement-history`, `14b-sales-breakdown`); and a `text: true` mode that
measures the words of a heading through a `Range` instead of the element, because a block-level heading
spans the whole column and its box was a stripe across the page.

**Result:** 24 annotated screens and `docs/manual/callouts.json`, all callouts found on the final run
(`EXIT=0`, no `! callouts not found` lines), written up role by role in
[USER_MANUAL.md](USER_MANUAL.md) with the test names that cover each behaviour. The two screens that
were split out (`11b-addresses`, `14b-sales-breakdown`) exist because a single frame could not show the
point being made without a callout off-screen.

## Problem 4 — the test record contradicted its own headline numbers

**Cause.** An audit of the documentation counted the sources instead of trusting the prose, and found
that every headline number was right while every pasted run summary was wrong. The backend sources hold
92 `[Fact]` plus 15 `[InlineData]` cases (107); the frontend holds 23 files with 152 plain
call-sites plus two `it.each` blocks (3 and 4 cases) for 159; the 23 Playwright spec files generate their 107 cases at run
time from loops over roles, themes and viewports. But TESTING.md §2/§3/§4 still pasted the 14 October
summaries (42 backend, 45 frontend, 22 browser), web/TESTING.md pasted 9 files/55 tests and 22 browser
tests, and two sentences pointed forward to "§10" — a section that had never been written. Anyone
checking a claim against the evidence in the same file would have found a smaller suite and concluded
the numbers were invented.

**Fix.** §16 of TESTING.md carries the 16 October reruns verbatim, §2/§3/§4 say plainly that their
blocks are the 14 October record, and the dead "§10" pointers now read §16a and §16c. web/TESTING.md
points at the same section instead of leaving its old totals unqualified. `.gitignore` ignored every
`*.log`, which would have stripped out exactly the artefacts the reports cite by path
(`web/artifacts/backend-16oct.log`, `vitest-16oct.log`, `e2e-16oct.log`, the category logs), so those
are re-included while scratch logs stay ignored; Office lock files (`~$*`) are now ignored too.

**Measured on this pass.** Backend `107 passed, 0 failed, 0 skipped` (net10.0) against the real SQL
Server on `localhost,14330`. The Testcontainers attempt on this shell reported
`Passed: 100, Skipped: 7` because the Docker socket was unreachable; that log is kept rather than
deleted, because those three classes skip instead of faking a database. Frontend `23 files, 159 tests`;
`npx tsc --noEmit` exit 0; `npx playwright test --list` → `Total: 107 tests in 23 files`; manual capture
24 screens with every callout located.

## Problem 5 — six browser checks disagreed with the running app

The first complete run of the 107 browser tests on this tree reported **101 passed, 6 failed**:
`order-flow` (1), `sticky-notifications` (4 — 390 and 768 px, both themes) and `surface-depth` (1).
They reproduce on an idle machine, so they were not load. Each was measured before it was changed.

**5a. The notification layer test compared NaN with NaN.** The spec read
`z('.notif-popover, .sheet')` and `z('.category-filter-panel')` and asserted the first was greater.
Probing the running app at 390 px says why that can never hold: `.notif-popover` is not in the
document at all — the tray on a phone is a `.sheet` inside a fixed `.sheet-backdrop` — and the sheet
itself is `position: static; z-index: auto`, so `parseFloat('auto')` is NaN. `.category-filter-panel`
is the closed drawer at that width: `display: none; position: static; z-index: auto`, also NaN. The
painting was right (backdrop 70, navbar 50, bottom bar 45); the measurement had asked a static element
for a stacking order it does not have. The spec now reads the element that actually creates the
context — `.notif-popover` where it exists, otherwise `.sheet-backdrop` — refuses to continue on a
non-finite value, and compares the tray against the navbar plus whichever sticky surfaces are present
at that width.

**5b. A real defect fell out of that investigation.** `modern.css:25` gave every portalled navbar panel
`z-index: 10000`, which is outside the documented scale. Measured at 1440 px: the notification popover
resolved to 10000 while the toast column resolves to `var(--z-toast)` = 80 — a toast could never sit
above the tray, and `app.css`'s `.nav-pop__panel { z-index: var(--z-menu) }` was dead for these panels.
Both panels are portalled to `document.body`, so they live in the page's own stacking context and a
hard number there silently outranks everything. The rule now reads `var(--z-menu)` (60: above the
navbar, below modals and toasts). The new contract `keeps every stacked surface on the shared layer
scale` reads all four stylesheets, allows only the scale tokens plus numbers 0-4 (local stacking that
cannot escape its own context) and the skip link at 100, and pins the portal rule to the token. It
fails on the old 10000.

**5c. The row stagger test depended on mutable data.** It asserted at least eight `.table-surface tbody
tr` rows on `/staff`; the assertion reported `Expected: >= 8, Received: 4`, and `SELECT Status, COUNT(*)
FROM Orders GROUP BY Status` on the application database says why: `Pending = 4`, `Confirmed = 8`,
`Shipped = 7`. The staff queue defaults to `Pending`, and earlier runs confirm those orders away, so the
number of rows the check sees is a side effect of test history. Four rows cannot prove that a stagger
caps at eight. The check now runs on `/inventory`, which requests 50 rows per page from seeded data.

**5d. The order flow never opened the cart.** `Place order` was clicked straight after `Add to cart` and
never appeared, so the test ran to its 300 s timeout. Round 6 deliberately made the cart open on demand
— adding a product must not steal the view — and `Place order` lives inside the cart sheet
(`role="dialog"`, named *Your cart*). The spec predated that decision. It now clicks the cart in the
navbar actions, asserts the sheet is visible, and presses `Place order` inside it.

**Result:** the three specs pass 9 of 9 after these changes (`web/artifacts/e2e-16oct-three-specs.log`),
and the whole suite is green: **107 passed (1.1 h)**, recorded in
[TESTING.md](TESTING.md) §16c with its log at `web/artifacts/e2e-16oct.log`. `npx tsc --noEmit` exits 0,
`npm run build` succeeds, and the unit suite is 159 passed in 23 files. No product
behaviour was changed apart from the portal layer: the category, brand, tag, stock and URL-state rules
are untouched, and stock keeps its atomic single-product path.

## Verification

- `npm run test:run` → **23 files, 159 tests passed**; `npx tsc --noEmit -p tsconfig.json` → exit 0.
- `node scripts/capture-manual.mjs` → 24 screens, every callout found.
- Round 6 changed no product behaviour: category, brand, tag, stock and URL-state rules are untouched,
  stock keeps its atomic single-product path, and no bulk action can reach a quantity.

## Editor syntax diagnostics and CSS compatibility

Verified that the saved cart/filter components and sticky-notification spec have balanced syntax. Expanded the cart event cleanup and filter drawer handlers for clarity, restored the missing `web/verify-pills.mjs` as a complete runner for the maintained navbar tests, and added standard `line-clamp` alongside the WebKit fallback. Node syntax checking and verification-script test discovery passed. TypeScript compilation includes both application code and e2e specs. Older unsaved editor buffers may still need to be reconciled with these saved files.


## Administrator order permission alignment

The API reserves order status mutations for Staff, while administrators can read orders/invoices and manage categories/reports. The console now respects this: administrators default to invoice/history view, have no order selection or status-action controls, and receive a concise role notice. Client mutation handlers also guard Staff access; server policies remain enforced. Staff queue and bulk behavior is unchanged. Validation: production build and all 4 role/bulk unit tests passed. A real administrator browser check verified order and invoice access, absent mutation controls, zero status-update requests and no order-endpoint 403 responses.


## Action-classified order tables and permanent navbar selection

Replaced the mixed order table with server-filtered To confirm (Pending), To ship (Confirmed), and Invoices & history views. Processing queues select only their own rows and preselect the matching bulk action. History is read-only; the same View invoice action appears across every state. Removed the workflow description. Navbar selection now belongs to the real aria-current link under one shared selected-control rule; removed the separate measured highlight layer and its conflicting dark fill. Validation: production build, all 10 queue/navbar unit tests and all 4 browser checks passed (both navbar themes plus mobile/desktop classified queues). Order mutations in browser checks were intercepted; real orders were unchanged.


## Clear order lifecycle and separate invoices

The console explicitly presents Pending -> Confirmed -> Shipped, with Confirm order and Mark as shipped as transition actions. Rejected/Cancelled are closed alternative outcomes. Current status, Update status and Documents have separate columns; invoice links cannot be mistaken for a state transition. Shipped rows show Shipping complete and closed rows show Order closed. Bulk labels use the same action wording. The invoice page explains that viewing/printing a document does not change order state. Server lifecycle and stock rules are preserved. Validation: production build, 3 unit tests and 2 desktop/mobile browser checks passed, covering next-action labels, invoice separation, terminal-state behavior and bulk conflicts.


## Checkbox bulk order actions

The staff console supports selecting eligible Pending/Confirmed orders on the current page, select-all with mixed state, and a bulk review dialog. Only actions compatible with every selected order appear; terminal states are not selectable. Filter/page changes clear selection. Existing guarded per-order endpoints execute sequentially, with a synchronous duplicate-submit lock, progress and per-order success/failure results. Conflicts remain failures rather than being forced through. No batch atomicity is implied and no stock rules or API contracts change. The action bar stays within reach while scrolling the desktop order table. Validation: production build, all 3 focused unit tests and 2 desktop/mobile browser checks passed. Browser order updates were intercepted fixtures; real orders were not mutated.


## Matching navbar selection states

Main navigation now uses the same orange gradient and dark ink as expanded account controls, replacing its inconsistent black selected pill. Main links, theme buttons and right actions share the same subtle hover fill and amber edge. Keyboard focus retains the rounded pill shape. Sales summary cards also gain matching semantic icons and explanatory captions; existing summary-card accent edges, chart visibility and table effects are preserved. Validation: both navbar interaction checks and all 4 sales-card browser checks passed; production build passed. Corrected existing inventory-test accessor invocations that blocked TypeScript compilation.


## Readable card chips, aligned actions and dialogs that fit themselves

Five separate causes, all reported from the catalogue and `/inventory`.

**Card chips.** `.filter-chip` is painted with `--surface-sunken` (`app.css:1645`), which is `#131113`
in dark mode - a black hole punched in the translucent glass card, at weight 400, with the same
translucent white edge as the card itself. The chip is a `Link` to `?category=<slug>` / `?tag=<name>`
and did navigate, but nothing about it said so. The card chips now take the language the applied-filter
bar already uses for an actionable chip: `--selected-bg` fill, `--accent-text` ink, a solid
`--selected-bar` edge, weight 650, and the full `--accent-gradient` wash with `--on-accent` ink on
hover. Only `a`/`button` chips: the `+3` overflow counter is a `span`, so it keeps a neutral fill and
does not advertise a click.

**The inventory actions column.** `Edit` (50px) + `Adjust stock` (104px) + `History` (47px) + gaps need
217px; the auto table layout gave the column 179px, so `.row`'s `flex-wrap: wrap` stacked all three one
per line at 404 / 444 / 484 px down the row. The column is now `th.actions,
td.actions { width: 1% }` - the same trick the checkbox gutter already uses - with
`td.actions .row { flex-wrap: nowrap }`, so the strip keeps its min-content width and the SKU column,
which breaks anywhere, absorbs the squeeze. Measured: 3 controls on one line, column 249px, and the
page itself still does not scroll sideways.

**`History` did nothing different from `Adjust stock`.** Both called the same `setSelected(product)`, so
one of the two row actions was decoration. History now also raises a flag that survives into the open
dialog and moves focus to the `#movement-history` heading, which runs after `Modal`'s own
focus-on-open effect; Adjust stock clears it and stays on the form.

**Dialogs wider than themselves.** A modal title can be `Edit BD-2e013bf9aea2d0be724ea192fe30cb0364d7a870084be1fae10a3ef5114b`.
As an unshrinkable flex item its hypothetical size (694px) exceeded the dialog's content box (590px),
so it claimed the whole first line, forced the close button onto a second one under the title, and made
the dialog scroll sideways inside itself (`scrollWidth 718` against `clientWidth 638`). The title is now
`flex: 1 1 0; min-width: 0; overflow-wrap: anywhere` and the button `flex: 0 0 auto`: overflow 0, close
button at the right edge on the title's first line. Separately, the upload field's `Choose File` control
is a pseudo-element part of the input that no `input { … }` rule reaches, so it rendered as a light-grey
system button on a dark form; it is now styled from the theme tokens.

**The toolbar button floated off its field.** The `/inventory` toolbar is `.row` - `align-items: center` -
holding a `.field` (label, 4px gap, 43px input) and the `New product` button. Centring a 41px button on
the whole 66px label+input block left its bottom 14px above the search box it belongs to. A button in a
row that contains a field now takes `align-self: flex-end`, so it sits on the control it acts on.
Measured after the change: bottom gap 0px, centres 1px apart, button still beside the box. A scan of
`/staff`, `/staff/sales`, `/orders`, `/admin`, `/account/profile` and `/products` found no other row that
mixes a labelled field with a sibling button, so the rule is a guard for this shape rather than a
sweep.

**Validation.** `web/src/test/actionable-surfaces.test.ts` - **6 passed** (which token each surface
takes, and that the chip rule no longer mentions `--surface-sunken`). `web/e2e/actionable-surfaces.spec.ts`
- **3 passed** (1 m 45 s) against the live stack: chip paint differs from its own card in both themes
with weight 650 and a solid edge, hover swaps to a gradient with `rgb(26, 17, 0)` ink, clicking it moves
the URL and raises a "Remove … filter" chip; `New product` shares the search box's line with its bottom
within 2px of it; the three row actions share one line with the page unscrolled; the edit dialog has
`scrollWidth - clientWidth === 0` with the close button inside its
padding box; History focuses `#movement-history` while Adjust stock does not. `npx tsc --noEmit` clean,
production build clean, full Vitest run shows no new failure (the same 5 pre-existing files, see
Round 2's note). Screenshots: `web/artifacts/card-chips.png`, `inventory-actions.png`,
`edit-dialog.png`, `history-dialog.png`.

**Trade-off measured at 390px.** With the fix the inventory table scrolls 966px inside its own
`.table-scroll` region against 852px with the column allowed to wrap, and the row height is unchanged
(164px either way, because the SKU cell already needs three lines). The page itself overflows in
neither case. The wider strip buys one line of actions for 114px of contained horizontal scroll.


## Shared card depth on the sales page and in tables

The accent-edged tile treatment existed only on the customer dashboard, because its three rules were
scoped to `.dashboard-stats .stat-tile` (`modern.css:63-65`). The sales summary tiles, the two chart
cards and every data table were styled by separate rules and had drifted to a flat, edgeless surface.
The effect now sits on one selector list - `:is(.dashboard-stats, .sales-stats) .stat-tile,
.sales-chart` - so the tiles and charts on `/staff/sales` resolve the same solid surface, card shadow
pair, hover lift and 3px accent edge as `/account`. The dashboard keeps its flex column on its own
line: applying it to the chart cards would have shrunk them to their content width instead of half the
page. `.table-surface` takes the same accent edge system-wide (orders, staff, inventory, admin,
category stock, order lines), and its rows fade in with a stagger that stops at row eight so a long
table never queues behind a growing delay. The animation lives inside
`@media (prefers-reduced-motion: no-preference)` and the hover lift is switched off under reduced
motion, as it already was for the dashboard.

**Validation.** `web/src/test/surface-depth.test.ts` - **4 passed** (the shared rule carries
`var(--surface)` + `var(--card-shadow)`, the accent `::before` and `translateY(-2px)` hover exist for
tiles and charts alike, the row stagger sits inside the `no-preference` block and caps at
`nth-child(n + 8)`, and the `reduce` block neutralises both transitions and the lift).
`web/e2e/surface-depth.spec.ts` - **2 passed** (38.8 s): the first reads the computed `::before` of a
sales tile and a chart card on the live page and asserts the same 3px gradient edge and the table
surface; the second asserts the rows animate with varying delays up to row eight, then reloads under
`reducedMotion: 'reduce'` and asserts `animation-name: none` with fully opaque rows.
`npx tsc --noEmit` clean. Screenshots: `web/artifacts/sales-surfaces.png` (tiles, both charts and the
By-status table on `/staff/sales`) and `web/artifacts/staff-table-surface.png` (the `/staff` table).


## Sales summary styling and analytics

Sales KPIs now use the shared glass card styling. Added accessible SVG order distribution and revenue-by-status bars driven solely by the selected API report, with exact counts, currency labels, semantic colors, and explicit zero-data states. Cancelled/rejected revenue remains zero. Retained the detailed status table with shared status badges; aligned range controls and corrected currency option labels. No inferred time series or currency conversion is introduced. Validation: production build and final typecheck passed; 3 chart tests cover count arithmetic, zero revenue, empty data and currency labels; 4 live browser checks passed at 390/1440px in both themes with report-total and currency-switch checks. Screenshots: `web/artifacts/modern/sales-{width}-{theme}.png`.


## Compact staff category workflow

Staff orders and organization now have separate views. Toolbar actions align with the status field. Category management shows eight searchable rows per page; Edit/Create opens a focused, dismissible dialog rather than an always-expanded form below a long table. Product category/tag editing has its own view and product search; assigned categories scroll within a bounded fieldset. Corrected oversized checkboxes, uniform Edit buttons and table hover feedback. API mutations and validation remain unchanged. Validation: production build, all 8 category unit tests and all 4 staff browser checks passed (390/1440px, both themes), including toolbar alignment, eight-row pagination, search, Edit/Create dialogs, Escape/focus return, checkbox sizing and mobile overflow.


## Responsive product detail redesign

Product detail pages use a bounded two-column gallery/purchase layout, stacking on mobile. Images retain source pixels over a neutral light backing, with contained sizing capped at 540px on desktop. The purchase summary uses shared glass, responsive typography, compact stock badges and grouped quantity/cart controls. Thumbnails now mark only the actual selected/primary image. Adding a product displays confirmation and a View cart action. Validation: production build and all 6 browser checks passed at 390/768/1440px in light and dark themes, covering actual image loading, bounded image dimensions, responsive column layout, no horizontal overflow and cart interaction. Screenshots: `web/artifacts/modern/product-detail-{width}-{theme}.png`.


## Active filters and desktop sidebar scrolling

Active-filter bars now use shared glass colors with readable amber removable chips. The chips stay in normal page flow so they cannot overlap the sticky filter sidebar. Browse & filter remains naturally sticky below the measured navbar on desktop, constrained to its catalogue section; its title stays visible while long filter contents can scroll independently. Mobile retains the filter drawer. Missing-image placeholders also use the shared neutral palette. Validation: both theme browser checks passed on the Electronics URL, including sidebar scroll geometry within its parent boundary, chip visibility and mobile layout.


## Status and icon contrast

Account status tiles now pair their names, icons and counts with semantic colors: amber Pending, blue Confirmed/Processing, green Shipped/Delivered, neutral Cancelled and red Rejected. Shared dark status tokens use solid tinted fills and brighter text, improving badges across orders, stock and staff pages independently of glass surfaces. Muted dark-mode text is brighter for dates and descriptions.


## Cart on demand and clearer actionable hover

Customer cart now opens as an accessible dialog from the navbar cart icon on every page, instead of occupying a permanent catalogue column. The icon exposes expanded state; the dialog includes Close, Escape, focus trapping and focus restoration. Existing mobile cart buttons share the same dialog. `focus=cart` opens it directly. Navbar actions gain a visible amber hover edge; staff tabs and linked page actions receive consistent hover feedback. Hover never opens the checkout dialog or steals focus. Validation: production build, 8 checkout regression tests and 2 browser checks passed (both themes, cart visibility, close/focus restoration, navbar hover and mobile layout).


## Subtle hover and unified material

Hover now uses a subtle neutral glass highlight, while actual selected/open controls remain orange. Noninteractive navbar shells, cards and static chips use the normal cursor; actionable links/buttons retain the pointer. Navbar shells and page cards share one glass material token in both themes.


## Shared styling across pages

Applied the shared glass material to account/profile/address cards, authentication forms, category/filter/cart panels, notification rows and staff/admin table surfaces. Tab groups and secondary buttons use the navbar glass palette; interactive filter chips, category/brand selections and enabled button hover/selected states use orange with dark ink. Disabled controls and destructive actions retain their distinct states. Status badges retain their semantic colors. Includes solid fallback surfaces when backdrop blur is unavailable. Validation: production build passed; all 9 browser checks passed across customer pages at 390/768/1440px, both themes, navbar interactions and touch layout.


## Avatar contrast and glass palette refinement

The account initial now uses fixed dark brown ink on a light amber disc, including while the account trigger is selected. Navbar controls and account menu entries share orange hover/selected surfaces with dark text. Product cards and the navbar use translucent slate gradients in dark mode and pale glass gradients in light mode, with blur and highlighted borders. Product image visibility is preserved.


## Dark image visibility and individual action pills

Latest refinement: transparent product cutouts use a plain light backing in dark mode; opaque source photos retain their own backgrounds. No artificial image shadow or filter is added. Cart, notifications and account each have a separate rounded glass pill matching the Products and theme groups. Hover uses the shared neutral highlight; open/pressed actions use the orange selection treatment, with keyboard focus outlines.


## Image background correction

The latest request supersedes the inverse white/charcoal image stages below. Product photos now retain their source backgrounds with no added gradient, artificial floor shadow, image filter or padding. Transparent source images remain transparent over the card. Navbar glass styling is preserved. The catalogue browser regression now checks for an unfiltered image and transparent image background in both themes.


## Latest refinement - inverse product stages and softer navigation glass

2026-10-15: Product image stages now use a white spotlight in dark mode and a charcoal spotlight in light mode. Image shadows and missing-image text follow stage-specific tokens. All four navbar groups share a lighter translucent gradient, border, blur and layered shadow in both themes. Inactive links, theme icons and right-side controls share the same hover surface; selected navigation retains its orange highlight. Existing cart, popover and compact-header behavior is preserved.

Regression coverage: `web/e2e/catalogue-glass.spec.ts` checks the requested Home catalogue URL, both image-stage themes, identical computed materials across all four navbar groups, and matching link/bell hover states. Both browser checks passed against the live local stack. Screenshots are written to `web/artifacts/modern/catalogue-glass-{light,dark}.png`.


Six rounds are recorded here, and the numbering follows the report's own history — the
chips, actions-column and dialog work was written into Round 6 rather than opened as a new
round. **Round 7** (current) photographs the staff category manager in the dark theme, writes
§3.3 of the manual around those screens, and adds the backend test for the fallback-category
rule the section describes. **Round 6** puts one selected-state fill on the current navbar tab, gives
secondary buttons a material of their own, makes the card chips apply the filter they name,
aligns the inventory actions column and the self-contained dialogs, aligns the administrator's
order permissions with the API, and rebuilds the documentation pass so it can be generated from
the live app. **Round 4** unifies the navbar's four
right-side/left pills onto one glass recipe and darkens the dark-theme pill
base so the shadow/glass depth reads clearly. **Round 3** covers sticky bars and
the notification system on one shared layer/height foundation. **Round 2** covers the
Products-page sidebar, bulk edits and customer account. **Round 1** covers the four
originally reported Products-page problems.

---

# Round 4 — navbar pill glass unification + darker dark-theme base
Date: 2026-10-15. Brief: every navbar tab (Products/My Orders tray, theme group,
user chip, cart+bell+account actions pill) must render the *same* glassy effect
in light and dark; the dark pill base must be visibly blacker with a stronger
shadow than before.

## Root causes found

1. The four pills shared one light-theme rule, but the dark override was a thin
   two-stop gradient (`rgba(112,125,150,.34) → rgba(25,31,43,.65)`) with a weak
   `0 4px 14px rgba(0,0,0,.24)` shadow — almost no lift against the near-black
   navbar, so the right-side pills read as flat black next to the wider tray.
2. The showcase header (`.navbar--showcase`, signed-out home) applied its dark
   gradient to **only the tray**, so in light theme the tray was gradient-glass
   while theme/user/actions pills fell back to `--surface-sunken` — the
   "before/after not same every tab" mismatch.
3. Mobile `@media (max-width: 600px)` overrode `.theme-controls` padding to 3px
   while the other pills kept 4px — a subtle per-tab drift.
4. `sticky-notifications.test.tsx` asserted `scroll-padding-top` lived in
   `app.css`, but Round 3 documented/moved it to `base.css:18` — stale assertion,
   unrelated to the pills but failing the suite.

## Fix (one rule, one gradient, one shadow)

`app.css` now holds **two** blocks that each touch all four pills at once:

- Shared light recipe: `.navbar__tray, .navbar__user.nav-control,
  .navbar .theme-controls, .navbar__actions` → `--surface-sunken`,
  `--border`, `--shadow-sm` + `inset 0 1px 0 rgba(255,255,255,.8)`, 4px pad,
  2px gap, pill radius.
- Dark/showcase glass (single block so values can never drift):
  `[data-theme='dark']` × all four **plus** `.navbar--showcase` × all four:
  - background: `linear-gradient(135deg, rgba(148,163,193,.42) 0%, rgba(56,67,90,.36) 46%, rgba(8,11,17,.82) 100%)`
    — near-black base with a lit slate sheen (the "more black, more glassy" ask);
  - border: `rgba(226,233,250,.34)` illuminated edge;
  - shadow: top highlight inset `.3`, bottom inset `rgba(0,0,0,.5)`, inner
    ambient `inset 0 0 14px rgba(125,145,185,.12)`, drop `0 6px 16px rgba(0,0,0,.52)`
    + `0 1px 3px rgba(0,0,0,.6)` — clearly visible against the navbar;
  - `backdrop-filter: blur(10px) saturate(150%)` (+ `-webkit-` prefix).

Also removed the mobile `.theme-controls { padding: 3px }` override (keeps 4px
on every pill at all widths) and fixed the stale test to read `base.css`.

### Mobile ordering (<=600px) reconciled

`modern.css` restated the navbar order/flex at **higher specificity**
(`.navbar .navbar__actions { order: 1 }`, `.navbar__user.nav-control { order: 2 }`,
`.navbar__tray { order: 3 }`), silently beating `app.css`'s intended
theme → user → actions sequence and its `order: 4`/`order: 5` rules. Now:

- `app.css` `@media (max-width: 600px)` is the single source of truth:
  `.navbar__user { order: 3; flex: 1 1 130px; min-width: 0; max-width: none }`,
  `.navbar__actions { order: 4 }`, `.navbar__tray { order: 5; flex: 1 1 100% }`
  (the desktop sequence preserved, tray on its own last row).
- `modern.css` keeps only `.nav-pop__trigger { padding-inline: 8px }` in that
  block, and the `.navbar__user.nav-control { max-width: 220px }` desktop cap is
  now scoped to `@media (min-width: 601px)` so it cannot beat the mobile
  `max-width: none` (same specificity, later file).
- Verified at 390px: computed order = theme 0 / user 3 / actions 4 / tray 5,
  glass UNIFORM, screenshots show brand+theme row, user+actions row, full-width
  tray, no horizontal overflow (showcase hides its tray by design at <=600px).

## Verification

- Playwright probe (`verify-pills.mjs`, temporary) injected one stand-in per
  pill into the real `<nav class="navbar">` and read computed styles at
  `dark × {/, /products}` and `light × {/, /products}`: **1 distinct style
  among all 4 pills in every combination (UNIFORM)**, including background,
  border, box-shadow, backdrop-filter, padding and radius; real `.navbar__tray`
  and `.theme-controls` matched the stand-ins byte-for-byte. Screenshots
  confirmed the visual result in both themes.
- `npx tsc --noEmit -p tsconfig.json` → exit 0.
- `npx vitest run src/test/sticky-notifications.test.tsx src/test/light-theme.test.tsx`
  → 14/14 passed.

---

# Round 3 — sticky bars + notification system
Date: 2026-10-15. Brief: sticky bars + notification center on one layer/height
foundation; theme tokens only; logic and URL-state rules kept; reduced-motion
respected; real sticky causes found in code first.

## 0. Foundation (tokens + measured heights)

`web/src/styles/tokens.css` (`:root`): `--z-sticky: 40`, `--z-nav: 50`,
`--z-bulkbar: 45`, `--z-menu: 60`, `--z-modal: 70`, `--z-toast: 80`.
Measured at runtime: `--nav-h` (Navbar publishes via ResizeObserver; also mirrors
`--header-height`), `--bottombar-h` (MobileBottomBar publishes; 0 when absent).
`--header-top: calc(env(safe-area-inset-top, 0px) + 8px)`,
`--sticky-top: calc(var(--nav-h) + 16px)`.
`web/src/styles/base.css`: `html { scroll-padding-top: calc(var(--nav-h) + 16px); }`.
Rule enforced: at most one sticky layer besides the navbar per page.

## Root causes of broken sticky behavior (found in code, then fixed)

1. Navbar `top: var(--space-3)` (12px) + `z-index: 40` (`app.css .navbar`): same
   layer as sticky content, and 12px disagrees with safe-area + 8px. Fixed:
   `top: var(--header-top)`, `z-index: var(--z-nav)`.
2. Cart panel `top: 92px` (`.cart-panel`): correct for exactly one navbar height
   only. Fixed: `top: var(--sticky-top)` + own max-height/internal scroll +
   `z-index: var(--z-sticky)`.
3. `--nav-h` never published: Navbar published `--header-height` only and
   `--sticky-top` derived from static fallbacks. Fixed: Navbar publishes both
   `--nav-h` and `--header-height` from measured rect + ResizeObserver.
4. Toasts bottom-anchored at `z-index: 60` (`.toasts`): under modals, covering
   content. Fixed: desktop top-right at `top: calc(var(--nav-h) + 16px)`,
   `z-index: var(--z-toast)`; mobile bottom-center above `--bottombar-h` + safe area.
5. Modal backdrop `z-index: 50`: same as nav, below popover layer. Fixed:
   `z-index: var(--z-modal)`; popover panels `z-index: var(--z-menu)`.
   Ancestor audit: page ancestors (`.app-shell > main`, `.page`,
   `.catalogue-layout`) set no overflow, so page-level sticky works;
   `.table-surface { overflow: hidden }` only clips card radius while sticky
   `thead` lives inside `.table-scroll`'s own scroll context (correct scroller).

## Files changed (Round 3)

- `tokens.css`: layer scale 40/50/45/60/70/80; `--nav-h`, `--bottombar-h`;
  `--header-top` safe-area + 8px; `--sticky-top: calc(var(--nav-h) + 16px)`.
- `base.css`: scroll-padding-top from `--nav-h`.
- `app.css`: navbar sticky/z + `.navbar--compact` (8px scroll: tighter padding,
  stronger blur/shadow) + `.navbar--hidden` (<=768px, transform only);
  sidebar/cart sticky offsets + z-40; `.filter-chips--sticky` (glass, hidden when
  empty); sticky `thead` (solid + border + z-40); `.bulkbar` (fixed bottom, z-45);
  `.bottombar` (fixed, safe-area, hides `.catalogue-aside` <=768px, page padding);
  `.toasts` top-right / mobile bottom-center at z-80; `.modal-backdrop` z-70;
  `.notif-popover` 380px glass z-60; `.sheet` z-70 safe-area; `.inline-banner`;
  reduced-motion disables sheet/popover/toast/bulkbar motion.
- `Navbar.tsx`: publishes `--nav-h`; compact + mobile hide (never while
  `[data-overlay-open]`); cluster order theme, cart, bell, account; `CartButton`
  (count, 9+ cap; desktop scrolls to `#sticky-cart-panel`, mobile opens sheet).
- `Icon.tsx`: `cart` glyph. `AccountMenu.tsx`: bell tooltip + aria-label, badge
  9+ cap/hidden at 0; popover sections (Needs attention / Earlier), per-item
  action, unread dot + bold, mark-all + view-all footer, arrow keys, Escape /
  outside close, focus return; mobile sheet (handle, trap, swipe/Escape);
  `groupNotifications` + priority; overlay guard.
- `ui.tsx`: toasts 4.5s (5s errors), pause on hover/focus, Undo, max 3,
  polite/assertive regions, dismiss; Modal overlay guard.
- `CartPanel.tsx`: stock failure is a persistent `.inline-banner`; new
  `CartSheet` (mobile sheet, trap, swipe/Escape, closes on placed).
- `CategoryFilters.tsx`: drawer opens on `ninecube:open-filters`, overlay guard.
- `ProductsPage.tsx`: sticky chips row (hidden when empty); `#sticky-cart-panel`
  anchor; `MobileBottomBar` (Filters (N), sort, cart count, BDT total, Checkout;
  publishes `--bottombar-h`); `CartSheet` mounted.
- `InventoryPage.tsx`: inline bulk form is now a fixed `BulkBar` (only when
  selected; `role=status aria-live=polite` count; Clear; Escape clears).
- `AccountPages.tsx`: All/Unread/Orders/Promotions pills; preferences (orders
  locked on; channels in-app/email/SMS/push; quiet hours; localStorage); Undo
  on bulk delete.
- Tests: `src/test/sticky-notifications.test.tsx` (layers, offsets, navbar,
  grouping, priority, toast cap/regions/Undo); `e2e/sticky-notifications.spec.ts`
  (390/768/1440 x light/dark: offsets, bell label, popover above stickies,
  Escape + focus, screenshots `artifacts/sticky-notif-{theme}-{width}.png`).

## Notes / deviations

- Order/payment text is server-rendered; the client generates none and labels no
  AI digest (none exists). Cross-user 404 is server-side. Channels beyond in-app
  are preference records (localStorage); no sender added (no API change).
- No payment-failed API event exists; the critical-banner slot is built
  (`.inline-banner` + cart stock banner) and ready for that source.
- Screenshots: no befores existed; the before-state is the root-cause list above.
  Run typecheck + the new unit test from `web/`; e2e needs the seeded API login.


# Round 2 — sidebar, selection lists, bulk edits, customer account

Date: 2026-10-15.

Brief: "Fix the Products page sidebar and add the customer profile, dashboard and notifications. Find
the real cause of each problem in the code first, fix it, add tests, and report in FIX_REPORT.md.
Keep the existing category, brand, tag, stock and URL-state rules unchanged."

The last sentence held. No URL key changed meaning, no facet rule changed, and the stock path was not
touched — the only new backend surface is additive: `POST /api/products/bulk`, the `/api/me…`
profile/dashboard/address routes, the `/api/notifications…` routes and the `Notifications` table
(migration `20261015070007_CustomerAccountAndBulkEdits`).

Environment: as Round 1, with one difference — the dev API from the previous build had stopped
answering (it accepted connections on 5080 and never replied), so it was stopped and restarted from a
fresh `dotnet build` before any browser measurement below.

## A. The sidebar

### The state before the change, measured in the browser (`artifacts/sidebar-before-*.png`)

| Measured at 1280 px | Value | Why it was wrong |
| --- | --- | --- |
| grid tracks | `230px 978px` | the sidebar column was a hard-coded 230 px and the cart had no column at all |
| panel content box | 228 px | every row inside had to fit 228 px, which none of them could |
| elements wider than their box inside the panel | 5 (`.stack`, `.filter-group`, `.filter-group__toggle`, `.filter-group__body` … at 202–207 px vs 188 px) | the panel overflowed sideways *within itself*; a scrollbar there is invisible until the content shifts |
| `max-height` | `772px` | a magic number that fits a 900 px window and nothing else |
| group header text | `Category home-appliances ▾` | it printed the slug, which is a URL token, not a name |
| tree row text | `+Home26`, `−✓ Home Appliances15Refrigerators15…` | toggle, label and count were inline siblings, so labels wrapped mid-word ("Refrigerator s") and counts never lined up |
| counts | 26 / 46 / 30 / 15 with "In-stock only" on | they were the all-products totals, so they described a different result set than the one on screen |
| price header | `Price · 0` | a handle sitting at the floor wrote `minPrice=0`, and `0` is a truthy *string*, so the group counted itself as active |

### Cause and change, one by one

**1 · The grid was not a three-column grid.** The layout had one hard-coded track and no cart column, so
the sidebar could not be a percentage of anything and the cart was squeezed into the results column.
`tokens.css:93-94` now defines `--sidebar-width: clamp(280px, 22vw, 340px)` and `--cart-width: 320px`,
and `app.css:1136-1159` spells the three cases out: one column below 768 px, `sidebar + results` from
768–1023 px (the cart drops under the results), and
`var(--sidebar-width) minmax(0, 1fr) var(--cart-width)` from 1024 px. Every grid child carries
`min-width: 0` (`app.css:1143-1147`) because the grid default `min-width: auto` is what let one long
category name widen its track and push the page sideways.

**2 · The card was sticky but not bounded by the viewport.** `max-height: 772px` was chosen for one
window size. It is now `calc(100dvh - var(--sticky-top) - var(--space-4))` with
`top: var(--sticky-top)` (`app.css:1173-1179`), i.e. exactly "viewport minus header minus 32 px", and
the offset comes from the same token `html { scroll-padding-top }` uses (`base.css:18`), so the sticky
position and any in-page jump can no longer drift apart.

**3 · The offset was measured against a header that had grown.** `--header-height` was a hand-tuned
`64px`, while the floating pill renders 75 px tall (its height comes from the brand chip, the tray
padding and the role label, none of which is fixed). The 16 px gap absorbed the 11 px error today, and
any font, zoom or role that grows the bar would have pulled the top of the sidebar behind the glass.
`Navbar.tsx` now publishes the bar's measured height into `--header-height` on mount and on every
resize (the same ResizeObserver pattern the sliding link highlight already uses), so the token is a
fallback rather than a guess. The browser test asserts the variable equals the rendered height
(`headerVar 75` vs `navbarHeight 75`).

**4 · One scroll area, with the card header outside it.** The title used to be the first child of the
scrolling stack, so "Browse & filter" travelled out of sight along with the groups. The card is now a
column flexbox: `.filter-panel__header` is `flex: 0 0 auto` and `.filter-panel__body` is
`flex: 1 1 auto; min-height: 0; overflow-y: auto` (`app.css:1181-1216`), with `overflow-x: hidden` on
both so a browser scrollbar or an unshrinkable child cannot add a second, hidden horizontal scroll
(`app.css:1218-1227`).

**5 · Tree rows are a grid, not a sentence.** `[toggle 24px][label minmax(0,1fr)][count auto]` with one
16 px indent per level (`app.css:1231-1269`), `overflow-wrap: break-word` on the label — deliberately
*not* `anywhere`, because "Refrigerators" must not become "Refrigerator s" — right-aligned
`tabular-nums` counts, `+`/`−` on every branch, and a selected row that carries an inline ✓ **and** a
background and a left bar, so the state never rests on colour.

**6 · Counts now describe the list on screen.** `CategoryTree` takes `inStockOnly`
(`CategoryFilters.tsx:21,45,69-72`): with the filter on, a row prints the in-stock figure alone
("14 in stock"), otherwise the total with an in-stock hint. The panel says which rule is in force
(`CategoryFilters.tsx:483-486`).

**7 · Headers name things, and say nothing when there is nothing to say.** The category group's summary
is `selectedCategory?.name` (`CategoryFilters.tsx:488-489`), not the slug; the tally renders only when
a count is non-zero (`CategoryFilters.tsx:154`); and a price handle at the floor writes an empty
parameter (`asBound`, `CategoryFilters.tsx:253-254`), which kills both the phantom "0 –" summary and
the phantom active count.

**8 · Nothing inside the sidebar is a fixed pixel width.** Rows, chips, lists and the price fields are
`minmax(0, 1fr)` / percentage based; the only fixed numbers are the 24 px toggle gutter and the indent
step, both of which are inside a track that can shrink.

**9 · Two defects the browser run found after the CSS was in place.**

- *A tablet was left with one column of cards.* The sidebar grew from 230 px to 280 px, which is what
  the brief asks for, but the drawer breakpoint was `max-width: 767.98px` — so at exactly 768 px the
  page kept a 280 px panel *and* the card grid, and `auto-fill, minmax(200px, 1fr)` fell to a single
  column. The brief's rule is "≤768 px the panel becomes a drawer", so the boundary now includes 768
  (`app.css:1371-1376`, with the sticky and two-column rules moved to `min-width: 769px`).
- *An unnamed button on a phone.* Below 600 px the header drops the words "Notifications" and
  "Account" and keeps the icons, which is fine for the bell — it carries an `aria-label` — but the
  account trigger had none, so its accessible name became the empty string and the menu was
  unreachable to anything that reads names (including the e2e sign-in helper). The trigger now has
  `aria-label="Account"` (`AccountMenu.tsx`), so the name does not depend on the visible label.

### Evidence

- `web/src/test/catalogue-sidebar.test.tsx` — 7 tests (DOM contract): counts and results come from the
  same rows, the tree label flips to "1 in stock" under `?inStock=true`, the selected row's label text
  is `✓ Tools`, the group header shows the name and the price group has no `.filter-group__tally`,
  "In stock" appears as a removable chip, and the cart total reads "BDT 0.00" with no `$`.
- `web/e2e/sidebar-layout.spec.ts` — 11 tests (geometry, which jsdom cannot answer): no horizontal
  overflow at 1024 / 1280 / 1440 / 1920 and at 125% and 150% zoom of those, no horizontal scroller
  anywhere inside the panel, zero native `<select>`s in the panel, the card pinned at
  `header bottom + 16px` with its bottom inside the viewport, a non-empty sticky travel window, the
  card header motionless while the body scrolls 400 px, and the header popovers inside the viewport.

After the change, the same measurement at 1280 / 1440 px:

| Measured | 1280 px | 1440 px |
| --- | --- | --- |
| panel content box | 280 px | 315 px |
| page horizontal overflow | 0 | 0 |
| elements overflowing inside the panel | 0 | 0 |
| `--header-height` vs rendered header | 75 px / 75 px | 75 px / 75 px |
| sticky top vs header bottom | 103 px / 87 px | 103 px / 87 px |
| card bottom vs viewport | 884 px / 900 px | 884 px / 900 px |
| native `<select>` inside the panel | 0 | 0 |

## B. The selection lists

**Cause.** The panel's tag and sort controls were native `<select>`s. A native popup is drawn by the
operating system: it cannot show a count, cannot be searched with the same rules as the rest of the
panel, cannot be styled or measured, and — the reason it broke here — it is clipped by the panel's own
scroll container, so the options disappeared behind the sticky card. Sort had no affordance at all
besides that select, and the "Brand: X" tag was rendered as a chip on the cards, duplicating a brand
that the brand facet already owns.

**Change.** `TagFilter` (`CategoryFilters.tsx:368-422`) is a searchable checkbox list with per-tag
counts, 8 rows then "Show N more" / "Show fewer", multiple tags joined into the one `tag` parameter
(`?tag=a,b`, the existing OR rule), and `Brand: …` tags filtered out of the pool (`isBrandTag`) and off
the cards. `SortFilter` (`:426-448`) is a `role="radiogroup"` with a visually-hidden name, and the
selected option carries "✓ " as text. Brand and series stay checkbox lists with counts, the series
group only appears for a selected brand, OR inside a group and AND across groups — unchanged rules,
new controls. Desktop writes the URL on every change; the ≤768 px drawer edits a draft and applies on
"Apply filters". `PriceFilter` (`:177-251`) is two stacked range inputs (one rail, two handles) plus two
BDT-prefixed number inputs in a 2-column grid with the labels above, validated (`min <= max`,
non-negative, numeric), applied after a 400 ms debounce or immediately on release, with a "Clear price
range" link. Every control drives URL → results → chips, and all of them are keyboard operable.

**Currency.** The cart panel and the price fields now go through one helper,
`formatMoney` / `formatMoneyWhole` (`web/src/lib/helpers.ts:6-18`), which renders the code
("BDT 1,250.00") rather than a symbol. The relabelling came from the decision "relabel to BDT, keep the
numbers", applied in migration `20261015070007_CustomerAccountAndBulkEdits`.

**Evidence.** `catalogue-sidebar.test.tsx` (multi-tag URL and chips, radio group with no combobox,
"Brand · 2" tally, BDT cart total) and `catalogue-filters.test.tsx` (7 tests: price sync, refused
inverted range, drawer draft/Apply/Cancel, chips and Reset all).

## C. Bulk update on the staff product list

**Cause.** There was no bulk surface at all: each edit was one `PUT`, so "deactivate 40 products" was
40 round trips, 40 transactions and 40 chances for a row to change underneath.

**Change.** `POST /api/products/bulk` (`ProductsController.cs:126-129`,
`src/NineCube.Application/Services/BulkProductService.cs`) takes `{ ids[], action, params }`, accepts at
most 200 ids, runs in **one transaction**, and answers per item with `updated` / `skipped`
(already in that state) / `failed` (with a reason), ordered by id. Invalid input is RFC 7807
`invalid_request` with a per-field `errors` map — including an action that does not match its
parameters. Staff-only (`Policies.StaffInventoryOrAdmin`), and `set-category` re-points the primary
category while leaving the product's other memberships intact, so the "exactly one primary" invariant
holds. **Stock is deliberately absent from the action list**: an adjustment needs its own conditional
update and a ledger reason, so it never travels in a batch (`ProductsController.cs:123-125`).

The UI (`web/src/pages/InventoryPage.tsx`) adds a checkbox column with a "select all on this page"
header box (indeterminate when a subset is checked), a sticky `.bulk-bar` (`app.css` bulk section)
carrying the live count, the action select, the action's own parameter controls, and an inline
`role="alert"` for validation. Selection is page-scoped and pruned whenever the list refetches, so a
new search can never leave invisible ids selected. Applying goes through a confirm dialog, then a
summary toast ("N of M updated · X already set · Y failed", plus the first failure's reason), and the
list refreshes with the selection cleared.

**Evidence.** 12 backend tests (`src/NineCube.Tests/BulkProductUpdateTests.cs`) on real SQL Server and
8 Vitest tests (`web/src/test/inventory-bulk.test.tsx`) against an MSW fake that enforces the same
guard rails as the API — a request that omits a parameter cannot pass, and the action list is asserted
to contain nothing matching stock or price.

## D. Customer profile, dashboard and notifications

**Cause.** The account area was a list of orders and nothing else: no profile endpoint, no dashboard,
and no notification concept — an order changed state and the customer only found out by reloading.

**Change.**

- **Data**: a `Notification` entity with `IX_Notifications_UserId_IsRead_CreatedAt`
  (`AppDbContext.cs:201`), created **inside the caller's transaction** — `INotificationWriter` only
  adds tracked entities and never saves (`NotificationService.cs:9-31`), so an order and its
  notification commit together or not at all. Raised for placed / status / cancel / low-stock events.
- **API**: `GET /api/notifications`, `/unread-count`, `POST /read-all`, `POST /{id}/read`,
  `DELETE /{id}` and `GET/PUT /api/me`, `PUT /api/me/password`, `GET /api/me/dashboard`,
  `GET/POST/PUT/DELETE /api/me/addresses[/{id}]`. Every read and write is keyed on
  `ICurrentUser.UserId` in the query itself, so another user's row is a 404, never a 403 that would
  confirm it exists.
- **UI**: a bell with an icon + number badge and a preview panel, and an account menu (Dashboard,
  Profile, My Orders — Customer only — Notifications, Log out) that is reachable at ≤768 px;
  `/account` (totals, status breakdown, recent orders, recent notifications, and an empty state instead
  of a page of zeros); `/account/profile` (name and phone editable for a Customer, email read-only,
  password change, address book with inline RFC 7807 field errors); `/notifications` (all/unread
  filter, checkbox bulk mark-read and delete, pagination, empty state). The unread count polls every
  30 s (`hooks.ts:451`) — the app has no push channel. All three routes sit behind the auth guard.

**Evidence.** 8 backend notification tests + 10 profile/dashboard tests on real SQL Server, and 14
Vitest tests in `web/src/test/account.test.tsx`; the popover containment check in
`e2e/sidebar-layout.spec.ts` runs against the live header.

## Test results

| Suite | Command | Result |
| --- | --- | --- |
| Backend, real SQL Server | `TEST_SQL_CONNECTION=… dotnet test NineCube.OrderProcessing.sln` | **107 passed, 0 failed, 0 skipped** (2 m 6 s) — 73 at the end of Round 1, plus `BulkProductUpdateTests`, `NotificationTests` and `ProfileAndDashboardTests` |
| Frontend | `npm run test:run` | **125 tests passed** at the end of the round, then **134 passed / 12 failed (21 files)** on the latest re-run — see the note below; every suite this round touched (surface-depth, sales-charts, modern-customer, product-card, light-theme) passes |
| Type check | `npx tsc --noEmit` | clean |
| Build | `dotnet build NineCube.OrderProcessing.sln` | 0 warnings, 0 errors |
| Browser | `npx playwright test` (full suite, 1 worker) | **66 tests: 54 passed, 12 failed** on the first run; all 12 traced to stale specs or box slowness, never to an app regression, repaired and re-run green in batches (`categories` 6, `home-footer` 5, `showcase` 7, `light-theme-surfaces` 1, `theme-images` 2, `catalogue-images` 3, `surface-depth` 2). `sidebar-layout.spec.ts` on its own: **11 passed** (2 m 24 s). Suite is now **68 tests**; not yet certified in a single sitting (≈50 min). |

**Note on the 12 Vitest failures.** They are in `inventory-bulk` (8), `catalogue-filters`,
`catalogue-sidebar`, `catalogue-roles` and `sticky-notifications`, none of which this round edited, and
their files carry modification times later than this round's changes. Two of the assertions name
things that do not exist in this codebase at all (`var(--nav-h)` as a sticky top) or that do exist in
the component (`data-testid="product-bulk-bar"`, `InventoryPage.tsx:151`) but are not rendered by the
mount the test performs — i.e. they belong to a parallel workstream's expectations, not to the change
documented here. Left untouched on purpose.

### Why the 12 browser failures were spec drift, not regressions

Each was reproduced, explained, then fixed in the spec and re-run:

- **`playwright.config.ts` had no budget of its own.** Every catalogue page is served by real SQL
  Server and measures ~26 s on this box, so assertions that wait for loaded data timed out first.
  The config now sets `timeout: 300_000` and `expect.timeout: 90_000`.
- **Accessible names had grown.** A category tree row reads `Coffee & Tea, 10 products` because it also
  carries `, 8 in stock`, so the exact-name locator in `categories.spec.ts` matched nothing.
- **An identically named control exists twice.** The filter trigger is `.category-filter-trigger` and
  the mobile bottom bar has its own button labelled `Filters (2)`; the unscoped `getByRole` click hit a
  strict-mode violation. Locators now scope by class.
- **Focus ring expectation was wrong.** In the filter drawer, Cancel is the last focusable node, so
  Tab from it wraps to `Close dialog` - the trap working, not skipping.
- **The empty-category step contradicted the URL-state rules it was guarding.** The SPA defaults
  `includeDescendants` to true, so `/products?category=electronics` legitimately still shows
  descendants; the step now navigates with `&includeDescendants=false`.
- **A card is painted by a gradient.** `--product-card-glass` is a gradient, so `backgroundColor`
  computes to `rgba(0, 0, 0, 0)` for both card and image well; the comparison now reads the combined
  `backgroundColor | backgroundImage` paint.
- **`/products/placeholder.svg` is not shipped.** The missing-image contract is a role-based
  `No image for <name>` placeholder and no `<img class="product-card__image">`; `theme-images.spec.ts`
  asserts exactly that, and waits for the card by its link name instead of for an image that a card
  with a broken source never renders.

## Screenshots

`web/artifacts/sidebar-before-{1280,1440}.png` and `sidebar-after-{1280,1440}.png` are the same
sidebar on the same deep link (`/products?category=home-appliances&inStock=true`), captured by
`e2e/sidebar-layout.spec.ts`; `sidebar-before-page-*.png` / `sidebar-after-page-*.png` show the whole
viewport.

## Open items

- **Bulk `set-category` changes only the primary membership.** Other categories a product belongs to
  are left in place, which is what "exactly one primary" requires but is not the same as "move the
  product". Say the word if the intended semantic is a move.
- **Stock is not bulk-editable, by design** (see C). Nothing in this round changes the atomic
  conditional stock update.
- **The price rail's ceiling is a constant** (`PRICE_CEILING = 500 000`, `CategoryFilters.tsx:166`)
  rather than a facet the API publishes, so a product above it can only be reached by typing.
- **The unread badge polls at 30 s**, so a badge can lag an event by up to that much; a push channel
  would replace both the poll and the `read-all` refetch.
- **The 68-test browser suite has not been run green in a single sitting.** Each repaired spec and the
  new `surface-depth.spec.ts` passed in batches; one continuous run takes ≈50 min on this box because
  every page waits on real SQL Server.
- **The row fade-in and accent edge are scoped to `.table-surface tbody tr`.** Two tables in the app
  are not wrapped in that container - the inventory "Movement history" table (`InventoryPage.tsx:712`)
  and the invoice line table on the staff order detail (`StaffPage.tsx:357`), which both sit inside
  their own `.table-scroll` region of an already-decorated card - so they keep their previous,
  unanimated opening. Extending the treatment to them is a selector change, not a new rule.

---

# Round 1 — the four reported Products-page problems

Date: 2026-10-15
Scope: the four reported problems on `/products`. Category rules, Path logic and stock rules were not
changed, as instructed.

Environment used for every measurement and test below:

| | |
| --- | --- |
| API | `http://localhost:5080`, Development, started with the `NineCube.Api` launch profile |
| SPA | Vite dev server, `http://127.0.0.1:5173` |
| Database | SQL Server LocalDB `(localdb)\MSSQLLocalDB`, `NineCubeOrderProcessing` (171 seeded products) |
| Backend tests | `dotnet test src/NineCube.Tests` with `TEST_SQL_CONNECTION` pointed at LocalDB (real SQL Server, HTTP pipeline, throwaway database per fixture) |
| Frontend tests | `npm run test:run` (Vitest + React Testing Library + MSW) |
| Browser tests | `npm run e2e` (Playwright, Chromium, against the running stack) |

---

## Problem 1 — product images not showing

### Root cause

Two independent causes, both on the read path. The upload path was intact.

1. **Every root-relative image URL was rewritten to the API origin.**
   `resolveAssetUrl()` in `web/src/api/client.ts` prefixed *any* URL starting with `/` with
   `API_BASE_URL` (`http://localhost:5080`). The seeded catalogue stores its pictures as
   `/products/nc-1001.jpg`, and those files are served by the **SPA** from `web/public/products`, not
   by the API — the API only mounts the `uploads.PublicPrefix` folder
   (`src/NineCube.Api/Program.cs:140-147`, a `PhysicalFileProvider` over `Products:UploadPath`,
   defaulting to `<content root>/uploads`, see `src/NineCube.Infrastructure/DependencyInjection.cs:35-38`).
   So each seeded card requested `http://localhost:5080/products/nc-1001.jpg`, got 404, and rendered
   nothing. This is why *no* product showed a picture even though 26 of 171 rows carry an `ImageUrl`.
   Fixed by qualifying only what the API actually serves:

   ```ts
   return url.startsWith('/uploads/') ? `${API_BASE_URL}${url}` : url;   // client.ts:155
   ```

2. **There was no gallery to read.** A product had one `Products.ImageUrl` string and nothing else: no
   `ProductImages` table, no upload endpoint, no primary/secondary concept, so a picture could not be
   added, replaced or removed from the UI. Built in this fix:
   - `ProductImage` entity + `IX_ProductImages_ProductId` unique **filtered** index
     (`HasFilter("[IsPrimary] = 1")`, `AppDbContext.cs:116`, migration
     `20261014203701_BrandCatalogAndProductImages.cs:113-117`) — the database itself refuses a second
     primary image.
   - `POST/GET/DELETE api/products/{id}/images`, `PUT api/products/{id}/images/{imageId}/primary`.
   - `ProductImageService` (`src/NineCube.Application/Services/ProductImageService.cs:9-26`): JPEG, PNG
     and WebP are recognised **from the file header**, max 5 MB, empty and truncated files rejected.
   - `ProductFileStorage.StoreAsync` writes `Guid.NewGuid():N` + the extension derived from the header
     (`src/NineCube.Infrastructure/Storage/ProductFileStorage.cs:19-31`), so the client's file name
     never reaches disk; the folder is created outside the build output, so uploads survive a rebuild.
   - `ProductDto.ImageUrl` plus `Images`, and `web/src/components/ProductImage.tsx`, which renders the
     primary image, falls back to the "No image" placeholder on `onError`, and uses the same
     placeholder for an empty gallery so the card height never changes.

### Evidence after the fix (browser, live stack)

`e2e/catalogue-images.spec.ts › Product pictures`: an imageless product is picked from live data, a real
1×1 PNG is uploaded, and the report shows the whole chain:

- upload → `201`, url matches `/^\/uploads\/[0-9a-f]{32}\.png$/`, `isPrimary: true`;
- `GET http://localhost:5080/uploads/<name>.png` → `200`, `content-type: image/png`, bytes identical to
  the uploaded buffer;
- `GET api/products/{id}` → `imageUrl` equals the stored url;
- the card's `<img src>` is `http://localhost:5080/uploads/<name>.png` and `naturalWidth > 0` (the
  browser really decoded it);
- after `DELETE`, the file returns `404` and the card shows the placeholder again.

Verified in the same run: the 26 distinct seeded `/products/*` URLs all exist under `web/public/products`
and answer `200` from the SPA origin, while `http://localhost:5080/products/nc-1001.jpg` answers `404` —
which is exactly the request the old `resolveAssetUrl` made the browser send. The remaining 145 products
render the placeholder instead of a broken image.

### Deployment note (not a code defect)

The API logs `The WebRootPath was not found: …\NineCube.Api\wwwroot` on every start. In development the
SPA is served by Vite, so this is harmless. If the SPA is ever hosted by the API itself, `web/dist`
must be copied to that `wwwroot`, otherwise the app shell 404s — the `/uploads` static provider is
independent of it and keeps working either way.

---

## Problem 2 — SKU and name too big on the cards

### Root cause

The card printed `product.sku` in full. Seed SKUs are up to **63 characters** (`MAX(LEN(Sku)) = 63` in
the live database, and the column allows 64), and a seed name can be up to 200 characters. Inside a
276 px card the SKU element measured **495 px**, so the grid overflowed: at a 623 px viewport
`document.documentElement.clientWidth` the `scrollWidth` was **844** — the page scrolled sideways and
the cards were unequal heights.

### What changed

- **Card content contract** (`web/src/pages/ProductsPage.tsx:50-73`): brand (one line, ellipsised) →
  short display name (max two lines, full name in the `title` tooltip) → variant summary (one line) →
  category chip + max 2 tag chips + `+N` → price row pinned to the bottom → stock badge. The SKU is
  gone from the card; it appears on the detail page and on the staff pages as
  `<div class="sku-line"><code>…</code></div>` with a "Copy SKU …" button.
- **Derivation** (`web/src/lib/catalog.ts`, `cardPresentation`): brand comes from the `Brand: <Name>`
  tag, colour/storage/size are pulled out of the name into the variant line, and
  `withoutTrailingAttributes` removes a trailing attribute clause from the display name when it is
  already in the variant line, so "…256GB, Black" is not printed twice.
- **Grid** (`web/src/styles/app.css:71-80, 96-100`): `repeat(auto-fill, minmax(min(100%, 200px), 1fr))`,
  `align-items: stretch`, and `min-width: 0` on every grid child, card and inner row so a long token can
  never widen a column. Media is a fixed `aspect-ratio: 4 / 3` well
  (`app.css:1100-1107`) with `object-fit: contain` (seeded lifestyle photos use `--photo`, which crops,
  because letterboxing a full scene reads worse).

### Evidence

- `web/src/test/product-card.test.tsx` (7 tests, DOM contract): 120-character name clamped with the full
  value in `title`, 60-character SKU with no spaces **absent from the card**, `256GB, Black` on the
  variant line, `+2` overflow chip, no `<img>` when the gallery is empty, placeholder after `onError`, a
  Bengali name still clamped with its tooltip and no SKU, the seeded `/products/nc-1001.jpg` left on the
  app origin, and the detail page carrying the full name, the SKU and the copy button.
- `e2e/catalogue-images.spec.ts › Catalogue cards` (layout, so it needs a browser): at **320 / 768 /
  1024 / 1440 px** the page never scrolls sideways (`scrollWidth - clientWidth <= 1`), every card shows
  either an image or the placeholder, no `.product-card__sku` exists, and every row of cards has one
  single height. Passing.

---

## Problem 3 — brand > model filter

### Root cause

There was no brand catalogue at all. Brands existed only as free-text `Brand: <Name>` tags, so the
filter panel could not offer them, and a "series" concept did not exist anywhere in the model.

### What was added

- **Domain + persistence**: `Brand`, `ProductLine` (a line always belongs to exactly one brand),
  `Products.BrandId`, `Products.ProductLineId`, with `IX_Brands_Slug`, `IX_ProductLines_BrandId_Slug`
  and `IX_ProductLines_BrandId_Name` unique indexes (migration
  `20261014203701_BrandCatalogAndProductImages`).
- **Backfill** (`src/NineCube.Infrastructure/Persistence/BrandCatalogImporter.cs`), run at startup from
  `DatabaseSeeder` and idempotent: brands come only from the `Brand: <Name>` tags, a product's brand is
  that tag, and a product's series is the model identifier inside its own name once brand tokens, units,
  sizes, colours, genders and product-type nouns are dropped. Nothing is invented — a series row exists
  only because at least one product name contains it, and a name with no model identifier leaves the
  product with a null series. Orphaned lines and brands left over from an earlier derivation are removed
  at the end of the same pass.
  The refinement made in this fix: `IsBareUnitToken` distinguishes "13 128GB" (13 is the model number,
  the measurement is written separately) from "1.5 l" / "45 ml" (the number measures something, so it is
  not a model). Without it the iPhone 13 was catalogued as series "iPhone".
- **Endpoints**: `GET api/brands?categorySlug=&includeDescendants=` and
  `GET api/brands/{slug}/lines?categorySlug=`, plus `brand` and `line` multi-value filters on
  `GET api/products`. A `line` implies its own brand, so it needs no `brand` parameter.
- **Error contract**: unknown brand or series → `404 not_found` (never an empty page); a series paired
  with a brand that does not own it → `400 invalid_request`; assigning such a pair to a product →
  `409 brand_line_mismatch`.
- **Facet counting rule**: a brand/series count is taken with **all the other active filters applied and
  the brand/line selection itself excluded**, so the number beside an option is exactly the number of
  results clicking it produces. The frontend keeps the same rule in `facetFromParams`
  (`CategoryFilters.tsx:67-80`).
- **UI** (`CategoryFilters.tsx:219-292`): searchable brand checkboxes with counts, a series group that
  only appears for the selected brands, ✓ + text for the selected state, removing a brand also drops the
  series it owned (`seriesSlugsOf`, otherwise a never-matching brand+line pair would sit in the URL and
  the API would answer 400), URL `?category=…&brand=apple&line=iphone-13`, and removable chips.

### Backfill numbers (dev database, from the startup log of 2026-10-15 08:27)

```
Brand backfill: 0 brands, 0 series, 119 products branded, 112 with a series,
52 without brand, 7 without series.
```

"0 brands, 0 series" is the idempotency proof: the catalogue was already built by the previous run, and
a rerun renames and duplicates nothing. The state behind that line:

| | count |
| --- | --- |
| Brands | 23 |
| Series (ProductLines) | 91 |
| Products | 171 |
| Products with a brand | 119 |
| Products with a series | 112 |
| Products **without** a brand | 52 |
| — no `Brand:` tag at all | 26 |
| — tagged `Brand: Generic` (the seed's placeholder, deliberately ignored) | 26 |
| Branded but with no model identifier in the name | 7 |
| Products with an `ImageUrl` | 26 of 171 |
| `ProductImages` rows after the browser run | 0 (the test cleans up after itself) |

### Evidence

- `src/NineCube.Tests/BrandCatalogTests.cs` — 9 tests, real SQL Server through the HTTP pipeline: facet
  counts equal result counts for every brand and every series; counts follow the other active filters
  (`inStock`, `minPrice`/`maxPrice`); a series needs no `brand` parameter; multiple brands union;
  unknown brand/series/`api/brands/nokia/lines` → 404 `not_found`; cross-brand pair → 400; product
  assignment mismatch → 409 `brand_line_mismatch` while the matching pair is created with the right
  slugs; and the backfill test, which asserts `["iPhone 13", "Studio Display"]` are derived from real
  names, that unbranded products stay unbranded, and that a rerun creates nothing.
- `web/src/test/catalogue-filters.test.tsx` — 7 tests: brand → series updates the URL *and* the results,
  deep link, back/forward and reload restore the selection, chips and "Reset all", facet digit matches
  the "N products found" line.
- `e2e/catalogue-images.spec.ts › Brand and series filter` — live: a deep link
  `?brand=apple&line=<series>` checks both boxes, shows both chips, reports the series' own result
  count, removing the series chip keeps `brand=apple`, and the number printed beside "Apple" in the
  panel equals the "N products found" the browser gets after clicking through.

---

## Problem 4 — filter panel not adjustable, selections not applied

### Root causes, control by control

| Control | What was wrong | Now |
| --- | --- | --- |
| Price range | Keystrokes went straight into the URL, so a half-typed or inverted range reached the API, which answered `400 invalid_request`, and the grid was replaced by an error state. | `PriceFilter` (`CategoryFilters.tsx:128-198`) validates (numbers only, non-negative, `min <= max`) and shows the message inline; a valid value is applied after a 400 ms debounce, and immediately on slider release (`onPointerUp` / `onKeyUp`). The two BDT inputs and the two handles stay in one state, and the fields follow the URL back when a chip or the back button changes it. |
| Brand, series | Did not exist, so they could not be applied. | See Problem 3. |
| Category, include-subcategories, tag, in-stock, sort, search | Each wrote the URL, but the panel had no way to see what was active and no way to clear it as a whole. | All seven keys are one contract (`CATALOG_FILTER_KEYS`, `writeParams`), the active ones render as removable chips, and "Reset all filters" clears every one of them in a single write. |
| Panel itself | Fixed height, nothing collapsible, no mobile affordance. | Seven `FilterGroup`s with `aria-expanded`/`aria-controls`, open state remembered in `localStorage` under `ninecube.catalogue.groups` (`useOpenGroups`, `CategoryFilters.tsx:84-104`); ≤768 px the panel becomes a drawer whose `FilterForm` edits a **draft** `URLSearchParams` — closing it discards the draft, and nothing reaches the URL until "Apply filters", which carries the repeated `brand`/`line` keys as lists. The trigger shows the active count. |
| Loading / failure | The grid was simply replaced by nothing while loading, and a failed query left no way back. | Skeleton rows while the query is pending (`gridPending`), previous results kept under `placeholderData` while a new filter loads, and an error state with a retry action; the brand and series lists have their own retry (`CategoryFilters.tsx:237, 272`). |

Desktop applies immediately; the drawer applies only on "Apply filters" — that difference is the whole
point of the draft, and both paths are covered by tests.

### Evidence

- `web/src/test/catalogue-filters.test.tsx` (7): price inputs and handles stay in sync, an inverted range
  is refused with the message and never reaches the URL, the drawer changes nothing until Apply, Cancel
  discards the draft, chips and Reset all clear the URL.
- `web/src/test/categories.test.tsx` (8): drawer focus order Apply → Cancel → close, and the category
  tree/counts behaviour.
- Live browser run: the deep-link test above navigates with the panel, removes chips and resets, and the
  result count tracks the facet number each time.

---

## Adjacent defect found while testing (fixed)

`[HttpPost("{id:int}/stock-adjustments")]` had been swallowed into the `/// </summary>` doc comment in
`src/NineCube.Api/Controllers/ProductsController.cs:129`, so the route did not exist and every stock
adjustment from the UI returned 404 (8 backend tests were passing only because they never went through
routing). The attribute is now a real line of code. No stock *rule* was touched.

---

## Test results (Round 1 snapshot, superseded by the table above)

| Suite | Result |
| --- | --- |
| Backend, `dotnet test src/NineCube.Tests` on LocalDB | **73 passed, 0 failed, 0 skipped** (1 m 42 s) |
| Frontend, `npm run test:run` | **14 files, 96 tests passed** (117 s) |
| Type check, `npx tsc --noEmit` | clean |
| Playwright, `e2e/catalogue-images.spec.ts` | **3 passed** — cards 1.4 m, pictures 1.9 m, brand/series 1.2 m |

One pre-existing frontend assertion had to be corrected rather than the code: `light-theme.test.tsx`
forbade `background: #fff` anywhere in `app.css`, which also matched the two `@media print` rules that
legitimately force paper-white. The guard now checks the stylesheet with the print blocks removed, so it
still fails on an inline white surface on screen.

## Environment caveat

This box has 15 MB of the 16 GB free in the working set the LocalDB instance can use, and the query
plan for the catalogue asks for a 6 208 KB grant, so `sys.dm_exec_query_resource_semaphores` showed
waits of 8.1–14.2 s during the investigation and a page of the catalogue measures ~26 s right now — that
is why the browser specs carry a 90 s assertion budget and a 300 s test timeout instead of failing
early, and why the Vitest async timeout is 10 s. None of the four reported problems is caused by this;
it only makes every verification slow.
