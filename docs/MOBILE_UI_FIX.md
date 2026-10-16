# Mobile workspace fixes

The signed-in navbar now uses a compact two-row layout on phones: brand and theme controls, then a scrollable navigation tray beside 44px account actions. Redundant email text is hidden on narrow screens. Footer links stack, pagination wraps, and wide data tables scroll inside their own panels. Product cards reveal when entering the touch viewport and respond to touch presses; reduced-motion preferences are respected.

Mobile notifications previously had no reference registered with their outside-pointer listener. A pointer inside the sheet therefore closed it before links could navigate. The sheet is now registered, View all works, items without a destination open the inbox, and the sheet has an explicit close action and background scroll lock. Only dragging the handle dismisses it; scrolling the notification list does not. Focus initialization no longer repeats whenever notification data updates.

Product details now include original-photo and 3D-photo modes, touch drag and keyboard tilt, zoom/reset, swipe and thumbnail navigation through actual gallery photos, and four clearly labeled backdrop colours. Original image colours and product identities are preserved. The catalogue does not contain 3D models, full turntable captures, or structured colour variants; this is an interactive photo preview, not a claim of genuine 360-degree geometry or additional purchasable variants.

Validation: 18 focused regression tests passed, including pointer-driven mobile View all navigation and gallery controls. `tools/audit-mobile.mjs` checked 11 workspace routes at 320, 390 and 768 pixels (33 combinations), with no horizontal overflow, offscreen navbar/footer, or runtime errors; it also checked notification navigation and touch-card reveal. It serves the production build under the GitHub Pages subpath using isolated API fixtures, without production accounts or database writes. Evidence is written to ignored `web/test-results/mobile-audit.json`.

Repeat with `cd web; npm run build`, then from the repository root `node --experimental-strip-types tools/audit-mobile.mjs` (Node 22.19+, existing web dependencies and Playwright Chromium required).
