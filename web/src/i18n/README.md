# English and Bengali interface

`language.ts` owns the saved preference and its reactive subscription. Components call
`useLanguage()` once at the top and wrap displayed text with `t(...)`. Switching language
updates mounted components without changing auth sessions, form values, carts, query keys,
routes, product IDs, or API payloads. English is the fallback for unknown text and user content.

Add new interface phrases and Bengali translations to `bn.json`. Run `npm run i18n:check`;
the Pages deployment also checks literal translation calls so new labels do not silently
lose their Bengali translation. Dynamic messages use the bounded patterns in `language.ts`.
New merchant descriptions and product identities are preserved; this is not a machine
translation service for arbitrary new content.

Amounts, dates, relative times and display counts follow the selected locale. Numeric input
values remain machine-readable. Address labels reuse the Bengali names from the same
[Bangladesh geocode source](https://github.com/nuhil/bangladesh-geocode) as the bundled
locations, matched by both ID and English name; saved addresses are never rewritten.
See `../data/LOCATION_LICENSE.txt` for the source license.

The Bengali interface uses self-hosted **Anek Bangla**, an open variable font by Ek Type.
[Google Fonts metadata](https://github.com/google/fonts/tree/main/ofl/anekbangla) and the
SIL Open Font License are preserved in `public/fonts/anek-bangla/OFL.txt`. Bengali and
Latin subsets use `font-display: swap`; no runtime font service is required.

Theme and language choices are separate. Light is the default, including for a previous
`system` preference; an explicitly saved dark choice is respected. Both preferences sync
between tabs. The language menu supports hover, pointer/touch clicks, arrow keys, Home,
End, Escape and selection with Enter or Space.
