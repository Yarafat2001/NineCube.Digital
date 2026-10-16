# Bangladesh catalogue seed report

> Master brief update (15 October 2026): further imports are stopped by the read-only category gate. See [MASTER_SEED_PREFLIGHT.md](MASTER_SEED_PREFLIGHT.md). The figures below describe the earlier imports into the existing tree, not complete master taxonomy coverage. The loader now binds SQL parameters; rollback and no-op rerun checks passed without changes to orders or stock.

Validated: 2026-10-15 02:15 +06

Clean dataset: **145 products**. The latest inserting run added 120; the two following reruns were exact no-ops. Database total: 171 products, 32 tags, 186 category links.

## Scope and schema differences

The full 15-root Bangladesh tree was absent from the database; it was installed once through seed/seed_categories_bd.py (explicitly authorized as setup; slug set mirrors the brief within the tree the application already had). The product loader itself cannot create or modify categories. Slugs follow the database tree, which differs from the brief in names (e.g. `shirts` rather than `mens-shirts`, `uncategorized` present).

Products now carries Slug/Currency/NeedsReview/PriceBasis/PriceVerifiedAt/Source*/SpecsJson columns (the application's ProductProvenanceAndCurrency migration). New rows store the readable kebab-case slug, BDT currency, provenance and specs directly. The BD-<sha> SKU mapping remains for insert-if-missing identity, and rows imported before that migration keep their legacy slugs: the loader never updates existing products, so nothing was rewritten.

OrderItem snapshots and Orders were not touched; preservation checks compare every pre-existing row. The application currency display was already corrected to per-product Currency by the same migration.

## Sources and attribution

| Source | License | Clean rows |
|---|---|---:|
| [Walton official catalogue](https://waltonbd.com/led-light/led-bulb/crystal-series-led-bulb) | Official factual product identity and listed price; images/text excluded | 41 |
| [Hatil official catalogue](https://www.hatil.com/bed/dazzler-101) | Official factual product identity and listed price; images/text excluded | 27 |
| [Generic fallback (documented price range)](https://en.wikipedia.org/wiki/Rice) | CC BY-SA 4.0 (reference page for product-type facts only; no text reuse) | 26 |
| [Apex official catalogue](https://www.apex4u.com/product/cross-mens-wallet-09110a72) | Official factual product identity and listed price; images/text excluded | 17 |
| [Open Food Facts](https://world.openfoodfacts.org/product/8901595863013) | ODbL-1.0 / DbCL-1.0 | 15 |
| [jomarie04/smartphone-specifications-2020-2024](https://huggingface.co/datasets/jomarie04/smartphone-specifications-2020-2024/resolve/4d19b89f8123effc01aa8b97f7cc4adbfef7d20e/dataset.csv) | mit | 10 |
| [Bata official catalogue](https://www.batabd.com/products/power-fanny-pack-bags) | Official factual product identity and listed price; images/text excluded | 9 |

Open Food Facts contributors: ODbL-1.0 / DbCL-1.0 (https://world.openfoodfacts.org/terms-of-use); only factual names, brands, pack sizes and category tags were used; no descriptions or images copied. The Hugging Face dataset jomarie04/smartphone-specifications-2020-2024 (MIT, pinned revision in raw/hf-provenance.json) supplied phone model identity and specs only; its USD prices were discarded. Official catalogue pages (Walton, Bata, Hatil, Apex Bangladesh) supplied factual product names and listed BDT prices; no descriptions, images or reviews were reused; robots.txt was honored and one request per second per host was enforced. Generic fallback items cite verified Wikipedia reference pages (CC BY-SA 4.0) for product-type background only and are always needs_review=true, per brief section 4.7.

## Leaf coverage

| Leaf | New seed rows | Products in DB | Primary | Status |
|---|---:|---:|---:|---|
| Auto Accessories (auto-accessories) | 2 | 2 | 2 | partial - Generic fallbacks only (brief section 4.7); never fabricate to reach a number |
| Bags (bags) | 11 | 11 | 11 | covered |
| Beds (beds) | 12 | 12 | 12 | covered |
| Chairs (chairs) | 15 | 15 | 15 | covered |
| Coffee & Tea (coffee-tea) | 0 | 10 | 10 | covered |
| Cooking Oil (cooking-oil) | 2 | 2 | 2 | partial - Generic fallbacks only (brief section 4.7); never fabricate to reach a number |
| Cosmetics (cosmetics) | 2 | 2 | 2 | partial - Generic fallbacks only (brief section 4.7); never fabricate to reach a number |
| Fragrances (fragrances) | 2 | 2 | 2 | partial - Generic fallbacks only (brief section 4.7); never fabricate to reach a number |
| IPS Batteries (ips-batteries) | 1 | 1 | 1 | partial - Generic fallbacks only (brief section 4.7); never fabricate to reach a number |
| Laptops (laptops) | 1 | 1 | 1 | partial - Generic fallbacks only (brief section 4.7); never fabricate to reach a number |
| LED Lighting (led-lighting) | 6 | 6 | 6 | partial - Official catalogue leaf capped by volume guidance or awaiting more verified rows |
| Medicines (medicines) | 2 | 2 | 2 | partial - Generic fallbacks only (brief section 4.7); never fabricate to reach a number |
| Motorbikes (motorbikes) | 1 | 1 | 1 | partial - Generic fallbacks only (brief section 4.7); never fabricate to reach a number |
| Packaged Food (packaged-food) | 0 | 15 | 0 | covered |
| Panjabi (panjabi) | 2 | 2 | 2 | partial - Generic fallbacks only (brief section 4.7); never fabricate to reach a number |
| Refrigerators (refrigerators) | 15 | 15 | 15 | covered |
| Rice (rice) | 2 | 2 | 2 | partial - Generic fallbacks only (brief section 4.7); never fabricate to reach a number |
| Sarees (sarees) | 2 | 2 | 2 | partial - Generic fallbacks only (brief section 4.7); never fabricate to reach a number |
| Shirts (shirts) | 2 | 2 | 2 | partial - Generic fallbacks only (brief section 4.7); never fabricate to reach a number |
| Shoes (shoes) | 15 | 15 | 15 | covered |
| Smartphones (smartphones) | 30 | 30 | 30 | covered |
| Sports Accessories (sports-accessories) | 2 | 2 | 2 | partial - Generic fallbacks only (brief section 4.7); never fabricate to reach a number |
| Uncategorized (uncategorized) | 15 | 15 | 15 | covered |
| Wall Paint (wall-paint) | 2 | 2 | 2 | partial - Generic fallbacks only (brief section 4.7); never fabricate to reach a number |
| Watches (watches) | 1 | 1 | 1 | partial - Generic fallbacks only (brief section 4.7); never fabricate to reach a number |

## Leaves below eight products (with reasons)

- `auto-accessories`: 2 products — Generic fallbacks only (brief section 4.7); never fabricate to reach a number
- `cooking-oil`: 2 products — Generic fallbacks only (brief section 4.7); never fabricate to reach a number
- `cosmetics`: 2 products — Generic fallbacks only (brief section 4.7); never fabricate to reach a number
- `fragrances`: 2 products — Generic fallbacks only (brief section 4.7); never fabricate to reach a number
- `ips-batteries`: 1 products — Generic fallbacks only (brief section 4.7); never fabricate to reach a number
- `laptops`: 1 products — Generic fallbacks only (brief section 4.7); never fabricate to reach a number
- `led-lighting`: 6 products — Official catalogue leaf capped by volume guidance or awaiting more verified rows
- `medicines`: 2 products — Generic fallbacks only (brief section 4.7); never fabricate to reach a number
- `motorbikes`: 1 products — Generic fallbacks only (brief section 4.7); never fabricate to reach a number
- `panjabi`: 2 products — Generic fallbacks only (brief section 4.7); never fabricate to reach a number
- `rice`: 2 products — Generic fallbacks only (brief section 4.7); never fabricate to reach a number
- `sarees`: 2 products — Generic fallbacks only (brief section 4.7); never fabricate to reach a number
- `shirts`: 2 products — Generic fallbacks only (brief section 4.7); never fabricate to reach a number
- `sports-accessories`: 2 products — Generic fallbacks only (brief section 4.7); never fabricate to reach a number
- `wall-paint`: 2 products — Generic fallbacks only (brief section 4.7); never fabricate to reach a number
- `watches`: 1 products — Generic fallbacks only (brief section 4.7); never fabricate to reach a number

Brief rule: fewer products are seeded rather than fabricating data or scraping competitor catalogues.

## Checks

```json
{
  "leaves_under_eight": [
    {
      "slug": "auto-accessories",
      "products": 2,
      "reason": "Generic fallbacks only (brief section 4.7); never fabricate to reach a number"
    },
    {
      "slug": "cooking-oil",
      "products": 2,
      "reason": "Generic fallbacks only (brief section 4.7); never fabricate to reach a number"
    },
    {
      "slug": "cosmetics",
      "products": 2,
      "reason": "Generic fallbacks only (brief section 4.7); never fabricate to reach a number"
    },
    {
      "slug": "fragrances",
      "products": 2,
      "reason": "Generic fallbacks only (brief section 4.7); never fabricate to reach a number"
    },
    {
      "slug": "ips-batteries",
      "products": 1,
      "reason": "Generic fallbacks only (brief section 4.7); never fabricate to reach a number"
    },
    {
      "slug": "laptops",
      "products": 1,
      "reason": "Generic fallbacks only (brief section 4.7); never fabricate to reach a number"
    },
    {
      "slug": "led-lighting",
      "products": 6,
      "reason": "Official catalogue leaf capped by volume guidance or awaiting more verified rows"
    },
    {
      "slug": "medicines",
      "products": 2,
      "reason": "Generic fallbacks only (brief section 4.7); never fabricate to reach a number"
    },
    {
      "slug": "motorbikes",
      "products": 1,
      "reason": "Generic fallbacks only (brief section 4.7); never fabricate to reach a number"
    },
    {
      "slug": "panjabi",
      "products": 2,
      "reason": "Generic fallbacks only (brief section 4.7); never fabricate to reach a number"
    },
    {
      "slug": "rice",
      "products": 2,
      "reason": "Generic fallbacks only (brief section 4.7); never fabricate to reach a number"
    },
    {
      "slug": "sarees",
      "products": 2,
      "reason": "Generic fallbacks only (brief section 4.7); never fabricate to reach a number"
    },
    {
      "slug": "shirts",
      "products": 2,
      "reason": "Generic fallbacks only (brief section 4.7); never fabricate to reach a number"
    },
    {
      "slug": "sports-accessories",
      "products": 2,
      "reason": "Generic fallbacks only (brief section 4.7); never fabricate to reach a number"
    },
    {
      "slug": "wall-paint",
      "products": 2,
      "reason": "Generic fallbacks only (brief section 4.7); never fabricate to reach a number"
    },
    {
      "slug": "watches",
      "products": 1,
      "reason": "Generic fallbacks only (brief section 4.7); never fabricate to reach a number"
    }
  ],
  "invalid_primary_products": [],
  "nonpositive_prices": [],
  "duplicate_skus": [],
  "duplicate_slugs": [],
  "orphan_tags": [],
  "missing_source_urls": [],
  "missing_seed_products": [],
  "missing_seed_links": [],
  "missing_seed_tags": [],
  "api_count_mismatches": [],
  "api_checks": [
    {
      "check": "descendant category query",
      "passed": true,
      "detail": "api=46 sql=46"
    },
    {
      "check": "direct-only category query (empty parent)",
      "passed": true,
      "detail": "status=200 total=0"
    },
    {
      "check": "cross-listed product appears under both categories",
      "passed": true,
      "detail": "ching-s-schezwan-chutney-30-g"
    },
    {
      "check": "cross-listed product appears once in combined descendant query",
      "passed": true,
      "detail": "occurrences=1"
    },
    {
      "check": "price filter bounds",
      "passed": true,
      "detail": "count=29"
    },
    {
      "check": "tag filter",
      "passed": true,
      "detail": "api=41 sql=41"
    },
    {
      "check": "inStock filter",
      "passed": true,
      "detail": ""
    },
    {
      "check": "sort=name follows SQL collation order",
      "passed": true,
      "detail": "api=20 sql=20"
    },
    {
      "check": "sort=price ascending",
      "passed": true,
      "detail": ""
    },
    {
      "check": "sort=stock descending (app behaviour)",
      "passed": true,
      "detail": ""
    },
    {
      "check": "sort=newest responds",
      "passed": true,
      "detail": ""
    },
    {
      "check": "unknown category returns 404",
      "passed": true,
      "detail": "status=404"
    },
    {
      "check": "keyword search",
      "passed": true,
      "detail": ""
    }
  ],
  "unique_logical_slugs": true,
  "reruns_stable": true,
  "out_of_stock_seed_percent": 6.21,
  "low_stock_seed_percent": 3.45,
  "preservation_checks_passed": true
}
```

Latest catalogue load runs (inserting run plus two no-op reruns):

```json
[
  {
    "at": "2026-10-14T19:08:58.426994+00:00",
    "inserted": {
      "auto-accessories": 0,
      "bags": 0,
      "beds": 0,
      "chairs": 0,
      "cooking-oil": 0,
      "cosmetics": 0,
      "fragrances": 0,
      "ips-batteries": 0,
      "laptops": 0,
      "led-lighting": 0,
      "medicines": 0,
      "motorbikes": 0,
      "panjabi": 0,
      "refrigerators": 0,
      "rice": 0,
      "sarees": 0,
      "shirts": 0,
      "shoes": 0,
      "smartphones": 0,
      "sports-accessories": 0,
      "uncategorized": 0,
      "wall-paint": 0,
      "watches": 0
    },
    "skipped": [],
    "links_added": 0,
    "tags_added": 0,
    "before": {
      "Products": 171,
      "ProductCategories": 186,
      "Tags": 32,
      "ProductTags": 441
    },
    "after": {
      "Products": 171,
      "ProductCategories": 186,
      "Tags": 32,
      "ProductTags": 441
    },
    "existing_products_unchanged": true,
    "categories_unchanged": true,
    "order_items_unchanged": true
  },
  {
    "at": "2026-10-14T19:09:45.536964+00:00",
    "inserted": {
      "auto-accessories": 0,
      "bags": 0,
      "beds": 0,
      "chairs": 0,
      "cooking-oil": 0,
      "cosmetics": 0,
      "fragrances": 0,
      "ips-batteries": 0,
      "laptops": 0,
      "led-lighting": 0,
      "medicines": 0,
      "motorbikes": 0,
      "panjabi": 0,
      "refrigerators": 0,
      "rice": 0,
      "sarees": 0,
      "shirts": 0,
      "shoes": 0,
      "smartphones": 0,
      "sports-accessories": 0,
      "uncategorized": 0,
      "wall-paint": 0,
      "watches": 0
    },
    "skipped": [],
    "links_added": 0,
    "tags_added": 0,
    "before": {
      "Products": 171,
      "ProductCategories": 186,
      "Tags": 32,
      "ProductTags": 441
    },
    "after": {
      "Products": 171,
      "ProductCategories": 186,
      "Tags": 32,
      "ProductTags": 441
    },
    "existing_products_unchanged": true,
    "categories_unchanged": true,
    "order_items_unchanged": true
  },
  {
    "at": "2026-10-14T19:12:18.393823+00:00",
    "inserted": {
      "auto-accessories": 0,
      "bags": 0,
      "beds": 0,
      "chairs": 0,
      "cooking-oil": 0,
      "cosmetics": 0,
      "fragrances": 0,
      "ips-batteries": 0,
      "laptops": 0,
      "led-lighting": 0,
      "medicines": 0,
      "motorbikes": 0,
      "panjabi": 0,
      "refrigerators": 0,
      "rice": 0,
      "sarees": 0,
      "shirts": 0,
      "shoes": 0,
      "smartphones": 0,
      "sports-accessories": 0,
      "uncategorized": 0,
      "wall-paint": 0,
      "watches": 0
    },
    "skipped": [],
    "links_added": 0,
    "tags_added": 0,
    "before": {
      "Products": 171,
      "ProductCategories": 186,
      "Tags": 32,
      "ProductTags": 441
    },
    "after": {
      "Products": 171,
      "ProductCategories": 186,
      "Tags": 32,
      "ProductTags": 441
    },
    "existing_products_unchanged": true,
    "categories_unchanged": true,
    "order_items_unchanged": true
  }
]
```

Preservation checks compare every pre-existing Product field including rowversion, all category fields and every OrderItem field. Each category batch commits independently; rerunning resumes safely. Existing products keep their StockQuantity, prices and primary categories; reruns only add missing extra-category and tag links (brief section 7), which is why the first run above reports links and tag links added for the pre-migration rows.

## Dev-only scenario fixtures

Applied and removed on the development database via `load.py --with-scenarios` / `scenarios/cleanup.py`: uncategorized single-category fallback, two-category cross-listing, inactive product, out-of-stock product, an active orderable product under `TEST: Inactive Category` (ordering depends only on Product.IsActive and stock), and an empty `TEST: Empty Category` (API: 200 with an empty page). The cleanup script deletes only rows whose SKU, slug and TEST: name all match the fixtures and verified zero leftovers.

```json
[
  {
    "at": "2026-10-14T19:13:01.759085+00:00",
    "kind": "scenarios",
    "inserted": 4,
    "counts": {
      "Products": 176,
      "ProductCategories": 192,
      "Categories": 45
    },
    "note": "Dev-only TEST: fixtures and two TEST categories; excluded from catalogue validation"
  },
  {
    "at": "2026-10-14T19:20:15.291637+00:00",
    "kind": "scenario-cleanup",
    "removed": {
      "products": 0,
      "categories": 0,
      "tags": 0
    },
    "counts": {
      "Products": 171,
      "ProductCategories": 186,
      "Categories": 43
    },
    "note": "All TEST: rows removed; counts restored"
  }
]
```

## Skipped rows

205 source rows were skipped. Full per-row reasons: seed/clean/skipped.json.

| Reason | Rows |
|---|---:|
| Missing name/brand or unverified food identity | 78 |
| Pack size missing, ambiguous or lacking a unit | 6 |
| 15-row leaf cap | 1 |
| Leaf volume cap 15 | 120 |

## Blocked or unavailable access

- https://dgda.gov.bd/robots.txt: <urlopen error [SSL: CERTIFICATE_VERIFY_FAILED] certificate verify failed: unable to get local issuer certificate (_ssl.c:1032)>. No access-control or rate-limit bypass attempted.
- https://en.wikipedia.org/api/rest_v1/page/summary/Lead-acid_battery: HTTP Error 429: Too Many Requests. No access-control or rate-limit bypass attempted.
- https://en.wikipedia.org/api/rest_v1/page/summary/Panjabi_(clothing): HTTP Error 404: Not Found. No access-control or rate-limit bypass attempted.
- https://mcprod.aarong.com/robots.txt: HTTP Error 403: Forbidden. No access-control or rate-limit bypass attempted.
- https://waltonbd.com/refrigerator/freezer: HTTP Error 404: Not Found. No access-control or rate-limit bypass attempted.
- https://waltonbd.com/robots.txt: HTTP Error 404: Not Found. No access-control or rate-limit bypass attempted.
- https://world.openfoodfacts.org/api/v2/search?countries_tags=en%3Abangladesh&categories_tags=en%3Acoffees&page=1&page_size=100&fields=code%2Cproduct_name%2Cproduct_name_en%2Cbrands%2Cquantity%2Ccategories_tags%2Ccountries_tags: HTTP Error 503: Service Temporarily Unavailable. No access-control or rate-limit bypass attempted.
- https://world.openfoodfacts.org/api/v2/search?countries_tags=en%3Abangladesh&categories_tags=en%3Ateas&page=1&page_size=100&fields=code%2Cproduct_name%2Cproduct_name_en%2Cbrands%2Cquantity%2Ccategories_tags%2Ccountries_tags: HTTP Error 503: Service Temporarily Unavailable. No access-control or rate-limit bypass attempted.
- https://world.openfoodfacts.org/api/v2/search?countries_tags=en%3Abangladesh&page_size=100&page=2&fields=code,product_name,brands,categories_tags,quantity,countries_tags: HTTP Error 503: Service Temporarily Unavailable. No access-control or rate-limit bypass attempted.
- https://www.aci-bd.com/our-businesses/consumer-brands.html: HTTP Error 404: Not Found. No access-control or rate-limit bypass attempted.
- https://www.bergerbd.com/products/: HTTP Error 404: Not Found. No access-control or rate-limit bypass attempted.
- https://www.hatil.com/bed-: HTTP Error 404: Not Found. No access-control or rate-limit bypass attempted.
- https://www.radhuni.com.bd/robots.txt: <urlopen error [Errno 11001] getaddrinfo failed>. No access-control or rate-limit bypass attempted.
- https://www.radhuni.com/robots.txt: <urlopen error [SSL: UNEXPECTED_EOF_WHILE_READING] EOF occurred in violation of protocol (_ssl.c:1032)>. No access-control or rate-limit bypass attempted.
- https://www.rahimafrooz.com/storage-power/: HTTP Error 404: Not Found. No access-control or rate-limit bypass attempted.
- https://www.squarepharma.com.bd/robots.txt: HTTP Error 404: Not Found. No access-control or rate-limit bypass attempted.

Aarong, Otobi product listings, Pran, Square Pharmaceuticals, ACI, Teer/Radhuni, Berger and Rahimafrooz pages either render products client-side, serve only category headings, or returned access challenges; they contain no fetchable name-plus-price records, so those brands could not be imported and their leaves received section-4.7 generic fallbacks instead of fabricated brand items. Open Food Facts returned 503 for new searches during this session; the cached Bangladesh page from the successful fetch was reused unchanged (raw/manifest.json). DGDA/BSTI lists were unreachable (TLS errors), so no compliance certification is claimed on any row. No competitor stores were scraped.

## All items requiring review

| Products needing review | of clean rows |
|---:|---:|
| 86 | 145 |

Per-row review reasons are in seed/clean/products.json (review_reasons). Estimated-price rows (Open Food Facts community identities, historical phone models, generic fallbacks) and official rows with VAT or variant caveats are flagged; official catalogue rows with a plain listed BDT price are not.

