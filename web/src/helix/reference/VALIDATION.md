# Validation

Use this checklist to confirm that the interaction matches the intended behavior.

## Opening

- [ ] The page begins with the dark hero treatment.
- [ ] `Web Fueled` is visible in the opening section.
- [ ] The hero scrolls naturally rather than remaining pinned.
- [ ] The scene transitions smoothly from dark to light.
- [ ] `PARAMETRIC HELIX + BENT CARD GEOMETRY` appears and clears before the main editorial titles take over.

## Editorial titles

- [ ] `Codex +` and `Three.js` enter from opposite sides.
- [ ] The `+` has the intended scale, spacing, and vertical alignment.
- [ ] Both titles hold visibly before exiting outward.
- [ ] The title sequence clears before the closing grid resolves.

## Helix

- [ ] Nine cards appear in the correct sequence.
- [ ] Cards move smoothly through the helix as the page scrolls.
- [ ] Cards bend along the curve rather than behaving as rigid flat planes.
- [ ] Camera perspective, depth, and card scale match the reference implementation.

## Card artwork

- [ ] Card images fill the visible card area without stretching or squashing.
- [ ] Centered cover-style cropping is preserved for wide, square, portrait, and tall portrait artwork.
- [ ] Helix and closing-grid crops are calculated independently for their different card aspect ratios.
- [ ] SVG, JPG/JPEG, PNG, and WebP artwork render correctly.
- [ ] Transparent PNG/WebP artwork renders without texture-loading or shader errors.

## Guide lines

- [ ] Two light-gray guide lines follow the helix path in the opposite direction.
- [ ] Their timing and spacing match the reference implementation.
- [ ] The upper line renders behind the cards.
- [ ] The lower line renders above the cards.

## Closing grid

- [ ] At desktop widths of 1200px and above, cards 01–03 settle across the top row and cards 04–06 across the bottom row using the approved 3×2 composition.
- [ ] From 601px through 1199px, the closing grid resolves as 2 columns × 3 rows.
- [ ] At 600px and below, the closing grid resolves as 1 column × 6 rows.
- [ ] Grid targets and scale recalculate cleanly after viewport resize.
- [ ] Multiple cards overlap in motion during the transition.
- [ ] Cards retain a subtle sheet-like wave while entering and settling.
- [ ] Card order remains 01 through 06 across responsive layouts.
- [ ] The final card settles at the end of the sequence.

## Footer

- [ ] The footer begins in the light treatment.
- [ ] It blends smoothly into the dark treatment.
- [ ] `MAKE IT YOURS` resolves as light text on the dark background.

## Technical

- [ ] No local assets are missing.
- [ ] No uncaught JavaScript errors or warnings appear in the browser console.
- [ ] The project is previewed through a local server rather than relying on a direct `file://` open.
- [ ] Scrolling remains smooth in a current desktop browser.
- [ ] Responsive behavior is checked at approximately 1440px, 1024px, 768px, 430px, and 390px viewport widths.
