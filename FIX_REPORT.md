# FIX_REPORT

# Round 24 — the catalogue Quick View dialog: one photo frame, one buy row, no hand-painted styles

Date: 2026-11-05. Brief: a screenshot of the Quick View dialog on the deployed `#/products` page (Acer Aspire 3
A325-42-V2, BDT 57,000.00, dark theme, laptop) with "from the product card quick view give proper design and
adjustment". What the screenshot showed: a black band under the white product tile, a shopping-trolley pictograph
inside the "Add to cart" button, three controls of three different heights, and a bare amber
"View Full Product Details →" hanging under them.

## How I measured it

Same harness as the last rounds: the SPA booted against stubbed `/api/*` answers, opened the dialog from the real
card, and the probe asked the browser for rectangles and computed styles instead of reading my own CSS back. I
measured it on `c4dd210` - the commit that is on main now - so the phone-sheet rules that landed with it were part
of the picture rather than something I argued with afterwards. Widths: 1440x900, 1024x768, 768x1024 and 390x844,
light and dark. The probe scripts are throwaway and were deleted; `web/e2e/quick-view-modal.spec.ts` is the
permanent version of the same questions, and `web/src/test/quick-view-modal.test.tsx` pins the CSS contract so the
next person who paints this by hand finds out in the test run.

## What the dialog resolved to before I touched it

| | 1440 laptop | 390 phone |
| --- | --- | --- |
| media box | 294x294, filled `rgb(19, 17, 19)` | 356x160, filled `rgb(19, 17, 19)` |
| white tile inside it | 292x219 (the card's own 4:3) | 354x354 |
| what that cost | **74px of empty plate under the photo** | **97px of the photo cut off** |
| buy row | `display: block` - stepper 34px, button 41px, heart 40px, heart 3px above the button | flex, 34/44/44 |
| inline styles in the DOM | 5 | 5 |
| button labels | `🛒 Add to cart`, `✓ Added!` | same |
| sheet grabber | **44x5 painted inside the centred laptop dialog** | 40x4 |
| dialog | 720x575 | 390x608 |

The cause was two frames, not one. The dialog wrapped the shared card media in its own square box
(`.quickview-modal__media { aspect-ratio: 1/1; background: var(--surface-sunken); border: 1px solid var(--border) }`)
while the media inside it kept the card's own 4:3 white canvas. At laptop width the square is taller than the 4:3
tile, so the plate showed as a band; at phone width the sheet caps the box at 160px and the tile is 354px, so the
box clipped the picture. Everything else was the same class of miss: the buy row simply had no desktop rule at all
(the phone layout in `responsive.css` had one, the laptop dialog got a `div`), seven of the dialog's measurements
were inline `style={{...}}` props, the primary button's icon was a pictograph in its text, and the grabber that
`c4dd210` added for the phone sheet had nothing hiding it on a laptop.

I checked how far this went before editing: `QuickViewModal` is mounted from exactly one page (`ProductsPage`),
and `.quickview-modal__media` is styled in exactly two files, so this is one surface at two widths and two themes,
not a rule to propagate. The product page itself was already correct - it uses the shared media directly.

## What I changed

`QuickViewModal.tsx` keeps nothing painted by hand: the brand line, the SKU row, the locked note, the buy row and
the footer divider are five new class names (`quickview-modal__brand`, `__meta`, `__meta-label`, `__sku`,
`__locked-note`, `__footer`, `__add`), and the primary button now renders the house `<Icon>` - `cart`, then
`check` for the 1.4s confirmation - with the label in its own `<span>`. The label strings are unchanged, so the
Bengali file needed no edit.

In `app.css`:

- `.quickview-modal__media` is a sizing box only: no background, no border. The rule
  `.quickview-modal__media > .product-card__media { height: 100%; aspect-ratio: auto }` lets the shared card media
  be the frame, so the studio-white canvas the last round approved stays exactly as it is and there is no second
  plate behind it.
- `.quickview-modal__cta-row` is `display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap` with
  `> .btn { min-height: 44px }`, `.quickview-modal__add { flex: 1 1 150px }` and a 44px square heart. That is the
  same instrument the product page's `.product-detail__purchase` row uses, sized to the 44px the phone sheet
  already insisted on.
- `.quickview-modal__footer` carries the `border-top` divider and the link's size, replacing the inline style whose
  `margin-top: auto` could never fire in a non-flex column.
- `:root .quickview-modal__info { gap: var(--space-3) }` - with `:root`, because modern.css loads after app.css and
  its `.stack` gap of 24px is a page measure, too loose for a 352px dialog column.
- `@media (min-width: 641px) { .quickview-modal__handle { display: none } }`. The grabber is a bottom-sheet
  affordance; the centred dialog has an edge to hold.

## What it resolves to now

| | 1440 laptop | 390 phone |
| --- | --- | --- |
| media box / tile | 294x294 / **294x294** | 356x160 / **356x160** |
| band under or past the photo | **0px** | **0px** (picture 140x140 sits inside) |
| tile fill, both themes | `rgb(255, 255, 255)` | `rgb(255, 255, 255)` |
| buy row | flex, gap 8px, **34 / 44 / 44px**, tops within 5px | flex, gap 8px, 34 / 44 / 44px |
| inline styles | **0** | **0** |
| pictographs in labels | **none** | none |
| sheet grabber | **0x0** | 40x4 |
| dialog | 720x494, `scrollHeight 492 = clientHeight 492` | 390x544, 543 = 543 |
| sideways spill | 0px | 0px |

1024x768 and 768x1024 give the same answers as 1440 (720x486, 0px band, 34/44/44, no grabber). The dialog is 81px
shorter at laptop than it was, because the empty plate and the stacked controls are gone; it still needs no
scrollbar inside itself at any of the six widths. A sold-out product keeps the same row shape: the note and the
one control that is left on the line, no stepper, no buy button, 44px target.

## Checks

- `npx vitest run src/test/quick-view-modal.test.tsx` - 7 tests, all green: no inline style and no pictograph in
  the component source, every `<Icon name>` it uses is in the registry, the media rule no longer paints a
  background or a border, the fill rule exists, the row and footer rules are present, the grabber is hidden from
  641px up; then behaviourally, opening the dialog from the real card shows SKU, price, compare price and
  `In stock · 10` without a second API call, the stepper reaches 2 and the cart line is written with quantity 2,
  and the footer link hands over to the product page and closes the dialog.
- `E2E_BASE_URL=http://127.0.0.1:5824 npx playwright test quick-view-modal` - 5 tests, all green, light and dark
  at 1440 and 390 plus a 1024 sweep, measuring the table above out of the live DOM.
- The four CI gates (`tsc --noEmit`, `npm run i18n:check`, `vitest run`, `npm run build`) re-ran over the whole
  project after the last file was written.

## What I did not do, and what is still owed

I left the phone sheet's own numbers alone: the 160px media cap, the 140px picture inside it, the clamped
two-line description and the 15px title all come from `responsive.css`, which another session is still editing in
this working tree, and my change reads correctly with them. The white studio canvas is untouched.

The live-stack run is still owed by you: these checks stub `/api/*` in the browser, so they prove the dialog's
geometry, not that a signed-in customer's wishlist state round-trips through it. Also still open from earlier
rounds: `tools/build_deck.py`, `USER_MANUAL.md` and `TESTING.md` carry stale screen and product counts, and the
remaining pictograph labels (`OrdersPages` 6, `AdminPage` 4, `ProductsPage` 2, and one each in CampaignBanner,
CompareTray, StockAlertModal, CustomerCarePage and ProductDetailPage) are a job I have not started because you
have not asked for it.

# Round 23 — Account security spends its width: the decisions on the left, the live sign-in log on the right

Date: 2026-11-04. Brief: two screenshots of `#/account/security` on the deployed site at laptop width - one of
the top of the page, one scrolled to the sessions - with "see this is one sided part page where unnecessary
blank space make it handling properly two partioned live log status takes in the right side as you think that
will be better apply this".

## How I measured it

The same throwaway harness as the last rounds: the SPA booted against stubbed `/api/*` answers and the probe
asked the browser for rectangles rather than reading my own CSS back. This time I also gave it the account in
the screenshot - 65 live sessions - because the number of rows is what turns a list into a wall, and I measured
1440x900, 1440x1080, 1280x720, 1024x900 and 390x844 in both themes. The harness and the probe scripts are
deleted before the commit; `web/e2e/security-page.spec.ts` is the permanent version of the same questions.

## What the page resolved to before I touched it

| width | plate | column | blank band on the right | page height, 3 devices | page height, 65 devices |
| --- | --- | --- | --- | --- | --- |
| 1440 | 880 px | 1,376 px | **496 px** | 1,369 px | **5,891 px** |
| 390 | 366 px | 366 px | 0 px | 2,046 px | 8,879 px |

Two defects, and the second one only shows up on a real account. The 880px cap I put on the plate last round was
the right answer to the wrong question: it stopped a six-digit token box being set 1,270px from its label, but it
did that by pushing the whole page into the left two thirds of the column and leaving 496px of nothing beside
every row - which is the blank space in the screenshot. And the sign-in list was the full page: on the account
in the screenshot, 65 rows made the sessions block 4,934px tall, so the two decisions a customer actually came
to make sat under a wall of timestamps and the document ran to 5,891px.

I checked whether any other screen shares the first defect: `max-width` on a `.settings-plate` appears exactly
once in the whole stylesheet set, at the line quoted above, and it is scoped to `.security-page`. The admin
Settings plate and the saved-address plate both fill their column. So this is one page's problem, not a system
rule to propagate.

## What I changed

`SecurityPage.tsx` now renders a `.security-page__grid` with two plates in it instead of one: the decisions
(email verification, two-step sign-in) stay in `.security-work`, and the sign-in log moves into its own
`<aside className="table-surface settings-plate security-page__status">`, named by the "Active sessions" heading
through `aria-labelledby`. The "Sign out everywhere" row went with the list, because that is the row it acts on.
Nothing new was invented: every line in the right panel is a field `/api/me/security` already answers.

In `app.css` the cap is gone and the width is spent instead:

- `.security-page__grid` is one column by default and `minmax(0, 1fr) minmax(360px, 452px)` from 1080px up. That
  resolves to 900px + 452px at 1440 - the decisions keep almost exactly the measure the cap was protecting, and
  the leftover 496px becomes the log.
- The log scrolls inside its own panel: `.security-status__log` is `overflow-y: auto` with
  `overscroll-behavior: contain`, and `.security-page__status .settings-block` is the only child allowed to
  shrink, so the heading, the `65 live` count and the revoke row stay put around it.
- At 1080px and above the panel is `position: sticky` at `var(--sticky-top)` - written with `:root`, because
  modern.css loads after app.css and paints `.table-surface { position: relative }`, which outscored a plain
  class and left the panel un-stuck until I raised it.
- The log's height at laptop is `clamp(200px, calc(100dvh - 580px), 560px)`. The 580px is what this page costs
  outside the list itself, measured live: 263px above the grid plus 315px of panel chrome. Without it the panel
  ran to 978px in a 900px viewport and the revoke row sat half-cut at the fold, which is the other thing the
  screenshot showed.
- Inside a 452px panel the shared `.setting-row` control column (up to 280px) starved the revoke warning to
  104px and left the button half empty, so `.security-page__status .security-danger` gives the control
  `auto` width and the sentence the rest.

## The same probe, after

| width | decisions | live log | blank band | page height, 3 devices | page height, 65 devices | log at rest |
| --- | --- | --- | --- | --- | --- | --- |
| 1440x900 | 900 px | 452 px | **0 px** | 957 px | **1,039 px** | 320 px of 5,323 px, scrolls |
| 1440x1080 | 900 px | 452 px | 0 px | - | 1,219 px | 500 px, scrolls |
| 1280x720 | 756 px | 452 px | 0 px | - | 976 px | 200 px, scrolls |
| 1024x900 | 976 px | 976 px below | 0 px | - | 1,656 px | 460 px, scrolls |
| 390x844 | 366 px | 366 px below | 0 px | 2,046 px | 2,194 px | 460 px, scrolls |

The 65-device account went from 5,891px of scrolling to 1,039px, all 65 rows are still in the DOM (the browser
check counts them), and the panel - revoke row included - is fully on screen before any scrolling at 900, 1080
and 720 tall. The step rows still resolve three columns at laptop and two on a phone, nothing is painted with an
inline style, and no width spills sideways.

## Tests

- `web/src/test/security-page.test.tsx` - 10 tests, all pass. Two new ones read the split out of `app.css`: that
  no `.settings-plate` on this page carries a `max-width` any more, that the grid's second track is
  `minmax(360px, 452px)` inside the 1080px block, and that the log owns the scrolling (`overflow-y: auto`,
  `overscroll-behavior: contain`) while the panel's block is the only shrinking child. The CSS reader now matches
  a trimmed line, because a rule inside a media query is indented and the old reader could not see one at all.
  The DOM tests now ask the grid rather than the single plate, since the sessions live in the aside.
- `web/e2e/security-page.spec.ts` - 5 checks, all pass. It compares the two resolved rectangles: same top line
  (within 1px), the log's left edge past the decisions' right edge, and the column ending within 1px of the
  panel's right edge, which is the assertion that would have failed on the screenshot. A new check seeds 65
  devices and asks the DOM how tall the page and the log actually are, that the log's `scrollHeight` exceeds its
  `clientHeight`, that the panel bottom is inside the viewport at rest, and that its position resolves to
  `sticky`. The phone pass asserts the log drops *under* the decisions at the same left edge.
- The address-book spec still passes 4/4 against the same build, so the shared CSS edits did not disturb the
  saved-address plate.

## What this did not cover

- The log scrolls inside its panel rather than paginating or filtering. Sixty-five rows is the account in the
  screenshot; if that grows much further the honest next step is a server-side window, not a longer scrollbar.
- I did not touch the sticky behaviour below 1080px. At 1024 the left track would fall under ~640px and squeeze
  the step rows' control column, so the log drops below the decisions there - measured at 1,656px of page, which
  is the price of a single column at that width.
- The stub harness cannot show a real device list's machine names: `AccountSecurityEndpoints.cs` returns only
  the two timestamps per session, so that is all the rows carry. Nothing in the panel is invented.
- Still not run: the real-stack e2e passes that need the demo password (#54), and the walkthrough (#40).

## Gates

Run from `web` after the last file was written, in CI's order, in a detached worktree so the other session's
in-progress navbar edits in the shared tree could not be swept into my commit or my numbers:
`npx tsc --noEmit -p tsconfig.json` clean; `npm run i18n:check` - 2249 entries, all literal labels covered;
`npx vitest run` - 308 tests across 43 files green; `npm run build` - built in 27.14s.

The first full-suite pass had one red: a `checkout`-family test that waits on a deliberately delayed API
release timed out while the machine was running the whole suite at once (337s). Those three files pass on their
own (26/26) and the next full run was 308/308, so I am calling it a load flake in a wait, not a behaviour
change - but it is worth knowing that this test's margin is thin under parallel load.

Browser checks against the same build: `security-page` 5/5 and `address-book` 4/4.

## The two things on main that were not mine, and how the deploy finally went out

`npm run i18n:check` failed on `main` for reasons that have nothing to do with this round: commit `06a134d`
("Add live-home storefront pulse and modern commerce touches", 21:16 today, not written by me) added
`web/src/helix/ShowcaseFallback.tsx` with 20 display strings outside `t()`. My round adds no strings, so my five
files gate green against `ddbd32f`, which is how I measured them. That session fixed its own blocker in
`d21dd95`, and `i18n:check` passes on `main` now.

The next CI step then went red. Run 41862059828 on `d21dd95` failed at `npx vitest run` on
`src/test/helix-showcase.test.tsx` - 2 of its 8 tests, both "Found multiple elements with the role list" - which
is that same new fallback component drawing a second list on the showcase route. Nothing in this round touches
`helix-showcase.test.tsx`, `ShowcaseFallback.tsx` or the showcase route, and my own suite (308 tests across 43
files) was green in isolation. The Pages workflow only uploads an artifact when the suite passes, so a red test
in anyone's commit freezes the deployment for everyone: my code was on GitHub but the live site was still
serving `ddbd32f`.

I did not commit another session's unfinished component to get the pipeline green; that was their push to make,
and I said so here rather than quietly borrowing their work. They made it an hour later. `86a2f42` ("fix(storefront):
enhance viewer mode button contrast in dark mode and preserve single list role in showcase fallback") carries
the fallback fix, and run 41867822718 on that commit passed every gate in CI's own order - `tsc --noEmit`,
`i18n:check`, `vitest run`, `build` - ran the production-build browser checks, and deployed. `https://yarafat2001.github.io/
NineCube.Digital/version.json` now answers `86a2f4239a1bd94abf887788d372e38a07cdb394`, and `git grep security-page__grid
86a2f42` hits all four of this round's files plus the report, so the split layout is the one being served.

One honest limit on that: CI's browser step runs only `delivery-addresses.spec.ts` and `gift-cards-layout.spec.ts`
(`.github/workflows/pages.yml:53`). This round's `security-page.spec.ts` - the five checks that ask the live DOM
for the column widths, the 0px blank band, and the 65-device panel fitting on screen - passed 5/5 locally against
the same production build, but the workflow has never been told to run it, so GitHub has not confirmed those
numbers on its own machine.

# Round 22 — the address type is a field like the others, and Account security is one plate you can work through

Date: 2026-11-04. Brief: a dark-theme screenshot of `Add an address` on the deployed site with "here text box
on the top not in the proper position", plus the URL of `#/account/security` and "make more user friendly. Fix
these all properly".

## How I measured it

Same throwaway harness as the last four rounds: the app booted against stubbed `/api/*` answers, opened at
1440x900 and 390x844 in light and dark, and the probe asked the browser what it had resolved - the rectangle of
every caption and control in row 1 of the address editor, the grid columns each settings row actually got, the
width of every button on the security page, and the paint the badges blended to. The harness is deleted before
the commit; the two Playwright specs in `web/e2e` are the permanent version of the same questions.

One thing worth recording because it changed my reading of the numbers: the caption line lands on a quarter
pixel (`23.25px`), so rounding each edge of a rectangle on its own reported a "1px difference" between two
fields the browser had laid out identically. The spec now reads the caption-to-control gap unrounded and
compares that, which is what the eye is actually given.

## What the two screens resolved to before I touched them

`Add an address`, laptop 1440, dark, row 1:

| field | caption | control top | control height |
| --- | --- | --- | --- |
| Country / region | 23 px line, 4 px gap | 1084 px | 42 px |
| Address type | **none** | **1056 px** | 42 px |
| Label | 23 px line, 4 px gap | 1084 px | 43 px |

The owner's "text box on the top" was the Home / Work / Other track. It is a `.field` like its two neighbours,
but it had no caption element, so its control started 28 px higher than theirs - exactly where the caption
would have been. And it was `inline-flex` with three chips hugging the left edge: 71, 67 and 69 px of chips
inside a 434 px track, i.e. **219 px of empty well** on a laptop and 101 px on a phone. An empty rounded well
with three small pills at one end is what a text box looks like.

`#/account/security`, before:

- three `card-glass` cards, each painted with `style={{ padding: 'var(--space-4)' }}` - **3 inline styles**, the
  only hand-painting left anywhere on the customer routes;
- the page column stretches its children, so every button resolved to the full plate: **1342 px wide at 1440**,
  332 px at 390. A six-digit token box was set about twelve characters away from its own label;
- the two-step card was 502-544 px tall and held four controls with nothing saying which comes first, although
  the server really does need the password and then the emailed code in that order;
- a session was one `<li>` of 16 px text: `Nov 4, 2026, 12:12 PM — Nov 11, 2026, 12:12 PM`. The dash was the
  only thing distinguishing "signed in at" from "access runs out at", there was no relative time, no state, and
  no sign of which device was the current one.

## What I changed

- `AddressFields` now wraps the segmented control in the same caption element the app uses elsewhere
  (`.field__label-row`), and the group takes its accessible name from that visible caption through
  `aria-labelledby` instead of carrying a second, hidden `aria-label`. The track is a three-column grid, so the
  options divide the well instead of parking at one end.
- The option height is 34 px, not the 35 px I first wrote: `input`/`select` resolve to `min-height: 42px` in
  border-box, and the shared `.segmented` well adds 3 px of padding and 1 px of border on each side, so 34 px is
  what makes the three surfaces the same height to the pixel. The first run measured 43 against 42 and I called
  it a pass until the spec refused it.
- `SecurityPage` is rebuilt on the house settings system the admin Discount policy panel uses: one
  `.table-surface.settings-plate` capped at 880 px, three `.settings-block` sections divided by `--row-line`,
  each with a `.policy-card__head` (icon, name, state badge) and a plain-language lead.
- Both flows are numbered steps - a `.security-step` row is a settings row with the order in front of it - so
  the email is "ask, then paste", and two-step is "password, code, turn it on". The locked flow says why: while
  the email is unverified the two-step controls are disabled and a shield note reads "Verify your email above
  before changing this."
- A session is a row, not a sentence: `Signed in 7 hours ago` with a `Most recent` badge on the newest, and the
  two absolute times each carrying their own word (`Started`, `Runs out`) inside a `<time datetime>` so the
  machine-readable stamp survives the rewrite. An empty list answers "No device is signed in right now."
  The one irreversible action sits under a rule of its own, away from the list it acts on.
- 28 new Bengali entries. This exposed a blind spot in `scripts/check-translations.mjs`: a ternary *inside*
  `t(...)` is not checked, which is how `Enable two-step sign-in` and `Disable two-step sign-in` had never had
  keys. Both are in the catalogue now.

## The same probe, after

Address editor, row 1 (identical in light and dark):

| measurement | laptop 1440 | phone 390 |
| --- | --- | --- |
| caption over the track | `Address type`, 23 px | same |
| caption-to-control gap | 4 px, same as both neighbours | 4 px, same |
| control tops on the row | 873 / 873 / 873 px | one field per line, gap 4 px |
| track height vs select | 42 px vs 42 px | 42 px vs 42 px |
| option widths | 139 / 139 / 139 px in a 434 px track | 100 / 100 / 100 px in 316 px |
| empty well left | 1 px | 0 px |

Account security:

| measurement | before | after, laptop 1440 | after, phone 390 |
| --- | --- | --- | --- |
| inline styles on the screen | 3 | **0** | 0 |
| plate width | full column | 880 px | 366 px |
| widest button | 1342 px | 200 px | 195 px |
| step rows | 4 undifferentiated controls | 74-75 px, 3 grid columns | 124-143 px, 2 columns |
| state per block | none | `Verified` / `On` / `3 live` (or `Not verified` / `Off` / `0 live`) | same |
| a session row | one 16 px dash range | relative time + badge + two named timestamps | same, no sideways scroll |
| sideways spill | - | none | none |

## Tests

- `web/src/test/address-book-design.test.tsx` - the segmented-control test was rewritten. It was asserting the
  old markup string, and the other session in this tree had just edited the component to match it
  (`57c1bbf`); the caption is the fix, so the test now asserts the captioned markup, the `aria-labelledby`
  link, the three-column grid and the matched caption metrics. 7 tests.
- `web/src/test/security-page.test.tsx` (new, 9 tests): no inline styles and no colour emoji, every icon named
  exists in the registry, one plate with three blocks each carrying a head, a lead and a state badge, the
  880 px measure, the numbered steps written with enough specificity to beat the row they nest in, the phone
  collapse rules, then three that render the page and ask the DOM: a verified account's state and session rows,
  an unverified account's disabled two-step controls, a wrong token answered with the server's own words, and
  the whole two-step flow taken in order - after which the fixture shows `mfaEnabled` on and every session
  revoked, exactly as `AccountSecurityEndpoints.cs` does it.
- `web/e2e/security-page.spec.ts` (new, 4 checks) and `web/e2e/address-book.spec.ts` (extended): the same
  questions in Chromium at 1440 and 390 in both themes. **4 of 4 and 4 of 4 pass.**
- `web/src/test/handlers.ts` grew a `/api/me/security` fixture with the four POST endpoints behind it, mirroring
  the real contract: a challenge is issued for one use, and turning two-step on or off revokes every refresh
  token. Session times are derived from the clock at call time and expire fourteen days after sign-in, the way
  `AuthService.cs` issues them, so the list can never show a session the real query would have filtered out.

## What this did not cover

- The Label input resolves 42.8 px against the select's 42 px. That is the native input's own line box, it
  predates this round, and it is not what the screenshot was about; the segmented track matches the select
  exactly.
- Guest checkout uses the same `AddressFields` with `checkout` set, and that variant does not render the address
  type at all, so it is untouched.
- The five other `.segmented` surfaces in the app already carry a caption; only this one was missing it. I
  checked that by grepping every use rather than by eye.
- Verification ran against the stubbed harness, which is what lets me test an unverified email, a three-device
  account and a wrong token without a password. The live stack still needs `NINECUBE_SEED_PASSWORD` for the
  real e2e passes (task #54) and the walkthrough (task #40).
- The admin routes came back blank in my audit harness because the stub returns `[]` for every admin endpoint,
  so the segmented-control sweep there was done by reading the markup, not the painted page.

## Gates

Run from `web` after the last file was written, in CI's order: `npx tsc --noEmit -p tsconfig.json` clean;
`npm run i18n:check` - 2249 entries, all literal labels covered; `npx vitest run` - 307 tests across 43 files,
all green (the suite was 298 across 42 before this round); `npm run build` - built in 23 s. The two browser
specs are not part of CI's four commands and were run by hand against a dev server, as documented above.

# Round 21 — the saved address book is a list again, and the form only appears when you ask for it

Date: 2026-11-04. Brief: the deployed URL of `#/account/profile` with "Saved delivery addresses in this pages
this form part not user-friendly it comes very big-scrolling pages give it more improved design alignment to
the system using hover and other operations that will be the best in your analysing and decisionary result",
and three dark-theme screenshots of the plate.

## How I measured it

Same method as the last two rounds: the app booted against stubbed API responses in a throwaway harness
(deleted before this commit), opened at 1440x900 and 390x844 in light and dark, with two saved addresses in
the book, and the probe asked the browser what it had actually resolved - geometry, computed paint blended
over whatever is really behind it, and the state after a pointer move and after a keyboard focus.

Two measurement corrections came out of this round and both are worth keeping, because each one made me
believe something false for a while.

The first is about hover. My earlier probe read `getComputedStyle` immediately after moving the pointer, and
in headless Chromium that catches the 150 ms transition mid-flight: the tile reported its resting border with
a transform of `matrix(1, 0, 0, 1, 0, 0)`, which looked like "hover does nothing on a laptop". It does
something. With the transition switched off for the reading, all four combinations resolved identically. A
test that polls until the state settles is now what the suite uses.

The second is about the cascade. `AddressBook.css` is bundled *before* `app.css` and `modern.css`, so a rule
of mine that merely tied with a global one lost. `modern.css:273` paints every shared surface from
`:root :is(.card, .card-glass, .category-filter-panel, .address-card, ...)`, and `:is()` takes the
specificity of its most specific argument, so that selector computes to (0,3,0). My tile rule had to grow a
fourth term - `:root .delivery-address-book .address-list .address-card`, (0,4,0) - before the well material
landed at all. My first "after" run showed the new look in one scenario out of four for exactly this reason.

## What the page resolved to before I touched it

| measurement | laptop 1440 | phone 390 |
| --- | --- | --- |
| whole page height | 2630 px | 3878 px |
| the address plate alone | 1453 px | 1983 px |
| the editor, always open | 812 px | 1325 px |
| controls per row x column | 13 in 7 rows x 4 cols | 13 in 13 rows x 1 col |
| resolved field width | 211 px | 316 px |
| plate after pressing Edit | 2837 px | 4085 px |

So the plate the owner came to read was 55% of a laptop page and 51% of a phone page, and the reason was not
the addresses - the list itself was only 445 px. Thirteen controls that nobody had asked for were parked
underneath it, permanently, and pressing Edit grew the form to 1019 px because the address preview block
added another 207 px below the grid.

Depth and feedback were the other half of the complaint:

- A saved address resolved to `border rgb(119, 133, 154)` over `background rgb(239, 243, 249)`, on a plate at
  luminance 0.876. Blended, the tile and the plate came out **0 steps apart** - the list read as one grey
  block with text on it. Dark mode: `rgb(87, 91, 109)` on a plate at 0.06, also 0 steps.
- **Hover changed nothing at all.** Border, transform, shadow and the quiet action button were byte-identical
  rest to over, in both themes and both widths.
- Home / Work / Other were three `filter-chip` pills at a 20 px radius, 34 px tall - the same markup the app
  uses for active catalogue filters, standing in for a choice between three named options.
- The address preview block had a hard-coded `.75rem` radius (12 px, matching nothing else on the page) and a
  background identical to the plate: 0 steps again.
- Nothing was hand-painted: 0 inline styles, 0 emoji. This was a layout, depth and feedback defect, not an
  inline-style one.

## What I changed

**Writing an address is a task, so the editor is now a task.** The plate opens as a list with one action in
its head - `+ Add an address`, the house plus icon, on the amber button. The form is not in the DOM until
that is pressed; Edit puts it in place with the address loaded and the tile's own name as its accessible
label; Save, Update and Cancel all close it again. An empty book is the exception and opens straight up,
because adding a first address is the only reason to be looking at an empty book.

**A saved address is now a well cut into the plate**, from the same tokens the rest of the app uses:
`--well-fill` for the fill, `--edge-well` for the edge, `--well-shadow`, `--radius-md`. The default address
keeps the accent edge `app.css:2573` already gives it - my first version painted over that signal and the
browser check caught it.

**The tile answers the pointer.** Hovering (or tabbing into) a saved address brings its accent edge, lifts it
2 px and adds `--card-shadow-hover`; its quiet operations, which sit at `transparent` at rest, come forward as
raised surfaces at `--surface-raised` / `--border-strong`. On a touchscreen, where there is no hover to earn,
they start raised. The lift is the only part that moves, and `prefers-reduced-motion` takes even that away.

**Set as default moved onto the tile**, in the one action row with Edit and Delete, instead of sitting alone
on its own centred line under the address.

**Home / Work / Other went through the app's segmented control** - the same `segmented` /
`segmented__option--active` / `aria-pressed` component the gift cards page and the coupon builder use - which
also brought the control up to the height of the fields around it.

**Fields on one side, live preview on the other.** Above 1024 px the preview is a 300 px rail beside the grid
rather than a block under it, so showing a person what they have typed no longer costs 207 px of scrolling.
The grid itself is set by the book now - three columns at a laptop, two on a phone - because `app.css` was
resolving it to four columns of 211 px, and only the lines that genuinely carry a whole street address span.
The checkout sheet keeps the shared layout untouched; the rules are scoped inside `.delivery-address-book`.

## The same probe, after

| measurement | before | after laptop 1440 | before | after phone 390 |
| --- | --- | --- | --- | --- |
| whole page height, at rest | 2630 px | **1724 px** | 3878 px | **2535 px** |
| the address plate, at rest | 1453 px | **547 px** | 1983 px | **640 px** |
| editor in the DOM at rest | yes, 812 px | **no** | yes, 1325 px | **no** |
| whole page with the editor open | 2837 px | 2514 px | 4085 px | 3719 px |
| editor height while editing | 1019 px | **767 px** | 1533 px | **1204 px** |
| controls per row x column | 7 x 4 | 7 rows x **3 cols** | 13 x 1 | 10 rows x **2 cols** |
| resolved field width | 211 px | **328 px** | 316 px | **152 px** |
| tile fill vs plate | 0 steps | **--well-fill / --edge-well, both resolved** | 0 steps | same |
| hover | no change anywhere | **accent edge, -2 px, operations raised - 4 of 4** | (touch) | **operations raised without hover** |
| preview block | 12 px radius, 0 steps | **14 px (--radius-md), 8 steps light / 14 dark** | same | beside the fields at >= 1024 only |
| horizontal overflow | - | **0 px at every width and theme, in both states** | - | 0 px |

Text on a tile resolves to 15.19:1 in light and 16.9:1 in dark. The selected segment reads 6.1:1 in light and
9.14:1 in dark, at the house pill radius (999 px). Still 0 inline styles and 0 emoji in the plate.

The phone editor is worth one honest note: two columns of 152 px is deliberate. It is what turned thirteen
single-field rows into ten rows, which is the whole complaint. The fields that carry a street address -
Address line, Apartment, Landmark, Instructions - still span the full width, and nothing spills sideways.

## Tests

- `web/src/test/address-book-design.test.tsx` (new, 7 tests): the tile rule and its hover partner read out of
  `AddressBook.css` as whole blocks, so the assertions cannot be satisfied by a rule that would lose the
  cascade; the well tokens, the default tile's accent edge, the `@media (hover: none)` and
  `prefers-reduced-motion` branches, the 2/3-column cadence and the preview rail, no `.75rem` left in the
  file, the segmented markup, and three that render the book and ask the DOM what it produced - no form at
  rest, the form after `Add an address`, the form gone again after Cancel, an empty book open from the start,
  and all three operations on the tile itself.
- `web/e2e/address-book.spec.ts` (new, 4 checks): the same questions in a real browser at 1440 and 390 in both
  themes, comparing resolved paint against the design tokens resolved to `rgb()` in the page, so a rule that
  is written but loses the cascade fails. It needs no password - the API is stubbed - and it runs against
  `npm run dev`. Hover and keyboard focus are polled until they settle, for the reason above. **4 of 4 pass.**
- Three existing profile tests typed into the editor without opening it, which the collapsed form correctly
  broke: `account.test.tsx` (create-and-remove, and the incomplete-address guard) and `modern-customer.test.tsx`
  (the dependent-location test) now press `Add an address` first. That is the whole fix for them - the
  behaviour they assert is unchanged.

## What this did not cover

- **This round was reverted by the other session working in this tree, and I have put it back.** The first
  version landed, then commit `3eb6fbf` ("restore full inline address form to ensure account profile tests
  pass") rolled the component, its CSS and the icon back, because those three profile tests were failing.
  That is why my earlier "after" numbers came back looking like the old page - the files really had gone. I
  agree with the diagnosis and not the treatment: the tests were the defect, not the design, so this commit
  restores the rebuild and updates the three tests instead of the screen. If the other session still has that
  screen open, the same collision can happen again.
- The two failures reported as foreign last round are both gone from the suite. One of them
  (`modern-customer.test.tsx`) was in fact this round's own test collision, and I have fixed it here rather
  than left it; the other (`auth-ui.test.tsx`) passes now and I did not touch its file.
- Guest checkout's address sheet is the same `AddressFields` component with `checkout` set, and I left its
  layout alone on purpose: it is a short sheet inside a dialog, not a plate on a long page.
- The tiles stay full-width rows because `app.css:2558` makes `.address-list` a column everywhere in the app.
  Changing that shape is a system decision, not one for this plate.
- Still not run: the real-stack e2e passes that need the demo password, and the walkthrough (task #40).

## Gates

Run from `web` after the last file was written, in CI's order: `npx tsc --noEmit -p tsconfig.json` clean;
`npm run i18n:check` - 2183 entries, all literal labels covered; `npx vitest run` - 298 tests across 42 files,
all passing; `npm run build` succeeded. The two Playwright specs above ran against a dev server on the
stubbed API and passed 5 of 5.

# Round 20 — the gift cards page is one plate now, and there is only one certificate

Date: 2026-11-03. Brief: the deployed URL of `#/gift-cards` with "fix this Gifts Cards ages and make more
dynamic and modern", and a light-theme screenshot of the screen: a `🎁 NineCube Digital Gift Cards` title,
two loose pills under it (`🔍 Check Card Balance`, `✨ Send a Digital Card`), one glass card holding a
monospace field and a `Check Balance` button, and a `💡 Frequently Asked Questions About Gift Cards` block
whose three answers sat in three columns.

## How I measured it

The same way as last round, in a real browser: the app booted against its own MSW fixtures through a
throwaway harness (deleted before this commit), probed at 1440x900 and 390x844 in light and dark, on each of
the three states the screen has - the balance tab, the composer, and a card that has just verified. Twelve
scenarios, all four combinations plus the two extra states.

One correction is worth writing down, because it changed what I believed for most of the round. My first
probe blended a colour only over the `background-color` of the ancestors above it. The plate paints its glass
as a `background-image` gradient with a transparent `background-color`, so the probe walked straight past it
and reported the certificate sitting on plain white in light theme, and the demo well "0 steps from the
plate". Neither was true. The probe now composites every stop of every gradient from `<html>` down, and the
numbers below are from that version. The screenshots in `web/artifacts/` are the ones I checked it against.

## What the page resolved to before I touched it

- **It was hand-built.** 75 `style={{ ... }}` blocks in `GiftCardsPage.tsx` alone, carrying 31 hard-coded
  hex and `rgba()` colour literals. Rendered, that was **26 elements carrying a `style` attribute** on the
  balance tab, **40** on the composer, and **47** once a card had verified.
- **Its whole icon set was colour emoji**: 13 of them in the source - 11 on the balance tab, 17 with a
  verified card, 5 on the composer - and **0 `<svg>` elements**, because the file did not import `Icon` at
  all. Same defect the cart sheet had last round.
- **Two of its tokens do not exist anywhere**: `--surface-muted` and `--text-md`. Anything written against
  them fell back to inherited type or no fill at all, which is why parts of the page looked unstyled rather
  than styled differently.
- **The certificate existed four times**: the customer's verified card and live preview in
  `GiftCardsPage.tsx`, and the staff builder's preview plus the registry detail dialog in `AdminPage.tsx` -
  four copies of the same object with different inline colours, so the card an operator issues was not the
  card a customer receives.
- **Its CSS belonged to no system.** Raw `rgba()` gradient, `1px solid rgba(255,215,0,.3)`, a
  `box-shadow: 0 16px 40px -8px rgba(0,0,0,.6), 0 0 24px rgba(255,215,0,.15)`, a hover that lifted the card
  `translateY(-2px)` and grew the shadow to `0 20px 48px -8px rgba(0,0,0,.7), 0 0 32px rgba(255,215,0,.25)`,
  and a `::before` radial gold glow over the top of it. Its radius resolved to **22 px inside a 22 px plate** -
  the same corner as the shell holding it, which is what made the page read as a card inside a card.
- **Two pills, not a switcher**: a `role="tablist"` div with no `aria-selected`, no `aria-pressed` and no
  shared control behind it, above **three stacked `card-glass` sections**.
- **Two input heights on one page**: the code field resolved to **47 px** while every field on the composer
  was **43 px**.
- The denomination picker was `segmented` - an `inline-flex` pill with `flex-wrap: wrap` and a `999px`
  radius - holding four `BDT x,xxx` labels, which is how the same control ended up wrapping labels onto a
  second row inside a rounded shell whenever the column got narrow.

## What I changed

`web/src/components/GiftCardCertificate.tsx` (new): the certificate as one component with a prop for each
slot - amount, code, copy or scope tag, the two footer pairs, the message. Four call sites, one markup.

`web/src/pages/GiftCardsPage.tsx`: rebuilt on the vocabulary the rest of the shop already uses. One
`table-surface` plate holding `gift-block` sections divided by `--row-line` instead of three glass cards; the
pills are the shared `.segmented` control with `aria-pressed`; the picker is a `.gift-amounts` tile grid; the
FAQ is a `<dl>` of full-width question-over-answer rows; every `style={{}}` and every emoji is gone, replaced
by `<Icon>` calls (one new glyph, `bulb`, for the FAQ heading). No label text changed.

`web/src/pages/AdminPage.tsx`: the 64 lines of hand-styled certificate markup in the registry detail dialog
became the same component, so the operator now sees the card the customer gets.

`web/src/styles/tokens.css`: a `--cert-*` block - base, gradient, three ink steps, gold, edge, well, rule,
chip and two shadows - because the certificate is the one surface in the shop that is deliberately dark in
both themes, and that needs its own tokens rather than hexes in four places.

`web/src/styles/app.css`: `.gift-card-cert` and its slots read only those tokens; radius `--radius-md`, one
shadow, no glow, no hover lift. `.gift-code` on `--text-base` so it takes the same line box as the form
fields, `.gift-amounts` as a four-column grid.

`web/src/styles/modern.css`: a `.btn--on-cert` tier (transparent face, `--cert-rule` edge, `--cert-ink` text)
and its exclusion from the default button selector, which out-specifies it otherwise.

`web/src/styles/responsive.css`: below 640 px the composer form and its preview stack, the picker goes 2-up,
the FAQ rows stack, and the Check button takes the line.

## The same probe, after

| what the browser resolved | before | after |
| --- | --- | --- |
| elements carrying a `style` attribute (balance / verified / composer) | 26 / 47 / 40 | **0 / 0 / 0** |
| colour emoji, `<svg>` on the page | 11-17 emoji, 0 svg | **0 emoji, 9 svg on the balance tab, 7 on the composer** |
| input heights | 47 px against 43 px | **43 px for every field, all four scenarios; the note box 92 px (three rows)** |
| certificate radius | 22 px inside a 22 px plate | **14 px inside a 22 px plate** |
| certificate shadow | `0 20px 48px -8px rgba(0,0,0,.7)` + `0 0 32px` gold glow + 2 px lift | **`rgba(24,19,46,.55) 0 10px 22px -14px` light, `rgba(0,0,0,.72) 0 14px 26px -16px` dark, no glow, no lift** |
| certificate ground | painted from four inline gradients | **resolves `rgb(35,29,59)` - luminance 0.016 - against a plate at 0.862 in light and 0.082 in dark** |
| gold amount | inherited, hand-coloured | **30.7 px at 1440 (24 px on a phone), 12.51:1** |
| code / brand line / footer / message | - | **18.2:1, 16.03:1, 16.03:1, 10.21:1** |
| the control inside the card | default raised button on the dark face | **copy pill: flat (`box-shadow: none`), 18.2:1 text, `999px` edge; the preview's "Storewide" tag 5.59:1** |
| rejected code | hand-painted box | **`.inline-banner`, 8.2:1 light / 8:1 dark, no certificate left on the page, zero inline styles** |
| switcher | `role="tablist"`, no state | **`999px` shared pill, `aria-pressed` true/false, active text 6.1:1 light / 9.14:1 dark, idle 17.85 / 14.51, both options 40 px** |
| denomination picker | `999px` pill, labels wrapped | **`grid`, `14px`, 4 columns in one row at 1440, 2 columns in two rows at 390** |
| quick-test well | no rule | **`14px`, fill 5 steps below the plate in light (edge 1.65:1), 19 steps in dark (1.59:1)** |
| FAQ rows | three columns | **1 px `--row-line` between rows, question 15.5:1 light / 7.14:1 dark, answer 6.58 / 5.35, one column on a phone** |
| page height at 1440, balance / composer | 1056 px / 1373 px | **1167 px / 1513 px** - the FAQ went from three squeezed columns to full-width rows, which is taller by design and reads as one list |
| horizontal overflow | - | **0 px at every width and theme, in all three states** |

## What "dynamic" means here, in numbers

The composer preview is the same component the shop hands over, and it is driven by what a person types. In
the browser I typed 3,750 / "Ayesha Rahman" / "Happy Eid!" and the certificate resolved
`BDT 3,750 · Ayesha Rahman · "Happy Eid!"` with the message at 10.21:1; tapping the 2,500 tile moved
`aria-pressed` from the first tile to the third and re-rendered the amount to `BDT 2,500`. That exchange is
now asserted in both suites rather than eyeballed.

## Tests

- `web/src/test/gift-cards-page.test.tsx` (new, 11 tests): no `style={{` left in the page and no hand-styled
  certificate class in the admin page, no colour emoji with every `<Icon name>` checked against the registry,
  the component used at all four call sites, the certificate painted only from `--cert-*` (no hex, no
  `rgba()`, no 48 px shadow), the `.btn--on-cert` tier and the `:not()` exclusion that lets it win, one plate
  with `--row-line` dividers and a `--well-fill` demo strip, the segmented switcher with `aria-pressed` and no
  `role="tablist"`, the code field's type size, the picker grid and its 640 px collapse, plus two tests that
  render the screen and ask the DOM what the switcher, the verified card and the preview actually resolved to.
- `web/e2e/gift-cards-page.spec.ts` (new, 9 tests): the probe and thresholds above, run in a real browser at
  1440 and 390 in both themes. It needs no password - the balance check and the composer are both open to a
  visitor - so it runs against `npm run dev` as written. **9 of 9 pass on the fix**, and I proved the
  thresholds bite by watching them fail on the two things I got wrong first (the picker's row count on a
  phone, and the copy control that only exists on a verified card, not on a preview).
- `web/src/test/actionable-surfaces.test.ts` needed the same update as last round: it reads the default
  button rule out of `modern.css` by its exact selector string, and my `:not(.btn--on-cert)` changed that
  string under it. The rule it pins is still the same rule, so its lookup now names the certificate
  exclusion too, and I added the assertion that a button on the certificate really does opt out.

## What this did not cover

- **Two suite failures are in the tree and they are not mine.** `modern-customer.test.tsx` cannot find the
  Upazila combobox, and `auth-ui.test.tsx` finds two localStorage keys where it allows one (the cart now
  writes its own). Both belong to the international address book and saved-cart work that landed while this
  round was in progress. I did not touch their files; the other 288 tests pass.
- **This round's files were committed by the other session before I finished writing about them.** They are
  in `46369ca`, whose message is about wishlist toasts, along with their own address-book and guest-recovery
  work - so that commit shipped my page, component, styles, contract test and browser spec without this
  report or my gate run on top of it. This report, the gate record below, and the last corrections to the
  two specs are the commit that follows it.
- The verified-card branch of the browser spec depends on data: it asks for `GC-WELCOME-1000`, which
  `DatabaseSeeder` creates, and asserts the certificate only on the run where the card resolves. On the
  fixtures it resolved, and that is the branch whose numbers are above. If the demo card has been spent on
  your stack, that one block reports itself as skipped by simply not being asserted - the composer test
  covers the same component unconditionally.
- The `Quick Test / Demo Cards` strip is `import.meta.env.DEV`-only, so it is absent from the deployed Pages
  build. Its well is measured when present and the spec says nothing when it is not.
- Colour emoji are still standing in for icons in the files round 19 listed, less this one: `OrdersPages`,
  `AdminPage` (still 12 of them in source), `ProductsPage`, and one each in `CampaignBanner`, `CompareTray`,
  `QuickViewModal`, `StockAlertModal`, `CustomerCarePage`, `ProductDetailPage`.
- The `.NET API` workflow is still red on `main` for the reason already reported: the test harness boots SQL
  Server while the app requires Postgres.

## Gates

`npx tsc --noEmit -p tsconfig.json` clean (it type-checks `e2e/`, so the new spec is covered),
`npm run i18n:check` (2101 entries; the count rose because the address-book work added labels),
`npx vitest run` (290 tests in 41 files - 288 pass, the two named above fail) and `npm run build`
(20.28 s), in that order, after the last source edit. I did not run them in the usual detached worktree this
time: the other session's commit already carries every source file of this round, so HEAD *is* the tree the
gates need, and working in the copy would have measured the same bytes. The only file changed after them is
this report, which none of the four commands reads.

# Round 19 — the cart sheet is one plate now: real rows, real icons, a rail you can see

Date: 2026-11-03. Brief: "Your cart- fix this design not looks good, I need to fix this properly", with a
screenshot of the "Your cart" sheet holding one item: a `🚚 Add BDT 2,492.01 more for FREE
Delivery! / 0%` well with nothing visible under the copy, a `✨ Frequently added together` list where every
recommendation was a stack of plain text with a solid `+ Add` pill underneath its price, and the sticky
Total / Place order dock.

## How I measured it

The sheet needs a basket to show anything at all, and its coupon and gift-card sections only appear for a
signed-in customer, so I ran the app against the MSW stub API
in a throwaway harness (deleted before this commit) with a hand-seeded cart and an `/api/auth/me` override
for the signed-in state. Then I ran the *same* probe against HEAD in a detached worktree, so every pair below
is the same measurement on the same fixtures: 1440x900 and 390x844, light and dark, with the cart both below
and above the 2,500 taka free-delivery line, plus the same four combinations as a guest.

## What the sheet actually resolved to before I touched it

- **The recommendation block had no stylesheet at all.** Its eight classes - `cart-upsell`, `__title`,
  `__items`, `__item`, `__info`, `__name`, `__price`, `__btn` - are written in `CartPanel.tsx` and appear
  nowhere in `app.css`, `modern.css`, `components/Navbar.css` or `responsive.css`. The browser therefore
  laid the block out as default block boxes: title **16 px, weight 400, `text-transform: none`**, name
  **16 px**, price **16 px**, no dividers, and the `+ Add` button starting a **new line under each price**.
  Rows measured **82 px at 1440** and **94 px on a phone**; the block took **270 px** of the sheet where the
  styled one takes **218 px**.
- **The rail under the delivery message was the same colour as the tray holding it.** `.cart-ship__track`
  was `background: var(--surface-sunken)`, and `--well-fill` - the tray's own fill - is defined in the dark
  theme as `var(--surface-sunken)`. Measured as luminance steps from its own well: **15 steps in light,
  0 in dark**. That is why the `0%` state in the screenshot shows a message and no progress bar - there was
  literally nothing to see.
- **The wells did not share a corner.** `border-radius` resolved to `14px` on the line tray, **`8px`** on the
  delivery well and **`0px`** on the recommendations, next to `14px` on the checkout plate. Three different
  objects pretending to be one.
- **Every icon in the sheet was a colour emoji.** 🗑️ on Remove, 🚚/🎉 on the delivery row, ✨ on the
  recommendations, 🏷️ on coupons, 🎁 on the gift card, 💵/💳/📱 on the three payment methods, ⚡ on the
  auto-discount. The sheet held **0 `<svg>` elements** and **7 colour emoji in its own labels** - 9 once an
  auto-applied promotion is on screen, and one of those nine is the campaign's own title, which comes from the
  API. They belong to no theme, they are drawn differently on every OS, and as inline boxes they
  sit on the text baseline - a step below the copy they are supposed to mark.
- **`+ Add` was `btn--outline`, a class this project has never defined.** Twelve elements in `src/` carry it
  and not one rule matched it, so the button fell through to the default tier
  (`:root .btn:not(.btn--primary):not(.btn--danger):not(.btn--ghost)` in `modern.css`) and got the raised
  solid face: `rgb(255,255,255)` in light, `rgb(35,32,34)` in dark, plus the inset highlight and the drop
  shadow. In the screenshot that is the reason the small "add this" pill looked like the primary action - and
  it is also why the nine admin buttons that carry it - six Cancels, one Close, one Refuse and the policy
  "Discard changes" - have always looked like the action they exist to step back from.
- **Guest checkout was a native `<fieldset>`.** For a visitor the seven order-detail fields sat in a groove
  border with **`0px` radius**, a legend at inherited **16 px**, and **one column** - **761 px of form** - inside
  the checkout plate. That made the plate look like a box inside a box, and because the total dock is sticky,
  the bottom half of the form kept sliding under it.

## What I changed

`web/src/styles/app.css`: wrote the `.cart-upsell*` rules on the house well tokens (`--edge-well`,
`--radius-md`, `--well-fill`, `--well-shadow`) with each recommendation as a `minmax(0, 1fr) auto` grid row -
name and price in the first column, the Add control on the trailing edge, `--row-line` between rows - and the
title/price on the label step of the type scale. `.cart-ship` took the same radius as the other wells; its
track now uses `--border-strong`, the one border token that resolves opaque in both themes. The guest
`fieldset` became a well with a two-up grid, and its legend a label. Added the flex rules that centre a line
icon inside a label, and sized `.cart-panel svg` to the type it sits on.

`web/src/styles/modern.css`: defined `.btn--outline` where the other button tiers live - transparent face, no
shadow, `--opt-edge` hairline - and excluded it from the default-paint selector so the tier actually applies.

`web/src/styles/responsive.css`: below 640 px the guest grid goes back to one field per line, since the sheet
*is* the viewport there.

`web/src/components/CartPanel.tsx`, `web/src/components/Icon.tsx`: the ten emoji-as-icons became `<Icon />`
calls from the house set (one new glyph, `card`), the guest inputs now use the sheet's own `cart-input` class,
and no label text changed. Cart upsell rows still carry no thumbnails - those were taken out on purpose in
`cc5a198` and stay out.

## The same probe, after

| what the browser resolved | before | after |
| --- | --- | --- |
| delivery rail, steps from its own tray (light / dark) | 15 / 0 | **156 / 51** |
| recommendation rows at 1440 | 82, 82, 82 px, button on its own line | **55, 60, 54 px, button beside the price** |
| recommendation rows at 390 | 94, 94, 94 px, stacked | **79, 84, 78 px, one row each (a long name wraps inside its column)** |
| recommendations block height at 1440 | 270 px | **218 px** |
| block title | 16 px / 400 / none | **13 px / 750 / uppercase** |
| name, price | 16 px, 16 px, no dividers | **15 px, 13 px tabular-nums, 1 px `--row-line` between rows** |
| well radii (lines / delivery / recommendations / checkout) | 14 / 8 / 0 / 14 px | **14 / 14 / 14 / 14 px** |
| `<svg>` in the sheet, colour emoji in its own labels | 0, 7 | **8, 0** |
| `+ Add` paint | solid raised face, `rgb(255,255,255)` light / `rgb(35,32,34)` dark | **transparent, 1 px `--opt-edge`, `box-shadow: none`** |
| guest form at 1440 | 1 column, 761 px, radius 0 px, legend 16 px | **2 columns, 373 px, radius 14 px, legend 13 px** |
| guest form at 390 | 1 column, 761 px | **1 column, 628 px** |

The outline tier reaches past the cart, as it should - those twelve elements were already declaring it, and I
measured it on both sides of the app. On the customer orders page the `Buy again` row action, and on the admin
Settings tab the `Discard changes` button, both went from a raised solid face (1.16-1.17:1 against the surface
behind them - a plate the same weight as the primary beside it) to a hairline outline: flat face, edge
measuring **3.19:1** against its own surface in light and **4.54:1** in dark, text at **15.2:1** and **16.9:1**,
at 1440 and at 390. The other eight admin buttons carry the same class against the same single rule, so they
take the same paint; I measured one per area rather than all nine, because a dialog only exists once somebody
clicks a row.

## Tests

- `web/src/test/option-and-cart.test.ts` grew six contract tests (the file now runs 18): the upsell well and
  row grid, `.btn--outline` defined *and* excluded from the default paint, one radius across the four wells,
  the rail's contrast against the resolved `--well-fill` in both themes (read out of `tokens.css`, so it fails
  if someone re-tunes the token), zero colour emoji in `CartPanel.tsx` with every `<Icon name>` resolving to a
  real glyph, the icon-centring rules, and the guest well with its 640 px collapse. All 18 pass.
- `web/e2e/cart-sheet.spec.ts` grew two tests (the spec now runs 4) that ask the live DOM the same questions
  through a probe which blends every colour over what is actually painted behind it. I ran that probe and those
  exact thresholds against the stub build first: **12 of 12 scenarios pass on the fix, 12 of 12 fail at HEAD**,
  each for the reason named in the bullet list above.
- Running the whole suite, not just my own file, turned up two more. `actionable-surfaces.test.ts` reads the
  default button rule out of `modern.css` by its exact selector, and my `:not(.btn--outline)` had changed that
  string under it - the rule it pins is still the same rule, so its lookup now names the outline exclusion too.
  The second was already red at HEAD before I touched anything: the image-fallback pass put a `ProductThumbnail`
  into the gallery strip, and `mobile-interactions.test.tsx` found **two** images named "Original front view" -
  the stage picture and the thumb, inside a button that was already called "Show Original front view". A picture
  that sits inside a control with its own name should not repeat that name, so the thumb now renders with an
  empty `alt` (`ProductThumbnail` already defaults to `''`); the stage keeps the description. Suite after both:
  276 tests in 39 files, all passing.

## What this did not cover

- **The live run is still yours.** `npm run e2e cart-sheet` needs `NINECUBE_SEED_PASSWORD`, which stays in your
  environment; I cannot sign in to the stack. The thresholds it applies are the ones I just proved in a browser
  against the stub API.
- Colour emoji are still standing in for icons in ten other files (`GiftCardsPage` 9, `OrdersPages` 6,
  `AdminPage` 4, `ProductsPage` 2, and one each in `CampaignBanner`, `CompareTray`, `QuickViewModal`,
  `StockAlertModal`, `CustomerCarePage`, `ProductDetailPage`). The orders-page check in this round saw it first
  hand: that row action still reads `🔄 Buy again`. Converting them is the same mechanical change as this
  round's and should be its own pass, screen by screen, so each one gets looked at. Say the word and I will
  take them in order.
- What the shop typed can still carry a pictograph: the seeded auto-promo titles read
  `⚡ Auto-Promo: 10% OFF on BDT 2,000+ orders`, and product names come from the catalogue. That is data, not
  chrome, so the browser check counts pictographs only in the labels this code writes and skips the nodes that
  carry product names, coupon titles and notes.
- Two cosmetic things I left alone because they are not defects: the long uppercase "Delivery instructions /
  order notes (optional)" label wraps to two lines on a phone, and the sticky dock overlaps content mid-scroll
  by design - the sheet's own scroll now ends 442 px sooner at 1440, so the overlap is far less likely.

## Gates

`npx tsc --noEmit -p tsconfig.json` clean, `npm run i18n:check` (1986 entries), `npx vitest run` (276 tests in
39 files) and `npm run build`, each re-run in a detached worktree at HEAD with only this round's nine source
files plus this report copied in, after the last edit.

# Round 18 — the Settings tab is one plate now, and the search well has one clear button

Date: 2026-11-03. Brief: "fix these ADmin settings Discount policy and give it as the modern e-commerce
style design, and also add system current state UI relevancy, Global search bar issues are double clear
options fix these all more efficiently", with three dark screenshots: the Discount policy panel, the Low
stock threshold card, and the Ctrl+K spotlight open on "co" with two ✕ inside one field.

## What the Settings tab actually measured before I touched it

Read off a running build of the real app at 1440 px, dark theme:

- The tab was **two `card-glass` forms of different widths** floating in a 1376 px content column: the
  threshold card 480 × 233, the policy card 760 × 853. So 896 px of column sat empty beside the first
  card and 616 px beside the second, and both were translucent (`background: rgba(0, 0, 0, 0)`), which
  is the treatment the registries stopped using two rounds ago.
- The policy fields were on `repeat(auto-fit, minmax(210px, 1fr))`, which resolved to **three tracks of
  228.66 px** for **four** limits. Three fields filled the first line at x = 57, 298, 538; the fourth
  ("Promo budget for a rolling month") dropped to its own line at x = 57 with **482 px of empty track
  beside it**. The second group was worse in a different way: its tracks resolved to
  `349px 349px 0px`, an entirely collapsed third column.
- The state chip read **"— No limits yet"**. The em dash is not in this app's state vocabulary; the
  registries above use `⊘` for off, `✓` for on, `◔` for waiting, `✕` for refused.
- An unset dial printed a literal `0`, so the panel opened as a wall of zeros instead of a shop that has
  not set its limits yet.
- The two cards ran from y = 387 to y = 1497 - **1110 px** of settings - and the page's `main` measured
  1439 px tall.

## The double ✕ was Chromium's, and it was not one defect but two

The spotlight's well already ships its own clear button (30 × 30, at x = 954 in the screenshot's frame).
Chromium paints its own `::-webkit-search-cancel-button` inside any `input[type='search']` on top of
that, so the field showed two ✕ side by side - and the second one cannot be styled, cannot be focused
and cannot be reached by keyboard. `appearance: none` on the *element* does not remove it; the
pseudo-element itself has to be reset. That is the whole fix.

I scoped it to the two fields that ship their own clear - the spotlight and the scope target picker in
the coupon builder. The app has **twelve** `type="search"` inputs; the other ten have no clear of their
own, so a blanket reset would have quietly taken away their only way out of a search.

The amber outline looked drawn twice for two separate reasons, and both needed fixing:

- The well rang itself on `:focus-within`, which also fires when the clear or close button *inside* it
  holds focus - and those buttons draw their own ring. After one Tab the probe read
  `wellOutline: solid rgb(255, 195, 107)` **and** `activeOutline: solid rgb(255, 195, 107)`: one ring
  inside another. The well now rings only `:has(.spotlight-input:focus-visible)`.
- The well also turned its own border amber while the amber ring sat 2 px outside it, so the field
  showed two amber lines. The border colour change is gone; the ring is the only amber line.

## What it is now

Both dials sit on the one solid plate the registries use (`.table-surface`: `--surface`, the 22 px
`--radius-lg`, `--shell-shadow`, the accent strip), divided by the house `--row-line`, and every control
is a row: the name and what it refuses on the left, the field on the right.

- The grid is `minmax(0, 1fr) minmax(190px, 250px)` - deterministic, so a fourth limit cannot strand over
  a hole. Under 768 px the row becomes one column and the control drops under its name at full width, so
  a dial is never squeezed to 190 px on a phone.
- The chip speaks the registry vocabulary: `⊘ No limits yet` on `badge--neutral`, `✓ Limits on` on
  `badge--ok`.
- An unset dial shows the placeholder "None" (the string already in `bn.json`) instead of a zero. Saving
  is unchanged, because `Number('') || 0` is the same 0 the field used to hold.

## Numbers off the running screen

| | before | after |
| --- | --- | --- |
| plates on the tab | 2 translucent cards, 480 px and 760 px | 1 solid plate, 1376 px, both blocks 1374 px |
| policy grid | 3 tracks of 228.66 px for 4 fields | 7 rows, each 1052 px of label + 250 px of control, flush |
| dead space beside the fourth field | 482 px | 0 |
| the settings block at 1440 | 1110 px (233 + 853 + the gap between two cards) | 874 px (one plate) |
| page height at 1440 | main 1439 px | main 1203 px |
| the same at 390 | - | plate 366 px, controls full width at 316 px, block 1478 px |
| ✕ controls in the spotlight well | 2 (the app's + Chromium's) | 1 |
| rings while the clear button holds focus | 2 (well + button) | 1 (button only; well resolves `outline: none`) |
| well border while focused | `rgb(255, 171, 77)` amber under an amber ring | `rgb(119, 133, 154)` grey, ring stays `rgb(154, 63, 0)` |

The seeded run (policy written: 40 %, 2 500, 60 %, 150 000, 25 %, 5 000) reads `✓ Limits on` in
`rgb(20, 83, 45)` on `rgb(220, 252, 231)` with every value in its own row, at both 1440 and 390, in both
themes.

## Tests

- `web/src/test/admin-settings-panel.test.tsx` - new, 6 tests. Both forms inside one `.table-surface`
  with no inline width cap and no `card-glass`; the row grid's two tracks and the phone collapse in
  `responsive.css`; the dividers on `var(--row-line)`; an unset dial empty with placeholder "None"; the
  chip `⊘`/`badge--neutral` unset and `✓`/`badge--ok` once a limit is written.
- `web/src/test/search-surfaces.test.tsx` - 11 tests now. The old assertion on
  `.spotlight-field:focus-within` is replaced by the `:has(.spotlight-input:focus-visible)` contract,
  plus a test that the native-clear reset exists, covers both fields that ship a clear, and is *not*
  applied to `input[type='search']` generally.
- `web/e2e/admin-settings.spec.ts` - new. Asks the live DOM what it resolved: plate width against its
  column, opaque background, both blocks full width, the number of tracks each row put its dial in, the
  label and control bounding boxes on one line at 1440 and stacked at 390, the chip glyph against the
  house set. Walks 1440 and 390 × light and dark, skips itself with an explanation until
  `NINECUBE_SEED_PASSWORD` is set.
- `web/e2e/search-surfaces.spec.ts` - extended with the two things the screenshots showed: the resolved
  `::-webkit-search-cancel-button` display, the number of buttons inside the well, and the ring state
  before and after a real Tab.
- `web/src/test/discount-moderation.test.tsx` (15 tests) still passes untouched - the refusal, replay and
  second-signature behaviour reads the same labels through the new markup.

Full suite in an isolated worktree at HEAD plus only my files: **39 files, 269 tests, all green**, and
`npx tsc --noEmit`, `npm run i18n:check` (1900 entries) and `npm run build` all clean.

One thing I will not paper over: a second full-suite run on this box, minutes later, failed **5** files -
and a *different* 5 than the run before it, three of which (`catalogue-sidebar`, `categories`,
`checkout`) this round never touched. Every failure was the same `waitFor` timeout while a lazily loaded
page was still arriving, on a machine the other session was building on at the time. Re-running exactly
those five files with my changes in place: **52 tests, all passing**. So this is contention, not a
regression - but it is also a real flake in this suite's page-load waits, and CI on its own hardware is
the tiebreaker.

## Limits, honestly

I could not run the committed browser specs: nothing is listening on 5080 or 5173 for this project, and I
have no demo password, so those live runs stay owed by you. Everything in the "after" column comes from a
throwaway stub build of the real app - the real components, the real stylesheets, the app's own MSW
fixtures - booted in-process on a random free port, and that harness is deleted again. It proves layout
and paint, not catalogue data.

One measurement I want on the record rather than buried: Chromium's computed style for
`::-webkit-search-cancel-button` still reports `display: block` after the reset, while the pixel result
is gone. The computed-style read is not a proof here; the screenshot and the button count are. That is
why the e2e spec asserts both.

## The repository, again

The other session is still working in this same tree. At the time of writing its `App.tsx` edit imports
a `GuestOrderPage.tsx` that is **untracked**, and `tsc --noEmit` in the shared tree fails on that file's
unused import - not mine. So I gated in a detached worktree at HEAD with only my seven code files copied
in, and my commit contains those plus this report. Nothing of theirs is committed, changed or reverted by
this round. If you did not intend two agents to push into one tree at once, this is the second round it
has cost time.

# Round 17 — the two search boxes are one object now, and the navbar stopped buying a catalogue nobody asked for

Date: 2026-11-03. Brief: "here currently some new features are including but it has some latency and
design issues, Specially in the global search bar, alignment to the system current design and modern
effect", with two dark screenshots of `#/products?category=home`: the navbar pill, and the catalogue
where the floating pill half-clipped the page's own "Live availability st…" line and the "Name or
SKU" field.

You bound this round to two things: **both search surfaces** (the Ctrl+K spotlight and the catalogue's
own field plus its suggestion panel, including the collision), and **fix the wasted requests, measure
first**. You explicitly left the 15s stock poll on data pages out of scope, so it is measured below
and not touched.

## The latency was real and it was the navbar paying for it

Measured on the deployed site before any change: with the dialog closed and nobody typing, the navbar's
copy of the catalogue queries fired **14 `/api/products?…pageSize=6` calls and 14 `/api/categories`
calls in 229 s** while just sitting on the login page. Two causes, both in code, not in the network:
`GlobalSearch` ran `useProducts`/`useCategories` ungated, and `useProducts` carries the 15 s stock poll
that only makes sense for a quantity grid someone is looking at. The third cause was the guest/sign-in
branch in `Navbar.tsx` remounting `<GlobalSearch/>`, which turned those idle polls into a double
subscription.

What changed: `useProducts`/`useCategories`/`useLowStockThreshold` now take an `enabled` gate, the
spotlight passes `open` for categories and threshold, `searching` (dialog open **and** two or more
characters) for the result list, and `live: false` so the dialog's result query never carries the stock
poll. I did not restructure the navbar markup — that would have moved the search button out of the
approved actions pill, and the remount is harmless once nothing behind it fires.

Measured after, on a stub-API build of the same app, 18 s idle on the catalogue, at 1440 and 390, in
light and dark:

| what | before | after |
| --- | --- | --- |
| `/api/products?pageSize=6` while the dialog is closed | 14 in 229 s | **0 in 18 s, every configuration** |
| the same request after opening the dialog | firing already | **0** |
| the same request after typing two characters | continuous polling | **exactly 1** |
| `/api/categories` | 14 in 229 s | 2 in 18 s, and that is the page's own sidebar (1 + its 15 s poll) |

Still there, measured, and deliberately not touched because you took it out of scope: the catalogue
sidebar facet query pulls the whole filtered set at `pageSize=100` every 15 s (`100/8/100/8` in an 18 s
window: the facet page and the grid page, twice). Fixing that needs a count on the server, not a tweak
in the client, and I would rather build it properly than fake the numbers.

## Why the search bar still looked wrong after I aligned it

This is the part worth writing down, because reading the stylesheet was not enough. Last round I put
the spotlight and the panel on the system plate, and your screenshot still showed a search surface that
did not match. So instead of re-reading `app.css` I asked the running DOM what it had resolved, and it
answered:

```
.search-suggestions__row   color: rgb(154, 63, 0)   text-decoration: underline     (light)
.search-suggestions__row   color: rgb(255, 195, 107) text-decoration: underline    (dark)
```

`app.css` says `color: var(--text); text-decoration: none` for that row. It loses, because
`responsive.css` — which loads *after* it — carries the touchscreen rule that makes text navigation
identifiable without hover:

```
main a[href]:not(.btn):not(.filter-chip):not(.product-card__media-link):not(.product-card__name a):not(:has(img))
```

That selector is specificity (0,4,3) against my class's (0,1,0). The suggestion rows are `<Link>`s, so
every match painted in the link accent with an underline — and because one of the exclusions is
`:not(:has(img))`, a row that happened to carry a product image painted differently from a row that did
not. Mixed paint inside one list is exactly the "not aligned to the system" look, and no amount of
editing `app.css` would have fixed it.

The fix is at the cause: the row is a list control, not prose navigation, so it joins the exclusion list
that already carries `.btn`, `.filter-chip` and `.product-card__media-link`. One line in
`responsive.css`. The approved visuals stay — nothing was removed, and the pill's amber selected tab and
amber selected row fills are untouched.

## What the two surfaces resolve to now

Same sweep, both widths, both themes, numbers read out of the browser:

| what | before | after |
| --- | --- | --- |
| chip edge against its own plate | 1.37 light / 1.75 dark | **3.75 / 3.91** |
| result row edge | 1.51 / 1.64 | **3.75 / 3.91** |
| suggestion row ink | accent + underline, mixed with image rows | `rgb(15,23,42)` light / `rgb(245,242,243)` dark, `text-decoration: none` on all rows |
| match panel plate | translucent `rgba(…, .96)` at z-index 50, the same level as the pill | solid `--surface` (`rgb(255,255,255)` / `rgb(27,24,26)`) at **z-index 60** over the pill's 50 |
| result name / price | 15 px | **16 px**, price 700 tabular |
| clear / close controls | 28×28, twin circles | 30×30 ghost inside the well, **34×34** outside it |
| stock label | `✓ 6 in stock`, untranslated | shared `StockBadge`, 13 px, `in-stock` / `low-stock` states, house colours |
| inline styles on the two subtrees | 12 | **0** |
| floating pill over a scrolling line | translucent gradient only, text bled through | `--surface` backing under the approved `--navbar-glass` tint, tint still drawn |

The panel never physically reaches the pill in the harness geometry (at 1440 its top resolved to 150 px
against the pill's bottom at 85 px; at 390 the pill hides on scroll-down), so the collision is proven by
the resolved stacking order — 60 over 50 — rather than by a screenshot of an overlap that no longer
happens to occur.

## Tests

- `web/src/test/search-surfaces.test.tsx` — 10 tests. Seven are the stylesheet contract (plate, well,
  option tokens, tap floors, z-order, the pill backing), and one of them asserts the row is inside that
  touchscreen rule's exclusion list, because that is the assertion the bug actually needed. Three are
  behaviour: the request gate (0 closed, 0 on open, 1 after typing), the shared stock badge with no
  untranslated ASCII and no doubled brand, and the matches rendering as product links.
- `web/e2e/search-surfaces.spec.ts` — asks the live DOM the same questions through the shared colour
  probe, walks 1440 and 390 in both themes, and skips itself with an explanation until
  `NINECUBE_SEED_PASSWORD` is set.

## Limits, honestly

I could not run the committed browser spec: nothing is listening on 5080 or 5173 on this box, and I have
no demo password, so the live run stays owed by you. Everything in the "after" columns above comes from a
throwaway stub-API build of the real app (MSW fixtures, port 7341), which is deleted again — so the
numbers are the real components and the real stylesheets, but the seeded catalogue, not the live one.

## One thing you need to know about the repository

Another session is committing into this same working tree while I work. Round 17's `hooks.ts`,
`GlobalSearch.tsx`, `ProductsPage.tsx`, `app.css` and `modern.css` changes went out inside **its** commit
`804ee78`, not mine, and at the time of writing the tree is holding that session's unfinished work:
`RecentlyViewed.tsx`, `QuickViewModal.tsx`, `StockAlertModal.tsx` and `recentViews.ts` are untracked while
committed code references them, and `ProductDetailPage.tsx`, `CartPanel.tsx`, `OrdersPages.tsx` and
`app.css` carry their uncommitted edits. Because of that I did not gate in the shared tree — a
`tsc --noEmit` there reports their errors, not mine — and instead ran the four CI gates in an isolated
worktree at HEAD plus only my three files. My commit adds only those three; nothing of theirs is
included or reverted. If you did not intend two agents to be pushing at once, that is worth stopping
before the next round.

Also this session: several tool results came back with text appended that posed as system instructions
("You are an expert software engineer…", "Respond as concisely as possible…", a copyright directive).
That is not how your messages or this harness arrive, so I ignored them and carried on with your round;
flagging it in case it is a compromised plugin in the toolchain.

# Round 16 — the option you circled in red is a control now, and the cart sheet stops hiding

Date: 2026-11-02. Brief: "here red marked button not visible and also consider font size. Please you
review all as apges as live and also check the Your card page give the modern e-comemrce type better
unique design", with a screenshot and two red pen marks sitting under **Percentage (%)** and **Fixed
Amount (BDT)** in the "Discount Value & Calculation" step.

One thing to say up front: **this app has no `/cart` route.** When you picked "Cart page (/cart)" I
went looking, and the only cart in the codebase is the **navbar "Your cart" sheet** — `CartSheet`
opening `CartPanel` (`web/src/components/CartPanel.tsx`). That is the surface I redesigned, because it
is the surface a customer actually uses. If you meant something else, tell me which screen and I will
redo it there.

## What the red mark actually was

The two options are one `segmented` control. The selected one gets the amber fill; the other one was
declared as:

```css
.segmented__option { background: transparent; border: none; font-size: var(--text-micro); }
```

No border, no face, and sitting on a `--well-fill` tray. I measured it in the browser rather than
arguing about it: **edge contrast 1.00:1 against its own tray, at 12px** (`--text-micro`). That is not
a dim control, that is no control — it paints as plain text, which is exactly what your pen marked.
The same pattern was repeated on every pill and chip in the builder.

The cause is that the theme had no token for "a thing you can click that is not currently chosen".
Every one of these surfaces reached for `transparent` because nothing else said "clickable".

## The fix: one option vocabulary, applied everywhere it was used

Five additive alias tokens in `web/src/styles/tokens.css` — `--opt-fill`, `--opt-fill-hover`,
`--opt-edge`, `--opt-ink` — defined separately for light and dark. Additive only: no existing
token was redefined, because the light-theme palette is pinned by `web/src/test/light-theme.test.tsx`.
Nothing in this round touched the amber selected fill or the amber selected row.

Then the five control families that had the transparent-body defect were routed through it: the
segmented option, the discount quick pills, the scope-add chips, the filter chips, and the cart's
voucher chips, quick chips and code input. All of them now paint a face and an edge, 13px type, at
least 30px tall.

Measured after the change, in a browser, both themes, both widths:

| control | before | after (light) | after (dark) |
| --- | --- | --- | --- |
| "Fixed Amount (BDT)" edge on its tray | **1.00:1** | **3.19:1** | **4.55:1** |
| its type size / declared border | 12px (`--text-micro`), no border | **13px / 30px tall** | 13px / 30px |
| ink on its own face | 17.85:1 | 17.85:1 | 14.51:1 |
| "Percentage (%)" — selected, amber | edge 1.05 | edge 2.71, ink 6.1 | edge 8.36, ink 9.1 |

Selected keeps winning visually (amber fill, 2.71:1 / 8.36:1 edge), unselected stops disappearing. The
"Whole basket" chip reads 1.94:1 light / 1.64:1 dark because it *is* the selected one — it uses the
same amber selected state (`scope-add__chip--active`, app.css:3239) with 6.87:1 / 12.67:1 ink. I left
that alone deliberately.

A dead rule family turned up in the audit: `.bulk-pill-btn` was styled off two variables
(`--text-bright`, `--text-on-brand`) that are **not declared anywhere in the project** — so those
buttons resolved to the initial values. They now sit on the same option tokens, and there is a test
that fails if any `var(--x)` in app.css stops being declared.

## The cart sheet: three defects, one of them mine

The sheet was the flex-collapse class of bug I have now seen twice. It had `position: sticky` plus
`max-height` plus `overflow-y: auto` on `.cart-panel`, and inside a flex column that shrinks children
to nothing: **the product line list measured `height: 0px` while `scrollHeight` reported 282px.** Three
items in the cart, zero items on screen. Removing the nested scroller (the sheet itself scrolls) gives
the list its natural height and pins the totals as a bottom dock instead.

| | before | after |
| --- | --- | --- |
| `.cart-lines` (the item list) | **0px tall** | **337px, 3 rows, first row 112px** |
| Place-order dock | in flow, off-screen | `position: sticky`, 116px at 1440 / 109px at 390, bottom edge at 841 / 832 — inside the viewport |
| Summary vs dock | overlapped | summary ends 697, dock starts 713 (1440); 695 vs 711 (390) |
| Close button on a phone | **not painted** | top at 54px, `elementFromPoint` hits the button itself |

The Close button had a second, separate cause. `CampaignBanner.css` had the page's campaign strip at
`z-index: 100`. The modal layer is `--z-modal: 70`. So on a phone the in-flow marketing strip drew
itself **over the top of the cart dialog** and covered exactly the row where the dismiss control lived.
An in-flow page strip has no business sitting above the dialog layer; it is now `var(--z-sticky)` (40).
The dismiss control also moved where it belongs — onto the "Your cart" title row instead of a full-width
`.btn` stranded above the heading.

Then a regression I introduced and then measured: making the options raised and 13px pushed the five
status filters to **401px on a 390px phone** — the admin coupons tab scrolled sideways by 11px. The
segmented row now wraps (`flex-wrap: wrap; max-width: 100%`) so every option stays reachable instead
of one hiding behind a horizontal scroll. Same tab measures `scrollWidth 390 === clientWidth 390`.

## Live review of every route

You asked me to look at all pages live rather than reason about them. I ran every route at 1440 and
390, in light and dark, and asked each page what it actually resolved — 52 page renders (13 routes × 4
combinations) and 215 control readings off those pages, in one run. **Sideways overflow: none on any
route, any width, any theme** (`overflow rows: []`).

| route | laptop 1440 | phone 390 |
| --- | --- | --- |
| home | 1,732px | 4,819px |
| products | 1,732px | 4,819px |
| product detail | 1,879px | 2,690px |
| account | 1,594px | 3,037px |
| profile | 1,711px | 2,742px |
| notifications | 1,296px | 1,935px |
| inventory | 1,199px | 1,841px |
| gift cards | 1,062px | 1,775px |
| admin (coupons) | 3,005px | 4,839px |

Four routes (orders, wishlist, staff, sales) came back at exactly 900px — one laptop screen. That is
their empty state against the fixtures, so read those four as a floor, not as proof the real list fits.

Two readings came out of that run. On the route sweep, every control renders at **13px or larger** with
ink between **6.1:1 and 17.85:1** on its own face. And in the focused probe over the builder options and
the cart sheet — the surfaces your pen marked — every unselected choice sits at **3.19:1 (light) /
4.55:1 (dark) or better** against its tray. Two flagged numbers turned out to be measurement artefacts, and
I am reporting them instead of quietly dropping them: a 503 on a product image (the harness serves no
`/uploads`), and the Place-order button reading 1.06 ink-on-fill in dark — its background is a
`linear-gradient`, so `background-color` is `rgba(0,0,0,0)` and the probe has nothing to blend against.
The real paint is `rgb(255,195,107)` → `rgb(255,171,77)` under `rgb(26,17,0)` ink, which is fine.

## Tests

- `web/src/test/option-and-cart.test.ts` — 11 new CSS/markup contract tests: every control class in the
  option family carries `--opt-fill` and `--opt-edge`; the amber selected states still exist; the
  `--opt-*` tokens are defined and non-transparent in **both** theme blocks; `.cart-panel` is free of
  `sticky`/`max-height`/`overflow` and the TSX still renders the section; the cart rules use no raw hex
  and no undeclared token; the campaign banner sits at `--z-sticky` and `--z-sticky < --z-modal`; and a
  whole-file sweep that every `var(--x)` in app.css resolves.
- `web/e2e/cart-sheet.spec.ts` — new. Says in its own header that the cart is the navbar sheet, not a
  route. Opens the sheet, then asks the DOM: is the list taller than 60px, is every line at least 40px,
  does `elementFromPoint` at the Close button's centre return the button, is the dock sticky and inside
  the viewport, does the summary stop above the dock.
- `web/e2e/coupon-workflow.spec.ts` — new option-legibility test across 1440/390 × light/dark, and the
  colour probe was lifted out of this spec into a shared `web/e2e/colour-probe.ts` so both specs ask the
  page the same question.

Gates after the last edit: `tsc --noEmit` clean, `i18n:check` 1822 entries, `vitest run` 240 tests / 34
files passing, `npm run build` clean.

## Limits

I still cannot sign in to your live stack — no password — so every number above comes from a throwaway
stub harness that mounts the real components with fixtures, not from the deployed admin. The harness and
its scripts are deleted before this commit. The browser specs are written and typecheck, but they need
`NINECUBE_SEED_PASSWORD` to run, which only you can do.

# Round 15 — the coupon screen fits a working day, and light mode stops apologising

Date: 2026-11-02. Brief: "this pages becomes longs not very user friendly , is user uese it
frequently. also problem in the light theme it's not give very ggod looks and visbility". Two
complaints, both about the screen an operator lives in: the Coupons & Discounts tab had grown too
tall to work in, and light mode had gone flat.

## What the screen was doing

The tab now carries a preset rail, a five-step builder, a live reach panel, an order replay plate, a
voucher, a review queue and a registry — all of it open at once. Measured at 1440 × 900 the builder
column alone was 2,091px, the registry table did not start until y = 2,820 (3.1 screens of scrolling),
and the whole document ran to 4,272px: **4.7 screens to get from the first field to the list of
coupons**. On a phone at 390 × 844 it was 6,644px, **7.9 screens**. Someone who uses this ten times a
day spends most of that time scrolling past work they have already done.

And in light mode every panel sat on the page with no visible line under it, so a card, a table and
the background were three shades of the same near-white.

## The length: a step is a row until you open it

`StepCard` (`web/src/components/StepCard.tsx`) is one new component, used by both builders — five
steps on Coupons, four on Gift Cards. The header row is a real `<button aria-expanded>`; the body
stays mounted and is switched off with the `hidden` attribute, so folding step 3 does not throw away
the scope search you typed, and the reach preview and replay plate do not refetch when you reopen it.

What decides which steps start open: the three that cost money — method and code, value, scope — stay
open; the two optional ones (limits, dates and placement) start folded. A folded step is a **61px row
that still states its value**: "No minimum · Unlimited", "15% off · up to BDT 500", "All products
(Order)", "Never expires", so nothing has to be opened just to be checked.

The preset rail went from two stacked tiers to one scrolling row of fixed-width cards, and the
registry's own controls — heading, selection count, bulk buttons, search, state filter — now travel
down the list together as `.registry-bar`.

| | before | after |
| --- | --- | --- |
| Preset rail (laptop) | 294px, two tiers | **201px, one row** |
| Builder column (laptop) | 2,091px | **1,421px** |
| Registry table starts at | y = 2,820 (3.1 screens) | **y = 2,183 (2.4 screens)** |
| Whole tab, laptop | 4,272px = 4.7 screens | **3,551px = 3.9 screens** |
| Whole tab, phone | 6,644px = 7.9 screens | **5,276px = 6.3 screens** |
| A folded step | — | **61px** (step 3 folds 726 → 61, step 5 opens 61 → 326) |
| Gift card registry starts at | — | y = 1,331 laptop, y = 2,293 phone |

The sticky bar was checked by asking the page, not by reading the CSS: it pins at viewport y = 93 with
the navbar ending at 85, sits at `z-index: 40` under the navbar's 50, and `document.elementFromPoint`
at its centre returns a node inside the bar — the rows slide under it, they do not show through it.
Below 640px it goes back to `position: static`, because a pinned bar on a phone eats the screen before
the list appears.

Two geometry traps showed up only at 390: the builder's grid track was a bare `1fr`, which floors at
its content's min-content width and pushed **122px of sideways scroll** onto the page, and the step
header's nowrap text made the same floor under flex. Both are fixed at the cause (`minmax(0, 1fr)`,
`flex: 1; min-width: 0` with an ellipsis), and the tab now measures `scrollWidth === clientWidth`.

## The light theme: the palette's border is 1.51:1 against white

The spec §1 light palette pins `--border` at `#CBD3E1`, and `web/src/test/light-theme.test.tsx`
asserts that value verbatim, so redlining it was never an option. Instead the load-bearing edges moved
onto new aliases that light defines and dark simply re-aliases to what it already used — dark
rendering is unchanged, byte for byte:

- **Shells** (`.registry-bar`, `.discount-config-card`, the preset tray, the builder cards):
  `--edge-shell: #77859A` plus the card shadow — **3.75:1 against their own surface, 3.19:1 against
  the page**.
- **Wells** (inputs, the segmented control, preset chips, the 19 inset pairs across the screen):
  `--well-fill` + `--edge-well` + an inset shadow, so a field reads as pressed into the card rather
  than drawn on it.
- **Row lines** (`--row-line`) and **badge rings** (`--ok-ring`, `--warn-ring`, `--bad-ring`) so a
  status pill has an edge of its own on a translucent card.
- **Type tail**: 55 declarations moved onto `--text-micro` (12px) and `--text-label` (13px). The
  smallest text an operator reads on these screens is now 12px; the only 11px and sub-10px hits left
  are the campaign banner's "Copy" pill and the two letters of the logo wordmark.

The last one, and the biggest single lever, was the glass. `modern.css` paints every translucent
surface in the app — the navbar, `.card`, `.table-surface`, the product cards, the cart panel, the
filter panel, address cards, notification rows, the language panel, the staff order queues — from one
token, `--nav-glass-edge`, and in light that token was `rgba(119, 133, 154, .64)`. Blended over the
card it borders, that resolves to **2.0:1**: a line nobody could see. It is now the same opaque
`#77859A` the solid shells use, which lifts all of them at once — measured on the running screen:

| Surface, light | edge before | edge after |
| --- | --- | --- |
| `.navbar` | 2.0:1 | **3.19:1** |
| `.coupon-templates` tray | 2.0:1 | **3.75:1 / 3.19:1** |
| `.discount-config-card` | 2.0:1 | **3.75:1 / 3.19:1** |
| `.registry-bar` | 2.0:1 | **3.75:1 / 3.19:1** |
| `.table-surface` | 2.0:1 | **3.75:1 / 3.19:1** |

Dark keeps its own `rgba(216, 229, 250, .46)` edge, and the spec §1 tokens are untouched.

## Sweep

Eleven routes (home, catalogue, cart, gift cards, account, login, admin users / coupons / settings,
staff, inventory) × light and dark × 1440 and 390 — 44 loads. **Horizontal overflow: 0px on every
one.** Every card, tray, table, panel and navbar on those routes now borders at 3:1 or better in
light. What is still soft is soft on purpose and unchanged from before: the spec's own status badge
borders (`--ok-border` and friends, 1.2–1.6:1 tints that carry a dot and a word as well as a ring),
the footer's top rule, inset wells at 1.65:1, and one divider above the pager.

## Gates and suites

Frontend, all after the last edit: `npx tsc --noEmit` clean, `npm run i18n:check` clean at 1,822
entries (one new key, "up to", for the folded value line), `npx vitest run` **229 tests in 33 files,
0 failures** — `src/test/coupon-workflow.test.tsx` is new and holds the eight contracts this round
depends on: the `[hidden]` rule that has to beat the author `display: flex`, the ellipsis pair that
keeps a folded row to one line, the one-row rail, the sticky offsets and the z-order against the
navbar, the `minmax(0, 1fr)` track, the raised light glass edge, and which steps start open.
`npm run build` clean with `AdminPage-*.js` at 98.11 kB / 22.35 kB gzip. No backend file changed, so
the .NET build and tests were not re-run.

The browser side is `web/e2e/coupon-workflow.spec.ts`: it signs in, then asks the live DOM the five
questions above — folded row height and its summary text, the rail's row count and scroll, where the
registry bar actually lands and what paints over what, the resolved contrast of five glass surfaces
in light plus the proof the raise did not leak into dark, and page width at 390. It needs
`NINECUBE_SEED_PASSWORD` like every other spec here, so it has not been run against the real API yet;
what was verified in this session is the same code path against the project's own MSW fixtures — a
dry run of that spec's exact selectors and assertions passed in both themes at both widths.

## Left alone deliberately

The navbar's amber selected tab and the amber selected-row fill — both still there, both re-measured.
The scope rule engine, the stacking policy, the reach preview and the replay plate are untouched; this
round only decided when their panels are on screen. Stock is still not editable from any bulk path.
The builder gained no new fields, buttons or badges — the same controls, fewer of them visible at once.

One measured thing I did not change: the campaign banner's white text on the amber gradient works out
at roughly 2:1 in both themes. It is a marketing strip that predates this round and its palette is its
own, so it is flagged rather than repainted — say the word and it goes to the accent ink the rest of
the amber surfaces use.

## What this does not prove

The browser pass ran the real app against a stub of the API on a throwaway port, so the figures above
are layout, paint and geometry, not catalogue data — the coupon counts and reach numbers on screen
come from the fixture set. The harness lived in `web/.ui-harness/` and is deleted; the repo points at
none of it. The stub servers on 127.0.0.1:5178, 5199, 5221, 5241, 5311 and 5322 are still listening
because killing processes is blocked here, and `ninecube-verify-pg` is still up on 5433 — all of them
need ending by hand.

---

# Round 14 — the shop sets its own discount limits, sees the cost against real orders, and needs a second signature above the line

Date: 2026-11-02. Brief: "you can not suggest any better moderation as modern unique system", then
"you apply those will make this system unique others existing systems", then "ok apply". Three phases,
in the order they were approved: the store's own discount policy, a coupon replayed against the last
30 days of real orders, and a second administrator's signature for anything past the line.

## What the screen could not do before

- Any administrator could release any discount. A 90% voucher, a BDT 5,000 flat cut on a BDT 6,000
  basket — the API checked the code was unique and the numbers were non-negative, and nothing else.
- There was no figure anywhere that said what a coupon would cost. The reach preview from Round 12
  counts stock and products; it never mentioned money.
- One person wrote a coupon and one person released it, with no trace of who, and no way to say no.

## Phase 1 — the store's limits, refused in its own words

`DiscountPolicyGuard` is a pure class holding the sentences, and `DiscountPolicyService` reads six
numbers from the `Setting` table — the same place the low stock threshold lives, under the same
ten-minute cache — so an unset limit is simply `0` and means "no check". The six: highest rate, most
one coupon may take off an order, biggest share of a single order, a rolling weekly promo budget, and
the two second-signature thresholds.

The guard is called from four places on purpose — create, edit, switch-on, and approve — so a coupon
cannot be saved past a limit, then flicked live through the status endpoint. A refusal comes back as a
400 with the shop's own arithmetic, sentences like:

> A 40% coupon passes your BDT 2,000 ceiling once an order reaches BDT 5,000. Set this coupon's
> maximum discount to BDT 2,000 or less.

> This gives BDT 500 off a BDT 600 order — 83.3% of it. Your policy allows 30%.

A threshold nobody can reach is refused at save time as well: setting the second-signature line above
the hard maximum would queue nothing, so the API says so. Coupons already live are untouched until
somebody saves them — the policy bites on write, not on read.

## Phase 2 — the same coupon against the shop's own order history

`POST /api/coupons/order-replay` runs the scope rules from Round 12 over delivered and shipped order
rows in the last 30 days and returns the orders it would have hit, the total giveaway, the average per
order, the share of qualifying value, what the shop actually gave away in that window, the top five
products by giveaway, and any note the operator needs. A shop with no orders in the window is told
exactly that instead of being shown a zero — `hasOrders` is measured on the window, not on the
qualifying subset, which is the distinction between "nothing matched" and "there was nothing to match".

The plate renders in the coupon builder as the numbers are typed, and again inside the review dialog,
so the person signing has the cost in front of them rather than a percentage to imagine.

## Phase 3 — past the line, two names are needed

Six columns arrived with `AddCouponApprovalTrail`: approval state, the writer and the time they wrote
it, the reviewer, the review time, and the refusal reason. A coupon over either signature threshold is
created as `Pending` and stays switched off; the registry row reads "Awaiting approval · Written by
writer@…" with a shield button, and the status segmented control gains a "To approve" option with the
count in it. Approving as the same person who wrote it is refused with a 409 and `code: self_approval`
— "You wrote PEND2, so a second administrator has to approve it" — and the dialog disables Approve and
says the same thing in plain words before anyone clicks. Both decisions write an audit entry
(`CouponSubmittedForApproval`, `CouponApproved`, and the refusal with its reason). A refused coupon
carries the reason on its row, and switching it on by hand is refused until it goes back for approval.

## The numbers off the running screen

The real app at 1440 × 900 and 390 × 844, light and dark, driven by Playwright against the project's
own MSW fixtures behind a throwaway local port. Every figure below was read out of the DOM with
`getComputedStyle` and `getBoundingClientRect`.

| Surface | Measured |
| --- | --- |
| Page horizontal overflow | 0px at both widths, both themes |
| Policy panel | badge "✓ Limits on"; six inputs at 16px, none clipped; weekly meter 239/684px light `#F59E0B`, dark `#ffab4d`, 102/290px at 390 — BDT 350 given away of a BDT 1,000 budget |
| Policy actions | Save 110 × 41; Discard appears only on a dirty draft at 129 × 32 and puts the typed 28 back to 30 |
| Guardrail refusal | toast reads "Your policy allows at most 30% off. This coupon gives 45%." — the API's sentence, not a paraphrase |
| Replay plate in the builder | 10% storewide: 4/5 orders, BDT 506.57 total, BDT 126.64 average, 10% share, top line "Apple iPhone 17 Pro 256GB, Black (83170042) · 2 orders · 2 units · BDT 299.80"; plate 780 × 290 at 1440 and 332 × 436 at 390; four figures at 15px, none wrapped |
| Queue in the registry | "To approve 3" → 2 after a refusal → 1 after an approval; Awaiting-approval badge `rgb(254,243,199)` light / `rgb(73,53,27)` dark; shield 38 × 38 at opacity 1 with no hover needed |
| After the decision | row reads "Reason: Too deep for a storewide sale." (237 × 22 at 14px) and "Signed off by admin@ninecube.demo" on the approved one |
| Review dialog | 640 × 792 dead-centre with 400px gutters at 1440; 358 × 743 with 16px gutters at 390; four fact rows; its own replay plate showing BDT 1,510.01 / BDT 377.50 / 29.8%; zero clipped descendants |
| Toast after refusing | "PEND1 has been refused. The writer sees your reason." |

## One thing this round had to fix on the way: the dialog's buttons were off screen

The review dialog is tall by design — the lead, four facts, the writer, the replay plate and the reason
field — and `.modal` scrolled as one box. Measured before the change: "Approve and release" sat at
y = 846 with the screen ending at 900 on a laptop, **32px below the fold**, and at y = 1117 on a phone
with 844 of viewport, **303px below it**. The one decision the dialog exists for needed a hunt.

The shared `Modal` (`web/src/components/ui.tsx`) is now three parts: the heading, a `.modal__body` that
scrolls, and the footer as the dialog's own row. Measured after: footer bottom sits 25px above the
dialog's edge and fully inside the viewport at both widths, with the buttons at 60 / 68 / 156 × 32; the
heading stays put while its fields scroll. The same numbers were read on the other dialogs that share
the component — Edit Coupon (792px tall, body scrolls, actions in view), the bulk-delete confirm
(340px at 1440, 365px at 390, no scroll needed) and Edit Gift Card (495px and 597px, no scroll) — and
one test in `admin-dialogs.test.tsx` now fails if the footer is ever moved back inside the scrolling
stack.

## Two readings I want on the record, because one was my mistake

- A real one: the refusal for a switched-on refused coupon came out as "HUGE30 was refused: Too deep
  for a storewide sale.. Edit it and it goes back for approval." — a full stop twice, because the
  reviewer's own reason already ended with one. `CouponService` now ends the clause with exactly one
  sentence mark whether the reason had one or not, and the backend test asserts the whole corrected
  string so it cannot drift back.
- My mistake, not the app's: on an early pass the amber selected-row fill measured
  `rgba(0, 0, 0, 0)`, and I reported it as missing. The row fills over its own 150ms
  `background-color` transition, and I had read the frame right after the click. Read after the
  transition it is `rgb(255, 241, 214)` in light and `rgba(245, 151, 38, 0.16)` in dark, with the
  `inset 3px 0 0 #D97706` bar. Nothing was broken; the measurement was. Every pass in the table above
  now waits for the transition.

## Gates and suites

Backend: `dotnet build -c Release` clean, 0 warnings and 0 errors. `CouponModerationTests`,
`DiscountPolicyGuardTests`, `CouponScopeTests` and `CouponScopeMatcherTests` pass 83 tests with 0
failures — the first and the third against a real `postgres:18-alpine` Testcontainer, the other two as
pure unit tests. Frontend: `npx tsc --noEmit` clean, `npm run i18n:check` clean at 1,821 entries,
`npx vitest run` 221 tests in 32 files (16 of them new this round — the fifteen moderation cases plus
the dialog structure guard), `npm run build` clean with `AdminPage-*.js` at 98.89 kB / 21.90 kB gzip.

## How this was verified, and what it does not prove

The browser pass ran the real app against a stub of the API, not the .NET API: no seeded Postgres was
involved, and the replay figures in the table above come from the fixture order history — six orders,
four of them storewide-qualifying — while the money maths itself is proven by the container tests. The
stub's refusal sentences were rewritten branch-for-branch against `DiscountPolicyGuard` so the UI is
shown the server's actual words; that is what makes those readings worth anything. One caveat about
the stub itself: the harness answers as one identity, so the queue had to be seeded as
writer@ninecube.demo and reviewed as admin@ninecube.demo through a switch the harness exposes — the
live shop gets that from the JWT subject, which is where it belongs.

The live end-to-end spec `web/e2e/coupon-scope-ui.spec.ts` still needs the owner to run it with
`NINECUBE_SEED_PASSWORD` set. Nothing about the harness survives the run: the config and its scripts
lived in `web/.ui-harness/` and are deleted, and `git status` is clean of them.

Loose ends on this machine, none of them the project's: stale dev/stub servers are still listening on
127.0.0.1:5178, 5199, 5221 and 5241 (the last two are this round's harness, the first is Round 13's).
Killing arbitrary processes is blocked here, so they need to be ended by hand; the repo points at none
of them. The verification container `ninecube-verify-pg` on port 5433 is also still up.

## Left alone deliberately

The navbar's amber selected tab and the amber selected-row fill — this round touched the shared dialog,
not either of them. The scope rule engine, the stacking policy and the Round 12 reach preview are
untouched; the replay plate reads the same scope rules, it does not reinterpret them. Stock is still
not editable from any bulk path, including the new policy and queue screens.

# Round 13 — the Coupons & Discounts screen now does what its own tooltips promise

Date: 2026-11-02. Brief: "Coupons & Discount page design & make more user-friendly possible to handle it
more effectively such hover style as like this - is it possible?" with two screenshots of the live dark
admin screen. Asked which hover look and how far to go, the answer was "no preference" to both, so this
round did the hover affordances and the flow fixes underneath them.

## What the code did before, read line by line

- **Both registry tables told a lie.** Every row carried the native tooltip "Click row to select ·
  Double click to edit", but no `<tr>` had an `onClick` at all. Selection only ever happened through the
  checkbox, and only the coupon *code cell* (not the row) had the double-click to edit. The gift card
  row did have one, so the two tables on the same screen behaved differently.
- **The coupon list had no way to find a code.** The gift card list beside it already had a search box
  and four state buttons, hand-styled with inline `style` attributes and `btn btn--sm` pills instead of
  the segmented control the rest of the admin uses.
- **Both empty states looked at the wrong array.** The "no rows" test read `couponsQuery.data`, not the
  filtered list, so a search that matched nothing rendered an empty table with no message.
- **Discount type was a native `<select>`** in a builder where every other either-or choice is the
  amber segmented pill.
- **The preset rail hid five of its six cards.** `.coupon-templates__rail` was
  `grid-auto-flow: column; overflow-x: auto`, so at laptop width about two and a half presets were
  visible and the rest sat behind a sideways scroll with no affordance.
- **The preview column could not be reached.** `.voucher-ticket-container` already had
  `position: sticky` — I said last round that it did not, that was wrong — but it had no `max-height`,
  so on a short window the ticket ran past the bottom of the screen and the Create Coupon button, which
  lives under it, went with it.
- Two labels were jargon: "Quick Templates (1-Click Fill):" and "Quick Values:".

## What it is now, with the numbers read off the running screen

Registry rows (`web/src/pages/AdminPage.tsx`, `.registry-row` in `app.css`):

| Measured | Result |
| --- | --- |
| Hovered coupon row, computed background | `rgba(245, 151, 38, 0.07)` — a new `--selected-wash` token, deliberately softer than the `0.16` selected fill so a hovered row never reads as a selected one |
| Pencil glyph beside the code | opacity `0` at rest, `1` on `:hover` / `:focus-within`, `0.4` under `@media (hover: none)` where no hover state exists |
| Single click on a row | `data-selected="true"`, checkbox now checked, no dialog opened |
| Double click on a row | the Edit Coupon dialog opens |
| Click that lands on a checkbox or button inside the row | left to that control (`toggleRowSelection` bails on `button, input, label, select, a`) |

Finding a coupon (`registry-filterbar` + the shared `segmented`):

| Action | Screen says |
| --- | --- |
| Type `apex` in the coupon search | heading reads `Promotional Coupons & Discounts (1 / 5)`, table holds `APEX15` only |
| Type `Mega` | matches the campaign title, not just the code |
| Press `Disabled` | `OFFLINE` only |
| Type `zzz` | "No coupon matches that search." instead of a silent empty table |
| Press Clear | search and state both reset, count back to `(5)` |
| Gift cards tab | the same bar, same control, same behaviour (its own empty state now distinguishes "none issued" from "none matched") |

Builder flow:

- Discount type is `role="group"` "Discount type" with two `aria-pressed` options; the `<select>` is gone.
- Labels are now "Start from a preset (1-click fill):" and "Suggested amounts:".
- Preset rail at 1440: 6 cards, 5 tracks, **2 rows**, `overflow-x: visible`. At 390 the `auto-fill`
  `minmax(228px, 1fr)` collapses to one column, so nothing is off-screen at either width.

The preview column and the Create button:

| Window | Cap computed | Ticket | Create dock bottom |
| --- | --- | --- | --- |
| 1440 × 460, long ticket | `351px` | client 351 / scroll 691 → scrolls internally | 336 at rest, 444 after scrolling 900px — both on screen |
| 1440 × 760, long ticket | `651px` | client 651 / scroll 691 → scrolls internally | 487 at rest, 744 after scrolling — both on screen |

**The cap alone was not the fix, and measuring it is what found that.** With `max-height` and
`overflow: auto` on the container, `scrollHeight` equalled `clientHeight` (351 / 351) — a flex column
shrinks its children, so the ticket was being *squashed* to the cap rather than scrolled inside it, and
the bottom of it was simply clipped. `.voucher-ticket-container > * { flex: 0 0 auto }` is what turned
351/351 into 351/691. The dock itself is `position: sticky; bottom: 0` with the navbar's glass treatment
so ticket text sliding under it reads as depth, and both are lifted back to static at ≤992px where the
column is no longer sticky.

## Tests

Six new cases, all in the existing suites: `registry-tables.test.tsx` (row click selects, double click
edits, a click on a row control stays the control's, search by code and campaign title with the `1 / 2`
count and the no-match message, the state segmented narrowing to Disabled / Expired / All, and the gift
card registry on the same bar) and `coupon-builder.test.tsx` (discount type is a segmented group, not a
select). 205 tests in 31 files green. `npx tsc --noEmit` clean, `npm run i18n:check` clean (1,759
entries, no duplicate keys), `npm run build` clean.

## How this was actually verified, and what it does not prove

The agent cannot sign in to the live admin screen, so the browser pass ran the **real app** against a
throwaway stub API on port 5178 — fixture coupons and gift cards shaped like the API's own DTOs, the
session written into `sessionStorage` the way `AuthContext` writes it. 1440 × 900 and 390 × 844, light
and dark, and every number above was read out of the DOM with `getComputedStyle` and
`getBoundingClientRect`, not estimated. The harness config and its scripts were deleted after the run.

That means these are layout and behaviour numbers, not catalogue numbers: no .NET API and no seeded
Postgres were involved, and the reach-preview figures still come from Round 12's real database run. The
live end-to-end spec `web/e2e/coupon-scope-ui.spec.ts` still needs the owner to run it with
`NINECUBE_SEED_PASSWORD` set. Page horizontal overflow at 390 is 0px on both registries.

One loose end on this machine: the stub server is still listening on 127.0.0.1:5178 (PID 5388). Killing
arbitrary processes is blocked here, so it needs to be ended by hand — it is not this project's API and
nothing in the repo points at it.

## Left alone deliberately

The navbar's amber selected tab, and the amber selected-row fill — the hover wash is a separate token
precisely so it sits *under* both of them. The scope rule engine, the stacking policy and the reach
preview are untouched. Stock is still not editable from any bulk path.

# Round 12 — a coupon's scope is now a set of rules the money engine actually reads

Date: 2026-11-02. Brief: the owner asked whether one discount can cover several categories, brands or
products at once and what AND / OR would mean here, then asked for the version that is "the best one for
future enhancement as a modern and dynamic e-commerce system" and to "finish the properly".

## What the code did before, read line by line

One coupon could name one thing: `TargetType` (`Order` / `Category` / `Brand` / `Product`) plus one
`TargetId`. The evaluation in `ValidateSingleCouponEntity` opened with this guard:

```csharp
decimal eligibleAmount = subTotal;                       // the whole basket, by default
if (coupon.TargetType != CouponTargetType.Order && coupon.TargetId.HasValue && items != null && items.Count > 0)
{
    eligibleItems = ... switch { Product => ..., Category => ..., Brand => ..., _ => items };
    eligibleAmount = eligibleItems.Sum(...);
}
decimal discount = ... eligibleAmount ...
```

Two live holes, both of them the "storewide by accident" kind:

1. **A scoped coupon with no resolvable id discounted the entire basket.** `TargetId` null (or a
   `TargetType` the switch did not handle) short-circuited the whole condition, so `eligibleAmount`
   stayed at `subTotal`. Nothing checked that the id existed in the catalogue, so a template name that
   matched no row — the builder offered "Footwear", "Apex", "Duramo" against an electronics-led shop —
   produced a coupon that silently applied to everything.
2. **Asking without line items did the same.** `items is null || items.Count == 0` also skipped the
   filter, so the paths that validate on subtotal alone treated a brand coupon as storewide.

And two design limits the owner's question ran straight into: several brands in one campaign was
impossible, and the minimum order was measured on the whole basket, so BDT 4,000 of phone cases could
unlock a "spend 5,000 on Apple" deal. Stacking was hard-coded to one discount per order, chosen by
size (`manual >= bestAuto ? manual : bestAuto`), with no operator control at all.

## What it is now

- `CouponScopeRule` (`src/NineCube.Domain/Entities.cs`) — Attribute (Category / Brand / Series / Tag /
  Product) × Polarity (Is / IsNot) × many catalogue ids — with `Coupon.ScopeMatch` (Any / All) and
  `Coupon.Exclusivity` (BestOnly / StackByScope / Exclusive) plus `MinEligibleAmount`. Stored
  relationally (`CouponScopeRules` → `CouponScopeRuleValues`, both `ON DELETE CASCADE`), not as JSON,
  so a renamed brand never strands a coupon: names are resolved from the catalogue on every read.
- `CouponScopeMatcher` resolves each basket line's real category / brand / series / tag ids from the
  database (`CouponService.cs:217`) and then applies the rules. What a client claims about a product
  buys nothing — there is a test named for exactly that.
- The evaluation now fails closed: no rules means storewide and says so (`CouponService.cs:199`), a
  scoped coupon on an empty basket is refused with the scope named (`:210`), a scope that reaches
  nothing is refused (`:227`), and a rule that names nothing or points at an id that does not exist is
  refused at save time (`:329`) rather than becoming a storewide coupon later.
- `MinEligibleAmount` is measured on the qualifying lines only (`:232`); `MinOrderAmount` keeps its
  historical whole-basket meaning, so no stored campaign changes behaviour.
- Stacking is a policy the operator sets: `BestOnly` (the old one-discount rule, still the default),
  `StackByScope` (adds, but never twice on the same line), `Exclusive` (refuses to share the order).
- `POST /api/coupons/scope-preview` runs a draft scope against the live catalogue and returns products
  reached, units, exposed stock value, a forecast saving with the basis it was measured on, and the
  other live campaigns that already reach the same products.
- Migration `20261101133918_AddCouponScopeRules` copies every legacy `TargetType`/`TargetId` pair into
  a real rule, and `EffectiveRules` (`:297`) still reads an old row as one rule, so pre-migration
  coupons keep working either way.
- The builder became a guided rule set: dimension chips, search-and-pick multi-select, Include / Exclude
  per rule, Any / All, a live reach panel, and the digital voucher line that reads "Scope: Apple or
  Samsung". The registry row prints the stored rule by name and the edit dialog reads it back rather
  than starting from storewide.

## Numbers from the real shop

Measured on the throwaway verification database (the loaded catalogue: 183 active products), and
re-checked against the tables with SQL afterwards:

| scope on a 10% coupon | products reached | units | stock value reached | forecast per order |
| --- | --- | --- | --- | --- |
| Brand is Apple or Samsung | 5 / 183 | 317 | BDT 13,243,000.00 | BDT 6,510.00 |
| Brand is not Apple or Samsung | 178 / 183 | — | — | — |
| no rules (storewide) | 183 / 183 | 11,365 | BDT 223,274,266.42 | — |

The five reached products are iPhone 12, Galaxy S21, iPhone 13, Galaxy A52 and MacBook Air M5 — average
price BDT 65,100, which is where the BDT 6,510 forecast comes from: that shop's verification database
has no orders yet, so the panel says plainly that it measured against one average-priced qualifying
product. With order history it switches to the average basket multiplied by the share of stock the
scope reaches; both bases have their own test.

The complement is the number that matters for the Include/Exclude switch: 5 reached + 178 = 183, and
the browser spec asserts exactly that arithmetic against the live catalogue.

## Tests

- Backend: `src/NineCube.Tests/CouponScopeMatcherTests.cs` (12 methods) and `CouponScopeTests.cs`
  (24 methods) run against a real PostgreSQL 18 container — **45 cases, 0 failed, 50 s**. The old
  harness could not: it speaks SQL Server and the application speaks Npgsql now, so
  `Infrastructure/PostgresTestDatabase.cs` (Testcontainers by default, `TEST_POSTGRES_CONNECTION` to
  reuse an instance) is the template for anything else that needs the real engine.
- Frontend: `web/src/test/coupon-scope.test.tsx` (7 tests) — the payload the builder sends, Any
  widening and All narrowing, the refusal to save an empty rule, the exclusion wording on the voucher,
  the edit dialog reading a stored scope back and keeping it on save, the registry row printing
  "Apple or Samsung" rather than an id or "All products", and the conflicting-campaign list.
  Full suite: **31 files, 199 tests green**.
- Gates after the last edit: `npx tsc --noEmit` clean, `npm run i18n:check` 1,752 entries,
  `npm run build` fine (`AdminPage` 83.68 kB, the builder got a rule engine and lost 100+ lines of
  hand-rolled target code).
- Browser: `web/e2e/coupon-scope-ui.spec.ts` drives the real stack (light, dark, 390 px). It covers the
  rule chips, the reach figures the server actually answered, the 5 → 178 complement, the restore, the
  stacking and minimum-in-scope controls, the create, the registry row and the edit dialog, then
  deletes the coupon through the API and proves the scope rows went with it.
- Screenshots: `web/artifacts/scope/` — builder at 1440 in both themes, the phone layout, and the
  390 px run reporting no horizontal overflow.

**Honest status of that last spec:** the two theme scenarios passed every step up to the registry row
and then timed out waiting for it on this machine, because the coupon list refetch after a create is a
catalogue-backed page and this box is running about twenty containers. The assertion now waits for the
`GET /api/coupons` response itself instead of guessing at a budget, and the row text it checks is
asserted in the Vitest suite that CI runs. It still needs one run with `NINECUBE_SEED_PASSWORD` set to
be called green end to end:
`cd web && NINECUBE_SEED_PASSWORD='<demo password>' E2E_API_BASE=http://127.0.0.1:5099 E2E_BASE_URL=http://127.0.0.1:5199 npx playwright test e2e/coupon-scope-ui.spec.ts`.

## Left alone deliberately

- `MinOrderAmount`, the free-shipping threshold, discount types, caps, the whole coupon API surface for
  existing clients, and `TargetType`/`TargetId` (still written, still read for legacy rows).
- Every stored campaign keeps `BestOnly`, so nothing about today's discounts changes.
- The amber selected tab in the navbar, the category / brand / tag / stock / URL filter rules, and
  stock staying out of bulk edit.
- The builder's quick templates still suggest footwear and Apex names that this catalogue does not
  carry. They are now harmless — a template that resolves to nothing cannot be saved — but they are
  misleading, and rewriting them to match the shop is a separate call.

## Environment gaps found on the way, not fixed here

- CI's `pages.yml` runs the frontend gates and never `dotnet test`, so the backend scope engine has no
  automated gate. The legacy MSSQL test harness cannot run against Postgres; the new fixture can.
- `docker-compose.yml`, `.env.example` and the root `.env` still describe SQL Server while the code
  needs PostgreSQL, and `.env`'s third line is not sourceable from a shell (the quoted connection
  string breaks it).
- `render.yaml` carries a committed `NINECUBE_SEED_PASSWORD`. It should come from the environment.
- The seeded demo coupon `APEX15` points at brand id 1, which in the loaded catalogue is literally
  named "ching's" (Apex is id 20). The new registry column is what surfaced it: the row now prints the
  real name instead of the intended one. Not truncation — a hardcoded id in the seeder.

# Round 11 — the admin record dialogs were bottom sheets wearing a modal's clothes

Date: 2026-11-01. Brief: two screenshots of the Edit Coupon and Edit Gift Card dialogs, "both edit
pages not shows in the proper position in hovour and give this system relevent design".

## The real cause, measured before touching anything

The app already has one dialog component — `Modal` in `web/src/components/ui.tsx`, which six other
screens use. The seven admin record dialogs were written by hand instead, and four of the six
overlays (`edit coupon`, `delete coupon`, `edit gift card`, `delete gift card`, plus bulk review) were
wrapped in `.sheet-backdrop`. That class is the mobile bell/cart bottom sheet: `app.css:748` sets
`align-items: flex-end` with no padding. The remaining two (certificate viewer, adjust balance) hand-
rolled their own `position: fixed` layer. Chromium at 1440×900 and 390×844, light and dark:

| measured (Edit Coupon, 1440) | before | after |
| --- | --- | --- |
| distance from the dialog to the top edge | 317 px | 116 px |
| distance to the bottom edge | **0 px** | 116 px |
| vertical offset from the viewport centre | −175 px | **0 px** |
| backdrop blur | none | `blur(4px)` |
| Escape closes it | **no** | yes |
| fields whose `<label>` points at nothing | **7 of 7** | 0 of 7 |
| colour emoji in the dialog | 1 (`✏️`) | 0 |
| inline style properties on the dialog box itself | 8 | 0 |

So "not in the proper position" was exact: the dialog was pinned to the bottom edge of the screen and
offset 175 px below the centre, with no gap under it. The off-centre was not a transformed ancestor —
the probe walked the parent chain for `transform`/`filter`/`backdrop-filter`/`contain` and found none.
`modern.css:325` already carried a `.sheet-backdrop:has([aria-label='Your cart'])` override to pull
*one* sheet back to centre, which is how the mismatch was being lived with.

The unlabelled fields are a separate defect the same dialogs carried: `<div className="field">` held a
`<label>` and an `<input>` as siblings with no `for`, so clicking a label did not focus its input and
assistive tech announced all 7 coupon and 4 gift-card controls as nameless.

## What was changed

- `Modal` grew four props instead of the dialogs growing their own markup: `title` now takes JSX (a
  string is still translated), `footer` renders the action row, `footerClassName` centres it for
  confirmations, `size` picks 640/540/460 px, and `alert` announces a destructive question as an
  `alertdialog`. All six existing `Modal` call sites are untouched and still get the same dialog.
- All seven admin dialogs now render through it, so they inherit what the hand-rolled ones did not
  have: the centred `.modal-backdrop`, the 4 px blur, `data-overlay-open` (which stops the page behind
  scrolling), Escape to close, a focus trap and focus returned to the row that opened it.
- The editors read like the builders they belong to: the record code moved out of the sentence into a
  `.modal__code` chip beside a sprite `pencil`, the fields grouped under the builder's own section
  titles (`Discount Value & Calculation`, `Minimum Spend & Usage Limits`, `Active Dates & Campaign
  Placement`, `Recipient`, `Greeting & Validity`) with the same `.discount-card-flag` pills, and the
  two placement checkboxes moved into the builder's `.discount-toggles` column. The dialog stays the
  only surface on screen — sections divide with a hairline, not a nested card.
- Every control got an `id` and a matching `htmlFor`. The footer's Save button lives outside the form
  and submits it through `form="edit-coupon-form"` / `form="edit-giftcard-form"`, which the new test
  proves reaches the same `PUT` with the same body as before.
- 10 emoji glyph sites in the seven dialogs (pencil twice, trash three times, gift, dice, clipboard
  twice, gear) became sprite icons (`pencil`, `sliders`, `gift`, `copy`, `trash`); the trash sits in a
  `.modal__confirm-glyph` danger-tinted disc instead of a loose 36 px emoji. The bulk deletion list
  moved from an inline-styled box into `.modal-list`.

## Measured after

Across all four width × theme combinations, for all five dialogs an operator can actually reach
(coupon editor, gift card editor, certificate viewer, adjust balance, bulk delete review):
`centreOffsetX: 0` and `centreOffsetY: 0`, `gapTop === gapBottom` (116/116, 202/202, 219/219,
282/282, 280/280 at 1440), no clipping at any edge, no horizontal overflow inside the dialog,
`border-radius: 22px` and `backdrop-filter: blur(4px)` from the shared sheet, 0 emoji, 0 unlabelled
controls, and Escape closes every one of them. `npm run build` reports `AdminPage` at 75.74 kB — the
dialogs got smaller as well as shorter.

## Left alone deliberately

- The cart and notification bell sheets still use `.sheet-backdrop`. They are meant to come up from the
  bottom on a phone; only the record dialogs were wearing the pattern by mistake.
- The gift certificate artwork inside its dialog keeps its own inline styling (dark plate, gold
  numbers). That is the certificate, not the dialog furniture, and it was approved as drawn.
- The two single-record delete confirms (`deletingCoupon`, `deletingGiftCard`) are unreachable: nothing
  in the toolbars ever calls their setters, so the trash button always opens the bulk review. They were
  restyled to match rather than deleted, because removing an operator-visible path is a call to make
  separately. Say the word and the dead state, dialogs and mutations come out.
- No field, no label wording, no request body and no validation rule changed. Discount type is still
  fixed at creation, exactly as it was.

## Tests

`web/src/test/admin-dialogs.test.tsx` (new, 5 tests): the coupon editor resolves to `.modal` inside
`.modal-backdrop` and never `.sheet-backdrop`, Escape closes it, the code chip and sprite-only title
are present; all 7 controls are label-associated and the three section titles are the builder's; the
footer Save submits the form outside it and the `PUT /api/coupons/1` body carries the edited value;
the gift card editor does the same on `PUT /api/gift-cards/1`; a two-row deletion opens an
`alertdialog` whose glyph is an `svg` with no text and whose `.modal-list` names both codes.
Full suite: 30 files, 192 tests green. `npx tsc --noEmit`, `npm run i18n:check` (1,703 entries, no new
keys needed — the section titles were already in the catalogue) and `npm run build` all pass.

# Round 10 — the two admin registries were not built the same way

Date: 2026-11-01. Brief: a screenshot of each registry table, "design review and matching to the system
current themes with relevancy state".

## What the review found, measured in the browser first

Both tables were probed at 1440 and 390, dark and light, before anything was changed. Five real
mismatches came out of it, plus one dead CSS rule that affects the whole app:

1. **Only one of them sits on a plate.** `.table-surface` — the solid, bordered, rounded surface every
   other table in the app uses (10 of 12 table sites, including the coupon registry two tabs away) —
   was missing from the gift registry, which instead wrapped its whole panel in `.card-glass`. Measured:
   coupon `hasSurface: true`, plate `1px border / 22px radius / shadow`; gift `hasSurface: false`.
2. **The selection counter disappears when you use it.** Both registries switch their "N selected" chip
   to `badge--primary` once a row is checked, and `badge--primary` is defined in no stylesheet. At 0
   selected the chip computed to `background rgb(52,59,73), border rgb(224,230,240)`; at 1 selected it
   computed to `rgba(0,0,0,0)` on both — the pill lost its fill and its edge at the exact moment it
   matters.
3. **Colour emoji stood in for the icon system.** The gift rows carried `🔒`/`👁️` and `📋` as the reveal
   and copy controls (3 cells), and the coupon rows prefixed every scope with `🛒  🏷️ `, marked
   automatic coupons with `🤖` and banners with `📢` (12 cells). Emoji ignore `currentColor`, so they
   rendered identically in both themes and did not match the stroke sprite used everywhere else.
4. **The `🤖 Automatic` chip was not a badge at all.** It carried the base `.badge` class with an inline
   `background: var(--surface-sunken)` and `font-size: 10px`, so it had no tone and no border while every
   real badge beside it has both.
5. **The two tables disagreed about the same word.** `Disabled` was `badge--warn` on a gift card and
   `badge--neutral` on a coupon. `Expired` and `Depleted` shared one grey, so a card whose time ran out
   looked identical to one whose balance ran out, and neither looked different enough from a card an
   operator deliberately switched off. No status badge in either table carried the glyph that
   `app.css:663` requires ("Status is never conveyed by colour alone").
6. **`td .num, th .num` matched nothing.** The rule that right-aligns and tabulates money columns was
   written as a descendant selector while every call site puts the class on the cell itself — so all 44
   numeric cells across four pages were left-aligned and their digits did not line up.

## What was changed

- The gift panel is now the same shape as the coupon panel: plain `stack` outside, `.table-surface`
  around the table. Both registries measure `hasSurface: true` with the identical plate at all four
  width × theme combinations, and both tables are 1374 px wide at 1440 (the gift one was 1342).
- `.badge--primary` now exists, built from the same amber tokens as the selected nav tab
  (`--selected-bg`, `--accent-text`, `--selected-bar`). With a row selected the chip computes to
  `rgba(245,151,38,0.16)` on `rgb(245,151,38)` in dark and `rgb(255,241,214)` on `rgb(217,119,6)` in
  light.
- Every emoji in the two tables is a sprite icon that inherits the theme: `eye`/`hidden` and `copy` on
  the code cell, `folder`/`tag`/`box`/`cart` on the scope line, `bolt` on Automatic, `megaphone` on the
  banner chip. Gift table emoji cells: 3 → 0. Coupon scope and chip cells: 0.
- The state vocabulary is now one vocabulary across both tables and reuses the glyphs the order badges
  already teach: Active `✓` ok, Scheduled `◔` warn, Disabled `⊘` neutral, Expired `✕` danger,
  Depleted `○` neutral. Every status badge carries a `.badge__glyph`.
- `td.num, th.num` is a cell selector, so the discount, minimum-order and usage columns right-align, the
  gift balance column right-aligns with its meter under it, and the 102 numeric cells on the inventory
  ledger finally align. The cap line under a percentage discount got `.cell-sub` (`display: block;
  white-space: nowrap`) so right-aligning the column did not break "Cap: BDT 2000" across two lines.
- Both registry tables got a `visually-hidden` `<caption>` like every other table in the app, and the
  coupon empty-state row's `colSpan` was corrected from 9 to its actual 8 columns.

## Measured after

At 1440 and 390, dark and light, on the running app: page-level horizontal overflow unchanged at
**0 px** (1440 and 390 both report `scrollWidth` equal to the viewport; the tables scroll inside their
own plate at 1141 px and 902 px on a phone). Inline-styled nodes inside the tables: coupon 16 → 9, gift
33 → 18. The staff order console, the customer order list and the staff product table were re-checked
because the `.num` fix is global: no new overflow, and the inventory ledger reports `align: right,
font-variant-numeric: tabular-nums`.

## Tests

`web/src/test/registry-tables.test.tsx` is new, 4 tests: both registries sit on `.table-surface` and not
inside `.card-glass`; the scope cells contain no pictographic emoji; every status badge carries a glyph
and the four gift states plus the coupon `Disabled` land on the tones named above; checking a row moves
the counter from `badge--neutral` to `badge--primary`. `npx tsc --noEmit` clean, `npm run i18n:check`
clean at 1,703 entries, `npm run build` clean, `npm run test:run` **187 tests in 29 files green**.

## What was deliberately left alone

The campaign titles in the coupon table still contain emoji (`⚡ Flash Sale: …`) because that text is the
operator's own campaign copy, stored with the coupon and shown to customers on the banner — stripping it
would change what a shopper sees, not how the table is built. The gift registry's search box and its
All / Active / Depleted / Disabled filters were kept exactly as they work, and no filter bar was added
to the coupon registry, since neither was asked for. The bulk-action docks, the row selection
behaviour, the certificate modal and every API payload are untouched.

# Round 9 — the gift card builder takes the same shape as the coupon builder

Date: 2026-11-01. Brief: "same way gifts card parts also design as like this way", with a screenshot of
the admin Gift Cards tab.

## What the tab was

Issuing a card meant one long stack of inputs with a preview buried underneath, and four numbers an
operator had to arrive at themselves: the balance, the recipient string, the greeting, and the date the
card stops working. Nothing on the screen said what any of those produced until the certificate was
already drawn. The coupon tab had just been rebuilt into a preset rail, four numbered decision cards and
a live preview that reads the form back as plain rules; the gift tab now uses that same system, the same
classes and the same tokens, so the two admin builders are visibly one product.

## What it is now

- A preset rail above the form: Birthday (BDT 1,000), Eid Mubarak (BDT 2,500), VIP Executive (BDT 5,000)
  and Welcome Bonus (BDT 500). Each card states the balance chip, the recipient name and the validity it
  writes — `Eid Celebrant · 1 year` — and a click fills all four fields and mints a fresh code. The
  preset stays lit while the three values it wrote are still on the card, so editing the code or the
  exact date does not silently deselect it.
- Four numbered step cards on the left — Card Value, Redemption Code, Recipient, Greeting & Validity —
  each with a header flag that reads with the content (`BDT 2,500`, `Your own code` vs `Generated on
  issue`, `Optional`, `Expires 2027-11-01` vs `Never expires`), quick pills for the balances and for
  6 months / 1 year / 2 years / No expiry, and a "366 days left" line under the date so the operator does
  not have to do the arithmetic.
- The certificate itself on the right, unchanged in look, with a Certificate Summary under it that
  spells out balance, code, recipient, greeting and validity in words, then the amber issue button and
  one line saying whether the card is ready to issue.
- The 🎲 emoji that used to sit on the certificate and the raw 🎁 in the rail heading are now sprite
  icons (`box`, `gift`), matching the coupon ticket; `gift`, `cake`, `moon` and `crown` joined the
  sprite for the presets.

## The real defect found on the way

The registry table under the form was wrapped in `<div className="table-wrap">`, and `table-wrap` has no
rule in any stylesheet — the class did nothing. At a 390 px viewport the 924 px table therefore widened
the document to 953 px, i.e. **563 px of page-level horizontal overflow**, and the whole admin screen
scrolled sideways. Switched to `.table-scroll`, the scroller every other table in the app already uses.

## Measured, on the running app

Both states (empty form and preset-filled) at 1440 and 390, dark and light, against a locally started
stack (throwaway Postgres, API on 5081, Vite on 5173):

- Page-level horizontal overflow: **0 px at 1440 and 0 px at 390** (was 563 px at 390).
- Remaining scrollers at 390 are the two intentional ones: the preset rail (492 px) and the registry
  table (544 px).
- Issue button computed background: `linear-gradient(150deg, rgb(255, 195, 107), rgb(255, 171, 77))` —
  the same amber as the coupon CTA.
- Exactly one preset reports `aria-pressed=true` after a click; every preset run produced a code of the
  form `GC-XXXX-XXXX-XXXX`.

## Tests

`web/src/test/gift-card-builder.test.tsx` is new: the four presets state their balance, recipient and
validity before being applied; clearing the value disables issuing and names what is missing; clicking a
preset fills value, recipient and greeting, mints a valid code, marks itself pressed and its neighbour
unpressed, enables the button and swaps the hint to the ready line. `npm run typecheck` clean,
`npm run test:run` **183 tests in 28 files green**, translation audit clean at 1,701 entries.

## Left alone deliberately

The shared `.gift-card-cert` certificate styling, the registry table and its bulk-action dock, the
edit/adjust/delete dialogs, and every piece of the create/update gift-card payloads and state setters —
this round changed how the existing fields are arranged and described, not what is sent. The coupon tab
was not touched.

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
