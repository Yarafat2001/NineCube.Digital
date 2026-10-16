# NineCube.Digital — frontend

React 18 + TypeScript + Vite single-page app for the Order Processing assessment. It talks to the
ASP.NET Core API in [`../src/NineCube.Api`](../src/NineCube.Api); it holds no business rules of its
own — stock, prices, permissions and order state all come from the server.

The project-wide documentation lives at the repository root: [README.md](../README.md) (architecture,
permissions, assumptions, AI-use disclosure) and [TESTING.md](../TESTING.md) (raw results). This file
covers what is specific to the SPA, and [TESTING.md](./TESTING.md) here covers the frontend evidence.

---

## Setup

Prerequisites: **Node.js 20+** and the API running (see the root README §9).

```bash
cd web
npm install                 # installs React, TanStack Query, Three.js, Vitest, Playwright
cp .env.example .env.local  # only needed if the API is not on http://localhost:5080
```

`VITE_API_BASE_URL` is the only frontend variable, and it is compiled into the bundle — it must never
hold a secret. `npm run dev` and `npm run build` also regenerate `public/assets/assets.json` (see
[Adding images](#adding-images)).

## Run

```bash
npm run dev        # http://127.0.0.1:5173
npm run build      # typecheck + production build into dist/
npm run preview    # serve the production build on http://127.0.0.1:4173
```

The API must be up as well; every screen except the showcase needs a session. Demo accounts are listed
in the root README §9.

## Test

```bash
npm run typecheck                       # tsc --noEmit
npm run test:run                        # Vitest + React Testing Library + MSW (67 tests)
npm run e2e                             # Playwright, needs both servers running
npx playwright test showcase            # just the showcase route (no credentials needed)
```

The Playwright specs that sign in read the demo password from `NINECUBE_SEED_PASSWORD` and skip
themselves when it is absent:

```bash
NINECUBE_SEED_PASSWORD='<demo password>' npm run e2e
```

Quotes around the value are tolerated, because `.env` files in this repository quote theirs and the
.NET loader strips them.

## Routes

| Path | Screen | Who can see it |
| --- | --- | --- |
| `/` | **Showcase** — the public landing experience | signed-out visitors; signed-in users redirect to `/products` |
| `/products` | Catalogue, live stock badges, cart / order panel | any signed-in role (ordering is Customer-only) |
| `/orders`, `/orders/:id`, `/orders/:id/invoice` | Order history, detail, printable invoice | Customer (detail also Staff / Administrator) |
| `/staff`, `/staff/sales` | Staff console and sales summary | Staff, Administrator |
| `/inventory` | Stock table and adjustment ledger | Inventory Manager, Administrator |
| `/admin` | Users, audit log, low-stock setting | Administrator |
| `/login`, `/register` | Sign in / create an account | anyone |

Signing in without a pending destination lands on `/products`. Signed-in navigation and logo links
stay inside the workspace; `/` does not mount or download the helix for a signed-in user. A wrong-role visit is redirected to
`/products` with a notice, rather than to the showcase.

## The showcase

`/` is a scroll-driven Three.js piece: nine cards bent along a true 3D helix, two counter-moving guide
lines, an editorial title sequence, a staggered closing transition that resolves into a responsive
grid, and a light-to-dark footer blend.

It is adapted from the reference at
[`github.com/webfueled/web-fueled-helix`](https://github.com/webfueled/web-fueled-helix) (v1.1.0). The
reference sources are vendored unchanged in [`src/helix/reference/`](src/helix/reference) — including
its `VALIDATION.md`, which is the checklist the finished piece was measured against.

What was changed, and what was not:

- **Unchanged:** geometry, camera, helix radius/pitch/travel, the dip equation, card deformation, guide
  line geometry and depth ordering, the opening blend, the title timeline, the closing-grid maths and
  its breakpoints (≥1200 px 3×2, 601–1199 px 2×3, ≤600 px 1×6, recalculated on resize).
- **Scene integration changes:** Three.js is imported from the npm package `three@0.180.0` instead of a
  CDN; React owns the markup while the adapter owns the canvas; and the render loop and listeners are
  released on unmount (`src/helix/helixScene.ts` → `dispose()`).

| File | Role |
| --- | --- |
| [`src/pages/ShowcasePage.tsx`](src/pages/ShowcasePage.tsx) | The route: capability checks, asset list, scroll takeover, error boundary |
| [`src/helix/HelixCanvas.tsx`](src/helix/HelixCanvas.tsx) | Mount/unmount adapter around the scene |
| [`src/helix/helixScene.ts`](src/helix/helixScene.ts) | The adapted reference scene, with `dispose()` |
| [`src/helix/ShowcaseFallback.tsx`](src/helix/ShowcaseFallback.tsx) | Static nine-card grid: same images, same copy |
| [`src/helix/support.ts`](src/helix/support.ts) | WebGL and reduced-motion capability checks |
| [`src/helix/cardAssets.ts`](src/helix/cardAssets.ts) | Resolves the nine images from the manifest |
| [`src/helix/showcaseCopy.ts`](src/helix/showcaseCopy.ts) | Every piece of visible copy, in one place |
| [`src/helix/showcase.css`](src/helix/showcase.css) | Scoped reference layout with category previews and readable typography |

Three.js is loaded through a dynamic import inside this route, so it is **not** in the main bundle: the
catalogue and the consoles stay fast for anyone who never opens the showcase. Verified sizes are in
[TESTING.md](./TESTING.md#production-build).

**Fallbacks.** The animated scene is an enhancement, never a requirement for ordering. A static grid of
the same nine cards with the same text is rendered when the browser provides no WebGL context, when the
visitor has `prefers-reduced-motion: reduce`, or when the scene fails to start (a render error is caught
by an error boundary). While the route is mounted it takes over document scroll
(`history.scrollRestoration = 'manual'`, reset to the top) and puts everything back on unmount.

**Copy.** `showcaseCopy.ts` holds the shop copy: the opening heading is NineCube.Digital,
the editorial titles are `EVERYDAY +` and `ESSENTIALS`, and the transition heading is
`Find your everyday.` The closing footer leads to the catalogue. Category previews provide
photography before the cards enter; technical geometry headings are replaced with customer copy.

## Adding images

The showcase reads nine images from `web/public/assets`, **in filename order**, accepting
`.svg`, `.jpg`, `.jpeg`, `.png` and `.webp`.

1. Drop your files into `web/public/assets/`.
2. Run `npm run assets` (also runs automatically before `dev` and `build`) to refresh
   `assets.json` — the listing the browser reads.
3. Reload.

Fewer than nine images are repeated in order until the helix is full; the nine `work-0*.svg` files
shipped in the repository are the reference demo artwork, so it works out of the box. Card artwork with
mixed aspect ratios is fine: textures are cover-cropped, centred, and never stretched, and the crop is
calculated separately for the helix cards and the closing-grid cards. Transparent PNG/WebP is supported.

Catalogue photographs are a separate set: those live in `web/public/products`. Most catalogue rows come
from the attributed Bangladesh seed pipeline in `../seed`; the small DummyJSON kitchen sample is only a
development convenience for an empty database (see the root README, §16).

## Assumptions

Full list in the root README §12. The ones that concern this app:

1. **The showcase is public; the API is not.** `/` is a signed-out landing page — signed-in visitors redirect to `/products` —
   but every `/api/products` call still requires a session, and `/products` is behind the auth guard.
   The showcase makes no API calls at all.
2. **The catalogue lives at `/products`, not `/`.** Login and signed-in logo links go directly there. An anonymous home visit opens the showcase.
3. **The shell footer is hidden on `/`**, because the showcase ends with its own dark footer blend.
4. **The cart is client-side only.** Stock is reserved at placement, so adding to the cart is a local
   action and the server stays the source of truth for every quantity.
5. **The showcase is decorative in the product sense.** Nothing about ordering, stock or status depends
   on it; a visitor without WebGL gets the identical content as a static grid.
6. **No merchant brand photography was supplied.** Nine licensed Unsplash photographs illustrate coffee, technology, footwear, beauty, accessories, plants, living, stationery, and fresh food. They are editorial imagery, not claims about the exact stocked products. The source URLs, known photographer credits, and licence are recorded in `public/assets/photo-credits.json`. The original demo SVGs remain available as defaults.
7. **Existing authentication and separation of duties are retained.** The attached frontend-only brief's "no auth" staff assumption does not supersede the established four-role app. No backend code or API permissions were changed.

## AI-use disclosure

The implementation and the first drafts of the documentation were produced with an AI coding agent
(Freebuff / Codebuff) and the honest record of how is the root README
[§15 "AI-use disclosure"](../README.md#15-ai-use-disclosure).

Two points specific to the showcase:

- The scene is **not** a recreation from memory. The reference repository was cloned, its files
  (`AI_SOURCE.md`, `AI_INSTRUCTIONS.md`, `index.html`, `styles.css`, `main.js`, `VALIDATION.md`) were
  read, and its calibrated constants were carried over verbatim — they are vendored under
  `src/helix/reference/` so the comparison can be repeated. The deviations listed under
  [The showcase](#the-showcase) are the complete set.
- The result was verified against the reference's own `VALIDATION.md` with measurements rather than
  impressions: the closing-grid composition was counted from the rendered pixels at each breakpoint,
  and the card geometry, guide lines, title timing, footer blend, console output and overflow were all
  checked in a real browser. What passed, what was measured how, and what could not be run are
  itemised in [TESTING.md](./TESTING.md).

## Public homepage refinement

The home page has a dark, photo-led opening, an early catalogue CTA, nine photographic helix cards, an EVERYDAY + / ESSENTIALS sequence, responsive closing compositions, and the reference footer blend. The camera, geometry, image crop equations, guide-line depth ordering, timing, and disposal implementation were retained. Category photographs fill the early scroll interval before the animated cards arrive, then fade out. The supporting copy and typography use readable shop language and sizes. Phones use a photographic backdrop and a compact header; desktop uses an editorial split composition. This experience is excluded from login, registration, and all signed-in screens.

The active photographs are photo-01.jpg through photo-09.jpg in public/assets. The original work-01.svg through work-09.svg are still bundled; filename ordering makes the nine photo-* files the active set. Replace those files with your own photos, or give additional artwork an earlier filename, then run npm run assets. Refresh the supplied photos with node scripts/fetch-showcase-photos.mjs. Sources and licence links are in public/assets/photo-credits.json. The app serves the photographs locally and requires no Unsplash connection at runtime.

This refinement used Codex to inspect the attached brief, the current implementation, the canonical Web Fueled source and validation checklist, and photo source pages. It used repository code changes, source-image downloads, Vitest/MSW, and Playwright screenshots and live browser assertions. All claims about completed verification are recorded in web/TESTING.md. Original generated implementation disclosures above remain historical context.

The opening also includes two floating product promotion cards: an explicitly labeled
20% offer preview and a new style edit. Both link to the catalogue. These editorial
cards do not change inventory or checkout prices. Their gentle CSS animation stops
for reduced-motion preferences, and the static homepage fallback includes them.
The navbar link tray now uses theme-specific translucent gradients, edge highlights,
and an illuminated active button to make the glass treatment visible in both themes.

The public footer shares one content component between the animated home and its
static fallback. It includes a catalogue call to action, the cube wordmark, existing
collection/sign-in/registration links, and copyright. The reference background blend
is retained, while its foreground now selects black or white by contrast rather than
fading through an unreadable grey. The signed-in app footer remains separate.
