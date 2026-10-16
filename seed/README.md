# Bangladesh product seed pipeline

## Laptop expansion and compact SKUs ? 16 October 2026

Added 12 sourced laptop configurations across Apple, Dell, HP, Lenovo, ASUS, Acer, MSI and Walton.
Each has two locally cached model-listing images, CPU/RAM/SSD/display information, brand and series
links, the existing Laptops category, and configuration tags. Names stay below 55 characters.
Prices are the recorded Star Tech cash/online BDT prices, with provenance and collection evidence.
New stock is zero; Inventory staff must receive stock before these products become orderable.
Existing product prices, stock, IDs, images and historical order snapshots were preserved.

The 145 former hash-only SKUs were migrated to readable deterministic codes of at most 24 characters,
for example `BD-APPL-IPHO-12-` plus a six-character identity suffix. The unique database index and
preflight collision checks enforce uniqueness. The reviewed mapping is `clean/sku-migration.json`.
The normal seed cache and image-backfill identity checks support the compact codes.

```powershell
python seed/expand_laptops.py --prepare # cached source records; download and validate photos
python seed/expand_laptops.py --apply   # explicit database/catalogue update, safe to rerun
python -m unittest discover -s seed -p test_sku.py
python -m unittest discover -s seed -p test_pipeline.py
python seed/verify_product_images.py
```

Set the SQL target environment variables before database commands. Browser coverage is in
`web/e2e/laptop-catalogue.spec.ts` and requires the local servers and `NINECUBE_SEED_PASSWORD`.
Evidence: `clean/laptops.json`, `clean/laptop-expansion-runs.json`, and `clean/laptop-verification.json`.
Photo sources are also published at `/products/image-credits.html`.


## Product image backfill — 16 October 2026

The image-only backfill attached 145 previously missing product images. All 171 database products
now have usable images. Manufacturer catalogue records and exact Open Food Facts barcodes are
matched directly; unbranded generic items have clearly labeled representative images. Wikimedia
model illustrations are retained where appropriate. Original image bytes/backgrounds are preserved.

The checked-in photos live in `web/public/products/sourced`, served by the frontend. Image credits
are available at `/products/image-credits.html` and in `clean/product-image-backfill.json`.
Downloads are decoded, checked for minimum dimensions and checksummed before any database update.

With `NINECUBE_SQL_SERVER` and `NINECUBE_SQL_DATABASE` explicitly configured:

```powershell
python seed/backfill_product_images.py                 # download/cache; no database writes
python seed/backfill_product_images.py --offline --apply # apply the reviewed manifest only
python seed/verify_product_images.py                   # verify all database image URLs
cd web
node verify-product-images.mjs                        # browser check; local servers and seed login required
```

Install `seed/requirements.txt` for the SQL driver and image decoder. The manifest is scoped to the
product identities in `clean/image-audit-before.json`; a changed SKU/name aborts the transaction.
Existing images are preserved. Explicitly reviewed corrections only replace their recorded prior
URL. The transaction updates `Products.ImageUrl` and primary `ProductImages` records; it never
updates prices, stock, category assignments, availability or orders. Reapplying is idempotent.

Validation: `clean/image-backfill-verification.json` records **171/171 loaded, zero failures**.
Price, stock and active flags were compared before/after each application and remained unchanged.

This folder is independent of the application. Reads use SQL Server `sqlcmd`;
product batches use pyodbc with bound parameters. Read [the verified report](../SEED_REPORT.md) before
using the imported prices.

## Master brief gate (15 October 2026)

The current master brief prohibits category/schema changes and requires stopping
when a requested category slug is missing. `load.py` now runs
`preflight_master.py` before any write. The live 43-category tree does not match
the master taxonomy: [MASTER_SEED_PREFLIGHT.md](../MASTER_SEED_PREFLIGHT.md) lists
the missing slugs. No new products were imported in this pass. The earlier 145
clean rows and import report remain historical evidence, not a claim of full
master-brief coverage. The 358 brand/category targets in brands_input.csv now
come directly from the supplied master brief.

```powershell
python -m pip install --target seed/.deps -r seed/requirements.txt
python seed/preflight_master.py
```

Stop when preflight returns a nonzero exit. Do not run the old taxonomy installer
to bypass this gate. The default loader cannot modify the tree. Existing
`scenarios/` scripts remain opt-in development fixtures.

The parameterized loader was checked with quoted Unicode text, a late-failure
rollback probe and two no-op reruns before the stricter master gate was enabled.
LocalDB uses Encrypt=no for the installed ODBC 17 driver, matching the existing
local development connection. Other servers default to Encrypt=yes; override
only explicitly with NINECUBE_SQL_ENCRYPT=yes/no. Credentials remain in environment
variables, never SQL payloads or command arguments.

## Requirements and connection

- Python 3.11+ and `sqlcmd` (the ODBC-based version used for this run was 16).
- The current NineCube schema: `Products` (including the
  `ProductProvenanceAndCurrency` columns `Slug`, `Currency`, `NeedsReview`,
  `PriceBasis`, `PriceVerifiedAt`, `SourceName`, `SourceUrl`, `SourceLicense`,
  `SpecsJson`), `Categories`, `ProductCategories`, `Tags`, `ProductTags`, with
  the unique SKU/slug and filtered primary-category indexes.
- A running API for the final SQL-to-API checks (default
  `http://127.0.0.1:5080`, override with `NINECUBE_API_URL`). Allow ~30 s for
  the first request after a LocalDB cold start; the validator retries.
- Integrated authentication, or a SQL login with INSERT/SELECT on the product
  and tag tables and SELECT on Categories and OrderItems.
- `validate.py` needs an API caller. It logs in as `NINECUBE_DEMO_EMAIL`
  (default `seed-validator@ninecube.local`, password `NINECUBE_DEMO_PASSWORD`);
  if the login is rejected it registers the account first. Nothing privileged
  is used — only the product/category GET endpoints.

PowerShell, from the repository root:

```powershell
$env:NINECUBE_SQL_SERVER = '(localdb)\MSSQLLocalDB'
$env:NINECUBE_SQL_DATABASE = 'NineCubeOrderProcessing'
$env:NINECUBE_API_URL = 'http://127.0.0.1:5080'
```

These two SQL environment variables identify the connection explicitly; the
scripts never silently select a production database. For SQL authentication,
also set `NINECUBE_SQL_USER` and `SQLCMDPASSWORD` in your shell. The password is
read by sqlcmd from its environment, never placed in a command argument or log.
No credentials are stored in this folder. Connections use `-C` to trust the
development server certificate, matching the local application's connection.

## One-time setup

The 15-root Bangladesh taxonomy is not part of the application migrations. It
was installed once, explicitly authorized as setup, with:

```powershell
python seed/seed_categories_bd.py   # idempotent; only adds missing leaves
```

It creates 43 categories (15 roots + the BD leaves such as `led-lighting`,
`ips-batteries`, `panjabi`) and never modifies existing rows. The product
loader itself cannot create or change categories.

## Run order

```powershell
python seed/fetch_open_facts.py
python seed/fetch_huggingface.py
python seed/fetch_official.py
python seed/fetch_more_official.py
python seed/fetch_walton_led.py
python seed/fetch_reference_docs.py
python seed/parse_official.py
python seed/transform.py
python seed/load.py --dry-run
python seed/load.py
python seed/load.py
python seed/load.py
python seed/test_pipeline.py
python seed/validate.py
```

Optional, development databases only (see
[scenarios/README.md](scenarios/README.md)):

```powershell
python seed/load.py --with-scenarios   # catalogue load, then TEST: fixtures
python seed/scenarios/cleanup.py       # remove exactly the fixtures
```

`fetch_walton_led.py` follows only product URLs already present in the cached
Walton LED category pages; `fetch_reference_docs.py` resolves the Wikipedia
summary page for every leaf that has no usable official source, refusing to
guess URLs (`clean/reference-docs.json`). `parse_official.py` extracts factual
names and listed BDT prices from the cached official catalogues (Walton phones,
refrigerators and LED products, Bata, Hatil, Apex) into `raw/official.json`.
`brands_input.csv` records which brand/leaf combinations were attempted and the
outcome, including the leaves left to section-4.7 generic fallbacks.

Each command must succeed before the next dependent command. Fetches cache
successful responses with SHA-256, original URL, UTC timestamp and license in
`raw/manifest.json`; `raw/` is gitignored. Requests use an identifying
User-Agent, run at most once per second per host, stop a source batch on error,
and never bypass robots, logins, challenges or rate limits. No competitor
store (Daraz, Star Tech, Ryans, Pickaboo, Chaldal, Rokomari, Othoba) is
requested. Open Food Facts and DGDA were unavailable this session; the cached
BD extract was reused and the failures are reported, not hidden.

## Records and identity

`transform.py` covers every leaf of the installed tree — 145 clean products
across 25 leaves. Sources, in order of preference: official catalogue name +
listed price (price-verified, no review flag unless VAT/variant caveats
apply), Open Food Facts BD identities and the pinned MIT phone dataset
(estimated BDT ranges, `needs_review=true`), and at most the 26 generic
section-4.7 items that cite verified Wikipedia reference pages (always
`needs_review=true`, `placeholder=true`). `clean/coverage.json` records per
leaf what was imported and why any leaf stays below eight products; fewer are
seeded rather than invented.

Identity: `slug` is the readable kebab-case name. `sku` uses a compact readable
label plus a six-character SHA-256 suffix (at most 24 characters). The unique
index and migration collision checks enforce uniqueness. `clean/sku-migration.json`
records the reviewed old-to-new mapping for 145 former hash-only SKUs. Since the
`ProductProvenanceAndCurrency` migration the `Slug` column is persisted
directly and unique; the SKU keeps its insert-if-missing role and pre-migration
rows keep their `legacy-product-<Id>` slugs — the loader never updates existing
products. Currency (BDT), provenance, price basis/verified timestamp, review
state and specs are now stored in their new columns instead of JSON-only.
Names/descriptions map to `Name`/`Description`; every product gets exactly one
primary category plus extras via `ProductCategories`, and brand (`Brand: …`),
origin and price-tier tags via `ProductTags` (`clean/allowed-tags.json` is the
vocabulary; Eid/festival tags appear only on the seasonal fashion generics).
Stock is deterministic from the slug hash: 20–200 units, ~7% zero, ~6% at 1–5.
`price-policy.json` holds the per-category BDT ranges and tier thresholds. All
image URLs are NULL because reuse permission was not verified.

## Write guarantees

Preflight (`validate_records`) rejects an empty dataset, a missing/nonleaf
primary, missing extra categories, invalid/duplicate slugs or normalized
identities, absent brand/tier tags, unapproved tags, invalid prices/stock,
over-long attribution and a slug reused under another name (SQL `THROW 51005`).
A primary category is always required, so no product can end up with zero
categories.

Each primary-category batch uses a serializable transaction with XACT_ABORT
under the `NineCube.Categories` application lock, so a concurrent taxonomy
change cannot slip in. Products, category links, tags and tag links commit
together; a failure rolls back only the current batch and a rerun resumes
safely.

Idempotency is add-only for existing products: the loader never UPDATEs or
DELETEs a product row, so stock, prices, timestamps and rowversions of
pre-existing products are preserved, and a primary link is created only for
products that have no category rows at all (new inserts). Reruns insert
nothing and add only missing extra-category links and missing tag links.
Categories, Orders, OrderItems and every other application table receive no
writes. `load-runs.json` records before/after counts, inserted/links/tags
counts and full preservation comparisons; `validate.py` requires the last two
catalogue runs to be exact no-ops. `test_pipeline.py` adds a rollback probe
that fails after inserts and proves nothing survives.

## Validation and reporting

`validate.py` re-checks the clean records, then runs SQL invariants (exactly
one primary per product, positive prices, unique SKUs and slugs, no orphan
tags, source URL on every `BD-%` row, every seed extra-category and tag link
present, category counts matching the API tree) and 14 API behaviour checks:
descendant vs direct-only queries, cross-listed products appearing under both
categories and once in the combined query, price/tag/inStock filters, all four
sorts, keyword search and 404 on an unknown slug. It writes
`clean/validation.json` and regenerates the root `SEED_REPORT.md`, exiting
nonzero on any failed invariant.

## Attribution and reproducibility

See [DATA_LICENSES.md](DATA_LICENSES.md), per-record `source_url` and
`source_license`, `clean/source-manifest.json`, and the pinned Hugging Face
revision in `raw/hf-provenance.json`. Descriptions are original ≤150-character
seed copy; no source descriptions or images were reused. Validation describes
the database selected by your environment; running the scripts against another
database regenerates that database's evidence and report.
