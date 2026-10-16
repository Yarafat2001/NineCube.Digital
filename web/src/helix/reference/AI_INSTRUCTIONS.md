# AI Implementation Notes

This project is a visually calibrated Three.js interaction. Treat the existing source as the reference implementation when reproducing, extending, or customizing it.

## Preserve by default

Unless a requested change specifically targets animation behavior, preserve:

- Three.js version and module-loading behavior
- camera field of view and approved desktop camera position
- helix radius, pitch, start position, travel distance, and dip equation
- nine-card helix order and motion
- column-by-column card deformation along the helix
- helix card dimensions
- guide-line geometry, path, timing, spacing, opacity, and depth ordering
- upper guide line behind the cards
- lower guide line above the cards
- opening dark-to-light transition
- large transition-title sequence
- `Codex +` and `Three.js` entrance, hold, and exit sequence
- spacing, scale, and vertical alignment of the `+`
- desktop 3-column × 2-row closing-grid composition
- responsive closing-grid behavior
- grid card ordering
- overlapping grid-card entrances
- sheet-like deformation and progressive settling
- closing light-to-dark footer transition

## Card artwork

The reference build supports mixed card-image aspect ratios and common web image formats. Card textures use centered cover-style cropping so artwork fills the card without stretching or distortion.

When replacing artwork:

- preserve the existing card geometry rather than resizing cards to match images;
- preserve the `CARD_ASSETS` ordering unless a different order is explicitly requested;
- support SVG, JPG/JPEG, PNG, and WebP source artwork;
- preserve centered cover-style cropping unless a different focal position is specifically requested;
- calculate the crop independently for the helix and closing-grid card aspect ratios.

## Responsive closing grid

The closing grid is calculated in Three.js and must respond to viewport width while preserving the approved desktop composition:

- desktop (`>=1200px`): 3 columns × 2 rows using the reference desktop coordinates and scale;
- narrower layouts (`601–1199px`): 2 columns × 3 rows;
- small mobile (`<=600px`): 1 column × 6 rows;
- recalculate targets and scale on resize;
- preserve entrance timing, overlap, rotation, deformation, settling, and card order across layouts.

## Safe customization areas

Content-oriented changes can usually be limited to:

- card artwork
- visible copy
- brand colors
- CTA text
- labels or project names

Do not alter animation constants solely to accommodate content changes.

## Implementation approach

When working in a file-capable coding environment:

1. Inspect the reference files before editing.
2. Reproduce the existing file structure and behavior faithfully when creating a new working copy.
3. Keep changes narrowly scoped to the requested outcome.
4. Avoid unnecessary framework or dependency substitutions.
5. Use the simplest local preview method available in the current environment and keep it running for user review.
6. Do not rely on opening `index.html` directly with a `file://` URL when a local server is required for module and asset loading.
7. Validate the finished result against `VALIDATION.md`.

If the reference source cannot be accessed, do not invent a substitute implementation and present it as equivalent.
