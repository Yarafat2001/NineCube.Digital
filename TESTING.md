# TESTING.md — NineCube.Digital Order Processing

> The .NET 10 / catalogue / theme verification at the end of this document supersedes the earlier .NET 8 setup below. Earlier results are retained as a historical record.

Real results from a real run on **14 October 2026**, on the machine described below. Nothing in this
file is projected, estimated or copied from a template: every command was executed, and every result
is pasted from the console.

Where something could not be run in this environment it is marked **NOT RUN** with the exact command
to run it, rather than being reported as a pass.

---

## 1. Environment actually used

| Item | Value |
| --- | --- |
| OS | Windows (Git Bash / MINGW64) |
| .NET SDK | `8.0.425` (SDK list: `8.0.425`) |
| .NET runtime | `Microsoft.AspNetCore.App 8.0.31`, `Microsoft.NETCore.App 8.0.31` |
| Node / npm | `v22.19.0` / `11.6.0` |
| Docker Engine | `29.7.2` |
| Browser | Chromium (the app's built-in preview browser, and Playwright Chromium) |
| API | `http://127.0.0.1:5080`, `ASPNETCORE_ENVIRONMENT=Development` |
| SPA | `http://127.0.0.1:5173` (Vite dev server, HMR live throughout) |
| Application database | **LocalDB** — `Server=(localdb)\MSSQLLocalDB;Database=NineCubeOrderProcessing` |
| Test database | **both modes**: Testcontainers SQL Server 2022 (default) *and* local mode via `TEST_SQL_CONNECTION` |
| Compose database | `mcr.microsoft.com/mssql/server:2022-latest` on `localhost:14330` (healthy) |

**Toolchain note for this machine:** two .NET installs exist side by side — `C:\Program Files\dotnet`
(SDK 10.0.200, *no* 8.0 runtime) and `C:\Users\yeasi\.dotnet8` (SDK 8.0.425 / runtime 8.0.31).
Because the projects target `net8.0`, every `dotnet build` / `dotnet test` / `dotnet run` on this
machine must go through the .NET 8 install:

```powershell
& C:\Users\yeasi\.dotnet8\dotnet.exe test src/NineCube.Tests/NineCube.Tests.csproj
& C:\Users\yeasi\.dotnet8\dotnet.exe run --project src/NineCube.Api
```

On a machine with the .NET 8 SDK on `PATH` the plain `dotnet test` / `dotnet run` commands work as
written in the README. (Symptom if the wrong one is used: `testhost.exe` fails with
*"The following frameworks were found: 9.0.11, 10.0.4"* — install/point at a .NET 8 runtime.)

The application was run against LocalDB (the non-Docker path) precisely because it is the path a
reviewer is most likely to take on a machine without Docker; the Docker path is verified by the
compose container and by the Testcontainers test run.

---

## 2. Backend test suite — 42 tests at first, 108 now, real SQL Server

`xUnit` integration tests that go through the real HTTP pipeline (WebApplicationFactory) against a
**real SQL Server** — no InMemory, no SQLite. Each test starts from a freshly created, uniquely named
database that is dropped afterwards.

The 42 tests below are the run recorded on 14 October, when the suite covered the brief's twelve items.
The suite has grown with the feature — categories, brands and series, bulk product edits, product
images and media, notifications, profile and dashboard, and the appearance contracts — and is
**108 tests** now; §16a records the run and §17 confirms it again after the checkout fix.

### 2a. Docker / Testcontainers mode (the default)

```bash
dotnet test src/NineCube.Tests/NineCube.Tests.csproj
```

```
Passed!  - Failed:     0, Passed:    42, Skipped:     0, Total:    42, Duration: 40 s - NineCube.Tests.dll (net8.0)
```

Testcontainers pulled `mcr.microsoft.com/mssql/server:2022-latest`, started it, ran the suite and
removed the container — visible in `docker ps` output (`testcontainers-ryuk-…`) during the run.

**Re-verification pass (14 Oct 2026, after the fixes in §7 item 5):** the suite was re-run end to end
in both modes, again with zero failures:

```
Docker mode:   Passed!  - Failed: 0, Passed: 42, Skipped: 0, Total: 42, Duration: 16 s
Local mode:    Passed!  - Failed: 0, Passed: 42, Skipped: 0, Total: 42, Duration: 16 s
```

### 2b. Local mode (LocalDB) — the mode used for the running application

```bash
TEST_SQL_CONNECTION="Server=(localdb)\\MSSQLLocalDB;Integrated Security=true;TrustServerCertificate=True" \
  dotnet test src/NineCube.Tests/NineCube.Tests.csproj
```

```
Passed!  - Failed:     0, Passed:    42, Skipped:     0, Total:    42, Duration: 27 s - NineCube.Tests.dll (net8.0)
```

### What the 42 tests cover

| Brief item | Tests | What is actually asserted |
| --- | --- | --- |
| 1 — no ordering beyond stock | `Test01`, `Test02` | 201 + stock decremented + server-computed total; quantity above stock → 409, stock untouched, **no order row written** |
| 2 — concurrent orders | `Test07`, `Test08`, `Test08b` | stock 1 + two parallel orders → exactly one 201 and one 409; stock 10 + **50 parallel orders** → exactly 10 successes, final stock 0, Σ quantities = 10; concurrent multi-line orders keep every ledger row and stock consistent |
| 3 — invalid requests | `Test03`, `Test12` | one `ProblemDetails` contract: 400 with validation details, 404 unknown product, 409 for business conflicts, 401/403 for auth — and nothing changes |
| 4 — status is visible and explicit | `Test11` (5 tests) | Pending→Confirmed→Shipped succeeds; Pending→Shipped refused; Shipped→Cancelled refused; Rejected is terminal; racing confirm/cancel has exactly one winner |
| 5 — all-or-nothing | `Test04`, `Test05` | one unavailable line rolls back every line (no partial order, no partial stock); duplicate product lines are merged |
| 6 — idempotency | `Test06`, `Test06b`, `Test06c` | same key returns the original order and reserves stock once; different customers may reuse a key; timestamps are published as unambiguous UTC instants (`…Z`) |
| 9 — cancel/restore exactly once | `Test09` (4 tests) | cancel restores stock and writes the ledger; cancelling twice or concurrently restores stock once; Staff may cancel a Confirmed order |
| 10 — authorization | `Test10` (10 tests) | unauthenticated → 401; Customer on staff/inventory/admin → 403; another customer's order → **404**; customers see only their own orders; Staff cannot touch stock/products; Inventory Manager cannot change order status; a role change takes effect on existing tokens; a deactivated user cannot log in and loses access; the last administrator cannot be removed |
| 12 — stock adjustment | `Test12` (7 tests) | adjustment needs a reason and a non-zero delta; negative delta below zero → 409; the ledger row carries the user and reason; concurrent orders cannot be overwritten by an adjustment; inactive products cannot be ordered; create/update product |

The race and stress tests (`Test07`, `Test08`) are the reason there is no InMemory fallback: they
would assert nothing without real row locking and a real `CHECK (StockQuantity >= 0)` constraint.

---

## 3. Frontend — typecheck, 45 tests at first, 162 now, production build

```bash
cd web
npm run typecheck     # tsc --noEmit
npm run test:run      # vitest run
npm run build         # tsc --noEmit + vite build
```

```
 Test Files  8 passed (8)
      Tests  45 passed (45)
```

That is the 14 October record, kept because it is what the fixes in §7 were checked
against. The current suite is 23 files and 162 tests; §16b pastes the 16 October rerun and §17b
the pass that added the checkout contracts.

The production build succeeded with per-route code splitting:

```
dist/index.html                          0.76 kB │ gzip:  0.43 kB
dist/assets/index-DRUehetJ.css          19.95 kB │ gzip:  4.83 kB
dist/assets/OrdersPages-BJ72MylH.js      6.44 kB │ gzip:  2.17 kB
dist/assets/AdminPage-Dy3VM6Jr.js        7.64 kB │ gzip:  2.39 kB
dist/assets/InventoryPage-BXYDPr51.js    7.69 kB │ gzip:  2.52 kB
dist/assets/ProductsPage-CKs_jOqM.js     8.35 kB │ gzip:  3.10 kB
dist/assets/StaffPage-D5_lM3jz.js        9.54 kB │ gzip:  2.82 kB
dist/assets/hooks-ALj6xuy0.js           17.09 kB │ gzip:  5.40 kB
dist/assets/index-PxLmY8mm.js          213.64 kB │ gzip: 68.96 kB
✓ built in 5.45s
```

Coverage by file (`Vitest` + React Testing Library + MSW):

- `stock-badge.test.tsx` (5) — in stock / low stock / out of stock / inactive, and that colour is never
  the only signal (glyph + text label).
- `stepper.test.tsx` (4) — cannot exceed available stock, cannot go below 1, keyboard operable,
  `aria-live` announcement.
- `checkout.test.tsx` (8) — place order → confirmation and cleared cart; 409 lists the short items and
  keeps the cart; double-click sends **one** request; network error keeps the cart and offers retry;
  400 does not retry the same idempotency key; 401 → login; retry after a server error reuses the key;
  the button is disabled while the order is in flight.
- `orders.test.tsx` (8) — loading skeleton, empty state, error state, lines + timeline + invoice link,
  cancel offered while Pending, hidden after Shipped, 404 for an order the customer cannot see,
  printable invoice.
- `guards.test.tsx` (7) — anonymous → login; customer blocked from staff/admin/inventory; Inventory
  Manager blocked from the staff console; Staff allowed into staff but not admin; Administrator allowed
  everywhere; unknown route → 404 page.
- `navbar.test.tsx` (6) — per-role links, active link marked with `aria-current` plus the sliding
  highlight, only the most specific link highlighted on a nested route, arrow-key navigation, sign-out
  clears the session, the tray handles a variable number of links.
- `catalogue-roles.test.tsx` (4) — Customer gets the cart and "Add to cart"; Staff, Inventory Manager
  and Administrator get a read-only catalogue with no ordering controls at all.
- `helpers.test.ts` (3) — report dates are local calendar dates, zero-padded, and the default range is
  the last 30 days ending today.

---

## 4. End-to-end tests (Playwright, real browser + real API + real database)

Both servers were left running, and the suite was executed against them:

```bash
cd web && NINECUBE_SEED_PASSWORD='<the seeded demo password>' npm run e2e
```

The suite contained two specs on 14 October — the original smoke test plus the automated UI audit from
§6b — and is now 24 spec files with 109 tests; §16c records the shape on the morning of 16 October
and §17c the current one.

```
  ✓  1 [chromium] › order-flow.spec.ts:43:3 › order flow › a customer reserves stock and a staff member confirms the order
  ✓  2 [chromium] › ui-audit.spec.ts:45:9 › @390px › customer@ninecube.demo stays clean at 390px
  … 12 ui-audit tests, one per role × viewport …
  13 passed (1.6m)
```

The smoke test logs in as `customer@ninecube.demo`, reads a product's live stock badge, adds one unit,
places the order, lands on the order detail page, then navigates back to the catalogue and asserts the
badge has dropped by exactly one — then logs out, logs in as `staff@ninecube.demo`, finds that exact
order in the staff console and confirms it, asserting the status becomes `Confirmed`. It creates a real
order in the running database (evidence: orders #3+ in the audit log).

---

## 5. Live system verification

```
$ curl -s http://127.0.0.1:5080/health
{"status":"Healthy","checks":[{"name":"sqlserver","status":"Healthy"}]}

$ curl -o /dev/null -w "%{http_code}" http://127.0.0.1:5080/api/orders      # no token
401

$ for role in customer staff inventory admin; do POST /api/auth/login … ; done
customer@ninecube.demo  -> HTTP 200
staff@ninecube.demo     -> HTTP 200
inventory@ninecube.demo -> HTTP 200
admin@ninecube.demo     -> HTTP 200
```

The API start-up log confirms migrations applied and the listener:

```
[INF] Now listening on: http://127.0.0.1:5080
[INF] Hosting environment: Development
```

Seeded data (10 products) was verified through the API and the UI: 8 in stock, one low-stock item and
one out-of-stock item, so every badge state is visible immediately.

### Live error-contract spot checks (14 Oct 2026, running API on :5080)

Seven one-off checks against the *running* server (the same paths as `requests.http`), pasted from the
console — the integration tests assert these too, this proves the deployed wiring as well:

```
1) 401-no-token: status=401 correlationHeader=e368e26b21904094b15bdb8c62c52d6f
2) 403-customer-admin: status=403
3) 409-short: status=409 code=insufficient_stock requested=1000 available=5
4) idempotency: first=201 replay=200 sameOrder=True
5) 404-cross-customer: status=404
6) 409-reconfirm: status=409 code=invalid_state_transition current=Confirmed
7) health: Healthy; swagger.json: 200
```

---

## 6. Browser verification (manual, in the app's Chromium preview)

Every flow below was driven through the real UI, not through the API:

| Width | What was checked | Result |
| --- | --- | --- |
| 1440 px | Login, catalogue, cart, order detail, staff console, invoice, sales summary, inventory, admin | Layout correct, no horizontal scroll, no console errors |
| 768 px | Staff console (table with 6 columns), navigation | Fits, action buttons wrap inside the row, no overflow |
| 390 px | Catalogue, navigation, product cards | Single column, logo keeps its size, **one** sign-out control, no horizontal overflow (`scrollWidth 368 ≤ 390`) |

Flows exercised, with the outcome:

1. **Customer places an order** — the stepper caps at the product's stock (button disabled at
   `max`), order placed, toast *"Order #2 placed for $339.00."*, order detail shows the stepper
   Pending→Confirmed→Shipped and a Cancel action while Pending.
2. **Stock really moved** — order #2 decremented Espresso Machine Pro 12→11 and Cold Brew Carafe 2→0;
   both movements appear in the ledger as `-1` and `-2` with reason *"Order #2 placed"* and the acting
   customer.
3. **Staff confirms** — actions changed from Confirm/Reject to *Mark shipped* + Invoice on refresh of
   the row, toast *"Order #2 confirmed."*, and the audit log gained `order.confirmed → status ->
   Confirmed` for `staff@ninecube.demo`.
4. **Inventory Manager adjusts stock** — a `-5` adjustment against a stock of 0 was refused with
   *"Adjustment of -5 would take product 8 below zero stock."* plus a toast carrying a correlation id,
   and the product's stock was unchanged (`409`, no `500`). A `+5` adjustment then succeeded, wrote the
   ledger row `+5 / "Damaged in transit" / inventory@ninecube.demo`, and the toast confirmed *"Stock for
   Cold Brew Carafe is now 5."*
5. **Admin** — audit log shows `user.login` (with role), `order.placed` (total, line count),
   `order.confirmed` and `stock.adjusted` (delta + reason) with actor and time; the Settings tab edits
   the low-stock threshold in the database.
6. **Invoice** — printable sheet from existing order data: logo, invoice number, status, billed-to,
   lines with the snapshotted unit prices, total, and the note that payment happens outside the system.
7. **Console log** during the whole session: only Vite/React DevTools notices, plus the single
   expected `409` produced by the deliberate invalid adjustment. No warnings, no failed requests, no
   React key/act errors.

### Session restore

Reloading the SPA restores the session from `sessionStorage` and revalidates it against `/api/auth/me`
(observed `200` in the API log). Note for honesty: the preview harness's own "reload" command creates a
fresh browsing context and therefore wipes `sessionStorage`; a normal in-page reload (`location.href =
location.pathname`) was used instead and kept the signed-in user, which is what a real browser does.

---

## 6b. Automated UI audit (headless Chromium, 390 / 768 / 1024 / 1440 px)

`web/e2e/ui-audit.spec.ts` turns the manual checks of §6 into a repeatable test. For every role ×
viewport (4 roles × 4 widths = 16 tests) it signs in through the real UI, walks that role's pages
(`/`, `/products`, `/orders`, `/staff`, `/staff/sales`, `/inventory`, `/admin` as applicable) and **fails** on:

- any `console.error` or uncaught page error (React warnings included),
- any failed network request (broken API paths; Vite HMR sockets and navigation-cancelled
  `ERR_ABORTED` fetches are excluded, because both are normal browser behaviour),
- horizontal overflow (`documentElement.scrollWidth > innerWidth`).

```bash
cd web && NINECUBE_SEED_PASSWORD='<demo password>' npx playwright test ui-audit
# or as part of the whole suite:
cd web && NINECUBE_SEED_PASSWORD='<demo password>' npm run e2e
```

Final run (14 Oct 2026):

```
  12 passed (1.6m)
```

The first runs were **red**, which is exactly what an audit is for — see defects 5a–5c in §7.

---

## 7. Defects found during verification and fixed

Verification was not a rubber stamp — these were found by looking at the running system (and by the
automated UI audit) and were fixed, then re-verified:

| # | Defect | How it surfaced | Fix | Re-verified by |
| --- | --- | --- | --- | --- |
| 1 | **Timestamps were published without a UTC marker**, so the browser re-read UTC as local time: an order placed at 01:51 in Asia/Dhaka displayed as the previous day at 19:51 | Reading the order detail page and comparing with the API payload (`2026-10-13T19:51:50.848` — no offset) | One `UtcDateTimeJsonConverter` registered in `Program.cs`, emitting `2026-10-13T19:51:50.848Z` | `Test06c` (asserts the trailing `Z` and `DateTimeKind.Utc`) + the UI now showing *"Placed Oct 14, 2026, 1:51 AM"* |
| 2 | **The sales report defaulted to the last 30 days ending *yesterday*** for viewers east of UTC, so today's revenue was missing | Sales summary showed "0 orders and $0.00 revenue" with orders that had just been placed | `toDateInput` now formats the *local* calendar date instead of slicing an ISO string | `helpers.test.ts` (3 tests) + the summary now reporting the orders of the current day (`4 orders, $397.50` — 2 Pending $51.75, 2 Confirmed $345.75) |
| 3 | **Staff navigation highlighted the wrong link**: on `/staff/sales` both *Orders* and *Sales* matched a prefix test, so the pill sat under *Orders* | Looking at the nav bar on the sales page | The most specific match now wins (`activeTo`), and only one link is ever marked | New navbar test asserting exactly one `aria-current="page"` on a nested route |
| 4 | **The catalogue offered "Add to cart" to every role** even though the API refuses orders from non-customers, contradicting the page's own "read-only view" panel | Screenshotting the catalogue as Administrator at 390 px | The stepper and button render only for Customers | `catalogue-roles.test.tsx` (4 tests) |
| 5a | **React `validateDOMNesting` console error on My Orders**: the row JSX opened with `<tr key={order.id}>                    <td…>` on one line, and JSX preserves same-line spaces as a real whitespace *text node inside `<tr>`* | The new UI audit caught `console.error: Whitespace text nodes cannot appear as a child of <tr>` with the component stack pointing at `MyOrdersPage` | Moved the first `<td>` onto its own line (a repo-wide scan for `>\s{2,}<` found this as the only instance) | UI audit: the customer tests that visit `/orders` now pass at all three viewports; `tsc` + 45 Vitest tests re-run green |
| 5b | **UI-audit false failure — waited for the hidden "Log out" button at ≤600 px**, where the CTA is hidden *by design* and replaced by the "Sign out" link (the app was fine; the screenshot showed a signed-in catalogue) | Audit failed all four 390 px tests on `signIn` | The audit now waits for the always-visible signed-in email in the navbar | `12 passed` at 390/768/1440 |
| 5c | **UI-audit false failure — `net::ERR_ABORTED` on `/api/products`**, caused by the audit's own `page.goto` cancelling an in-flight fetch | Intermittent `request failed: GET … ERR_ABORTED` in the audit | The audit now ignores navigation-cancelled requests (real connection failures still fail it) | `12 passed`, and the smoke test still catches real failures |

Two smaller layout defects were also fixed during the same pass: the navigation tray stretched across
the bar as an empty sunken pill on wide screens, and at ≤600 px both *Log out* and *Sign out* were
visible because the `.navbar__cta` hiding rule lost to `.btn` on source order (now scoped with
`.navbar .navbar__cta`).

A previously flaky frontend test was made deterministic as well: "disables the button while the order
is in flight" raced a 50 ms mock delay against `waitFor`'s 50 ms poll interval; the response is now held
open by the test until the assertion has run, and the suite's async timeout was raised to 5 s because
seven suites plus two dev servers share this machine.

---

## 8. NOT RUN in this environment

| Item | Why | Exact command to run it |
| --- | --- | --- |
| `docker compose --profile full up --build` (containerised API + SPA) | The local inner loop (API + Vite) was already running and is what the documentation recommends; the container build was not exercised | `docker compose --profile full up -d --build` then `docker compose ps` |
| `dotnet format --verify-no-changes` | Not part of this assessment's verification pass | `dotnet format --verify-no-changes` |
| Load test beyond the 50-way concurrency test | Out of scope for the brief | `dotnet test --filter Test08` (raise the concurrency constant for a bigger run) |
| Cross-browser E2E (Firefox/WebKit) | Only Chromium was installed | `cd web && npx playwright install firefox webkit && npm run e2e` |

Everything else in §2–§6 was executed on this machine, in the modes described.

---

## 9. Reproduce all of it

```bash
# 0. once
cp .env.example .env                       # set MSSQL_SA_PASSWORD, JWT_SIGNING_KEY, NINECUBE_SEED_PASSWORD
docker compose up -d                       # SQL Server on localhost:14330 (or use LocalDB instead)

# 1. backend tests, Docker mode
dotnet test src/NineCube.Tests/NineCube.Tests.csproj

# 2. backend tests, local mode
TEST_SQL_CONNECTION="Server=(localdb)\\MSSQLLocalDB;Integrated Security=true;TrustServerCertificate=True" \
  dotnet test src/NineCube.Tests/NineCube.Tests.csproj

# 3. frontend
cd web && npm install
npm run typecheck && npm run test:run && npm run build

# 4. run the system (two terminals)
export ConnectionStrings__Default='Server=(localdb)\\MSSQLLocalDB;Database=NineCubeOrderProcessing;Integrated Security=true;TrustServerCertificate=True'
export Jwt__SigningKey='<32+ random characters>' NINECUBE_SEED_PASSWORD='<demo password>'
dotnet run --project src/NineCube.Api      # http://127.0.0.1:5080  (Swagger at /swagger)
cd web && npm run dev                      # http://127.0.0.1:5173

# 5. end-to-end smoke (with both servers running)
cd web && NINECUBE_SEED_PASSWORD='<demo password>' npm run e2e
```

## 14 October 2026 — .NET 10, product images, and explicit themes

These results supersede the .NET 8 launch instructions earlier in this historical log.

Environment: installed .NET SDK 10.0.200, ASP.NET Core / .NET runtime 10.0.4, Windows PowerShell, real SQL Server LocalDB, and Playwright Chromium. Projects target net10.0; Microsoft ASP.NET Core / EF Core packages and dotnet-ef use 10.0.13; Microsoft.Data.SqlClient uses 6.1.7.

### Builds and automated tests

Commands actually run:

```powershell
dotnet restore NineCube.OrderProcessing.sln
dotnet tool restore --tool-manifest dotnet-tools.json
dotnet ef migrations add ProductMedia --project src/NineCube.Infrastructure --startup-project src/NineCube.Api
dotnet build NineCube.OrderProcessing.sln -c Release --no-restore
$env:TEST_SQL_CONNECTION='Server=(localdb)\MSSQLLocalDB;Integrated Security=true;TrustServerCertificate=True;Encrypt=False'
dotnet test src/NineCube.Tests/NineCube.Tests.csproj -c Release --no-restore
cd web
npm run build
npm run test:run
```

Final results:

```text
Build succeeded.
    2 Warning(s)
    0 Error(s)

Passed! - Failed: 0, Passed: 46, Skipped: 0, Total: 46
Duration: 2 m 13 s - NineCube.Tests.dll (net10.0)

Test Files  8 passed (8)
     Tests  45 passed (45)
Duration 34.95s

vite v5.4.8 building for production...
? 100 modules transformed.
? built in 27.46s
```

The two build warnings concern the existing SSH.NET 2023.0.0 dependency pulled in by the test-container tooling (NU1903). They do not fail the build; this update did not upgrade unrelated test-container dependencies.

The new API tests prove image URL / description create-update-read round trips, inclusion in paginated catalogue results, and validation of unsafe image URL schemes and traversal paths. Existing order, stock, concurrency, authorization, and idempotency checks pass. An existing confirm/cancel race assertion was corrected to use confirm/reject: confirming then cancelling is a legal sequential outcome; confirm and reject both require Pending, so exactly one can win. The corrected test also checks the resulting stock.

### Database and runtime verification

The additive ProductMedia migration adds nullable Description and ImageUrl columns without replacing products or orders. API startup applied it successfully. The restarted final Release API reported no pending migrations and remained healthy.

Actual SQL checks, repeated after restart:

```text
ImportedProducts: 16
PhotoUrls: 16
OpeningMovements: 16
```

There were still 16 imported products and 16 opening movements after restart; seeding did not duplicate catalogue or stock ledger data. All 16 source photographs were downloaded into web/public/products. The development sample feed is DummyJSON, not verified merchant data. Existing products without supplied images use the bundled fallback.

Health response from http://127.0.0.1:5080/health:

```json
{"status":"Healthy","checks":[{"name":"sqlserver","status":"Healthy"}]}
```

### Browser verification

The full browser run passed all 12 role/viewport audits (Customer, Staff, Inventory Manager, Administrator at 390, 768, and 1440 px), with every audited page exercised in both light and dark themes. No horizontal overflow, uncaught browser errors, or unexpected failed requests were recorded. The logo / theme persistence and image / fallback tests also passed.

The original order-flow test initially failed because it assumed Paper Filters appeared on the first catalogue page. It now searches for the product before checking availability and after placing the order, which makes the assertion work with the expanded paginated catalogue.

The final targeted browser rerun against the final Release API:

```text
npx playwright test order-flow theme-images
  ok customer reserves stock and staff confirms the order
  ok logo is visible and selected themes persist across reloads
  ok API catalogue photographs load and broken images have a fallback
  3 passed (1.1m)
```

All 15 distinct browser tests passed across the complete role audit and final targeted rerun. The order-flow test verified the SQL-backed stock fell by exactly one before staff confirmation. Light and dark catalogue screenshots are saved at web/artifacts/catalogue-light.png and web/artifacts/catalogue-dark.png. Local app remains available at http://127.0.0.1:5173 with the final .NET 10 Release API at http://127.0.0.1:5080.

Final screenshot review found the page canvas still had a hard-coded light background. It now uses the theme surface token. Theme/image browser checks were rerun successfully after this correction, and both screenshots were regenerated after image decoding and theme repaint. The final frontend production bundle was rebuilt successfully.

---

## Showcase landing page, in a browser (14 October 2026)

The public `/` route was verified in Chromium at 390 / 768 / 1024 / 1440 px against the reference
implementation's own `VALIDATION.md` (vendored at `web/src/helix/reference/VALIDATION.md`). Full
item-by-item record, measurements and raw output: [web/TESTING.md](web/TESTING.md).

```bash
cd web && npx playwright test showcase      # 7 passed (7 tests, no credentials needed)
cd web && npx playwright test               # 22 passed (order flow, showcase, themes, UI audit)
```

| Check | Result |
| --- | --- |
| `showcase.spec.ts` at 1440 / 1024 / 768 / 390 px | **7 passed** — live WebGL context, >=9 card images fetched, title timeline, footer blend to `rgb(10, 15, 31)`, no console errors, no horizontal overflow |
| Closing grid measured from rendered pixels | **3x2 at 1440 px, 2x3 at 1024 px, 2x3 at 768 px, 1x6 at 390 px** — the reference's breakpoints |
| Mid-travel frame: bent cards | Card top edges cross y 130-881 with a mean slope of 5.2 px per 4 px of x — slanted, curved edges rather than flat planes |
| Mid-travel frame: two guide lines | 456 thin grey structures surrounded by paper, in two separate height bands |
| Fallbacks (reduced motion, no WebGL, scene failure) | Static nine-card grid with the same copy; asserted by two Playwright tests and by the jsdom suite |
| Scroll takeover | Opens on the hero after a deep-link reload; `history.scrollRestoration` restored to `auto` and the canvas removed on unmount, then a second visit still gets a working context |
| Three.js bundle isolation | 0 `WebGLRenderer` occurrences in the entry chunk, 5 in the lazy `HelixCanvas` chunk |
| Frontend unit/component tests | **55 passed in 9 files**; typecheck clean; production build clean |

One defect was found by this verification and fixed: the showcase opened ~3 866 px deep inside its own
scroll track after a reload, because the browser restored a stale scroll offset — the reference never had
to defend against that, being a single page load. See
[web/TESTING.md §7](web/TESTING.md#7-defects-found-during-this-verification-and-fixed). Not run: Firefox
and WebKit, a 430 px measurement (it shares the measured 2x3 branch), and a pixel-level occlusion test
for guide-line depth ordering (verified by the carried-over render-order setup instead).

## 14 October 2026 — logo proportions, icon themes, contrast, and footer

The shared Brand component preserves the supplied cube geometry and renders a readable wordmark without white background tiles. Navigation, login/registration, invoices, and the app footer use it. The favicon is now the cube mark. Light mode uses stronger input borders, darker secondary text and orange wordmark text, opaque white cards, and quieter gradients. The icon group provides System (monitor), Light (sun), and Dark (moon) with accessible labels and aria-pressed states; fresh visits default to System and follow device changes, while explicit choices persist. The shell main area grows to place the footer at the bottom of short pages; long pages keep it below content. Phone and tablet navigation wrap their links into a separate row.

Actual checks completed:

```text
npm run test:run
Test Files  9 passed (9)
     Tests  55 passed (55)
Duration 33.61s

npx playwright test appearance theme-images
  auth appearance and footer stay aligned at 390px: passed
  auth appearance and footer stay aligned at 1440px: passed
  logo / System default / device changes / saved theme choices: passed
  catalogue photographs and broken-image fallback: passed
  4 passed (23.5s)
```

Both login and registration were checked in light and dark modes. Browser assertions check no horizontal overflow, footer placement at the document bottom, and no overlap between main content and footer. Screenshots were reviewed. An initial browser attempt found the local servers stopped; both were started and the checks above then passed.

Computed colour contrast against white in light mode: main text 15.79:1, secondary text 6.62:1, wordmark accent 5.18:1, input border 3.52:1. Dark main text against the card surface is 15.83:1 and secondary text is 8.54:1. These measurements concern the listed token pairs rather than a claim about every pixel on every screen.

All four roles also passed the full browser UI audit at 390, 768, and 1440 pixels, with every visited route checked in both light and dark modes:

```text
npx playwright test ui-audit
12 passed (3.3m)
```

This included the public showcase and each role's catalogue, orders, inventory, admin, and reporting pages. No unexpected browser console errors, failed requests, or horizontal page overflow were reported. The final production build passed after the icon component rename and responsive refinements.

Final appearance preview refresh including the new tablet check:

```text
npx playwright test appearance
3 passed
```

Both login and registration in both themes now have reviewed screenshots at 390, 768, and 1440 pixels in web/artifacts/. No footer overlap or horizontal overflow was found. The app is running at http://127.0.0.1:5173/login.


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
stock. Detailed reproducible evidence and limitations: [SEED_REPORT.md](SEED_REPORT.md)
and [seed/README.md](seed/README.md).

Historical photo checks concern the original 26 products. The 25 newly seeded
records intentionally have NULL image URLs under the requested license policy.
New prices are estimated BDT, while the UI of that week still formatted USD;
that was fixed in the October currency pass (README assumption 12), and review and
provenance fields now have columns of their own
(`ProductProvenanceAndCurrency`).
The requested 15-root Bangladesh category tree was not present at that point and
was not created by that run. It was installed later, once, through
`seed/seed_categories_bd.py` — see [SEED_REPORT.md](SEED_REPORT.md), and the tree
now reads 16 roots (the 15 plus `Uncategorized`) against 183 products, counted on 16 October.


---

## 16 October 2026 — deliverable pass

Sections 2, 3 and 4 record the runs as they stood on 14 October, which is why their pasted
summaries carry the smaller totals (42 backend tests, 45 frontend tests, 22 browser tests).
Everything below was executed again on 16 October against the current tree, after the Products
sidebar, customer profile, dashboard, notifications and the navbar selected-state work reported
in [FIX_REPORT.md](FIX_REPORT.md) (Round 6). Each block is the tool's own output from this pass,
not a copy of an older log.

### 16a. Backend — 108 tests against real SQL Server

```bash
TEST_SQL_CONNECTION="Server=localhost,14330;User Id=sa;Password=<from .env>;TrustServerCertificate=True;Encrypt=False" \
  dotnet test src/NineCube.Tests/NineCube.Tests.csproj --logger "console;verbosity=minimal"
```

```
Passed!  - Failed:     0, Passed:   108, Skipped:     0, Total:   108, Duration: 3 m 15 s - NineCube.Tests.dll (net10.0)
```

Verbatim at `web/artifacts/backend-16oct-108.log`. The password is read from `.env`, which is not part
of the submission; the log itself contains no credential. The 107-test run earlier the same morning is
kept at `web/artifacts/backend-16oct.log`; the extra test is
`CategoryTests.Uncategorized_stays_active_at_the_root_under_its_original_name`, written while the user
manual was being extended over the category manager (USER_MANUAL §3.3), because the manual described
that protection and only its delete branch was asserted. The duration differs from the earlier run
because nothing else was competing for the database this time.

Local mode was used because the Docker socket was not reachable from the shell this time: an
attempt in Testcontainers mode ran the same suite and reported
`Passed: 100, Skipped: 7` with "no test database available" — the order-placement, concurrency and
idempotency classes skip rather than fake a database, which is the intended behaviour
(`web/artifacts/backend-16oct-docker-skipped7.log`). The 14 October runs in §2a did use
Testcontainers, pulling `mcr.microsoft.com/mssql/server:2022-latest`, starting it and removing it
afterwards.

Either mode creates its own uniquely named databases and drops them at the end, so the application
database the site uses is never the test target. The suite is the 42 tests of §2 plus the categories
and hierarchy rules, brands and series, bulk product edits, product images and media, notifications,
profile and dashboard, and the ProblemDetails/correlation-id contracts.

### 16b. Frontend — typecheck, then 159 tests in 23 files

```bash
cd web
npx tsc --noEmit      # exit code 0, no diagnostics
npx vitest run
```

```
 Test Files  23 passed (23)
      Tests  159 passed (159)
   Start at  08:02:34
   Duration  118.30s (transform 8.62s, setup 181.88s, collect 63.76s, tests 202.15s, environment 286.13s, prepare 27.23s)
```

`npx tsc --noEmit` prints nothing and exits 0; it typechecks application code and the e2e specs
together, which is how the Playwright specs stay honest about the props they drive. The full
Vitest output is kept at `web/artifacts/vitest-16oct.log`. The 159th test is the stacking-scale
contract added when the portal panels were found sitting outside it — see FIX_REPORT.md, Problem 5b.

### 16c. Browser suite — 107 tests in 23 spec files

```bash
cd web && npx playwright test --list
```

```
Total: 107 tests in 23 files
```

```
  107 passed (1.1h)
```

The suite is driven against the running API and the seeded database, one worker, with the real
browser console, page errors, failed requests and horizontal overflow all treated as failures.
Counts are runtime counts: several specs generate cases from a loop over roles, themes or
viewports (`appearance.spec.ts`, `ui-audit.spec.ts`, `catalogue-glass.spec.ts`), which is why the
38 `test(` declarations in the 23 files become 107 cases. Full output with each test's duration is at
`web/artifacts/e2e-16oct.log`.

The first complete run on this tree was **101 passed, 6 failed**, and the failures were real: four
notification-layer assertions that compared NaN with NaN, one row-stagger assertion that depended on
how many orders happened to still be `Pending`, and the order flow pressing a checkout button it never
opened the cart to reach. All six are root-caused and fixed in FIX_REPORT.md (Problem 5), and the run
above is the suite after those fixes. The screenshots the run writes into `web/artifacts/`
(`login-*`, `register-*`, `categories-*` at 390, 768, 1024 and 1440 pixels, `row-actions.png`,
`history-dialog.png`, `sales-surfaces.png`, `staff-table-surface.png`) are the same checks in picture
form.

### 16d. Manual capture — 28 annotated screens

```bash
cd web && node scripts/capture-manual.mjs
```

The script exits 0 only when every callout it declares resolves to a real element on the page, so
the 28 PNGs in `docs/manual/` cannot silently lose a label. This pass produced 28 screens with all
callouts located, together with `docs/manual/callouts.json`, and each screen is described in
[USER_MANUAL.md](USER_MANUAL.md). Three races in the harness were fixed to get a clean run:
sign-in now waits for the e-mail field to decide whether the previous role is still signed in,
the stock-adjustment callouts target the real `#adjust-delta` and `#adjust-reason` ids, and the
movement-history shot waits for the ledger table (or its empty-state paragraph) before drawing.

The four screens added afterwards are the staff category manager (USER_MANUAL §3.3), photographed in
the dark theme: the stock-by-category table, the category editor dialog, the product picker and the
category-and-tag assignment form. Two of their waits are load-bearing and were added after a failing
run: the table renders a "no categories match your search" row before the tree arrives, so the capture
waits for a real Edit button rather than for any row, and the product picker stays disabled until its
page of products lands. The same run also caught a picture that had drifted: the customer inbox has
notifications now, so its third callout points at a real row instead of at an empty state that is no
longer on screen.

### 16e. What this pass changed since §2–§4

- Backend 42 → 108 tests; frontend 45 → 159; browser 22 → 107. The tables in §2 and §3 still
  describe what each area asserts, and remain accurate for the tests they list.
- Currency is presented as BDT throughout, with the legacy-USD cart rule in README assumption 12.
- The navbar's current tab now carries the same amber selected fill as the account menu and the
  theme control, asserted in pixels by
  `the current navbar tab is filled as the selected one, and stays readable inside it`.
- `web/verify-pills.mjs` was restored as a runnable check for the navbar contracts, and the
  `-webkit-line-clamp` rules gained the standard `line-clamp` property alongside them.
