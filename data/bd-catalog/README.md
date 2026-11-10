# Bangladesh master seed dataset (bd-master-seed-v1)

A generated, system-aligned product catalog for the NineCube.Digital
Bangladesh market demo:

- **5,300 products**, deterministic and reproducible
- **107 categories** (all 107 slugs from `seed/required_categories.csv`,
  organized into a 16-root retailer taxonomy, max depth 3 — `Category.Path`,
  `Depth`, `SortOrder` precomputed to match `src/NineCube.Domain/Categories.cs`)
- **198 brands** (real Bangladesh-market brands: Walton, Pran, Aarong, Bata,
  Apex, Hatil, Berger, Hamko, Robi, Grameenphone, toffee, 10 Minute School, …)
- Currency **BDT**, price bands aligned with `seed/clean/price-policy.json`
- **One image per product** at `web/public/products/bd/<slug>.jpg`
  (800×800, license-free generated cards served as `/products/bd/...`)

## Files

| File | Purpose |
| --- | --- |
| `bd-catalog.json` | Full dataset. Category/product rows are field-compatible with `ProductionCatalogImporter.Feed`; products additionally carry `unitCost`, `compareAtPrice`, `brand`, `imageUrl` |
| `report.json` | Generation/coverage statistics (per-leaf counts, flags) |

## Data conventions (system alignment)

- `Sku` — `BD-BRN4-CAT4-SEQ-XXXXXX` (≤24 chars, unique; same scheme as
  `seed/clean/sku-migration.json`)
- `Slug` — readable kebab-case (unique, ≤200)
- `Name` ≤ 60 chars; `Description` ≤ 280 chars, original seeded copy
- `PriceBasis` records the seeded BDT band; `PriceVerifiedAt` set only for
  non-review rows; ~15% of rows flagged `NeedsReview` for merchant sampling
- Stock: deterministic hash-based 20–200, ~7% zero, ~6% at 1–5 (same policy
  as `seed/load.py`)
- Tags reuse the `seed/clean/allowed-tags.json` vocabulary: `Brand: X`,
  `Budget` / `Mid-range` / `Premium`, `Local Brand` / `Imported`,
  `Made in Bangladesh`, occasional `Eid` / `Gaming`
- `SpecsJson` — category-appropriate attributes (RAM/storage, capacity,
  pack size, fabric, origin, warranty)
- Provenance: `SourceName` = `NineCube BD master seed v1 (generated)`,
  `SourceLicense` = generated dataset — every row traceable as seed data

## Reproduce / regenerate

```powershell
python seed/bd_master_seed/generate_bd_catalog.py   # dataset (deterministic)
python seed/bd_master_seed/load_bd_catalog.py --check   # validate locally
python seed/bd_master_seed/load_bd_catalog.py --dry-run # DB counts, no writes
python seed/bd_master_seed/load_bd_catalog.py           # apply (add-only, idempotent)
```

## Loading into the system

`load_bd_catalog.py` adapts to the current database target:

- **PostgreSQL** (the app's EF provider): set `NINECUBE_PG_DSN`
  (or `DATABASE_URL`, `postgres://…`). Uses `psycopg[binary]`/`psycopg2`.
- **SQL Server** (local dev compose): set `NINECUBE_SQL_SERVER` +
  `NINECUBE_SQL_DATABASE` (plus `NINECUBE_SQL_USER` / `SQLCMDPASSWORD` for
  SQL auth, `NINECUBE_SQL_ENCRYPT=yes|no`). Uses `pyodbc` ODBC Driver 18.

Write guarantees mirror `seed/load.py`: insert-only, idempotent re-runs,
parent-first category inserts, exactly one primary `ProductCategories` row,
primary `ProductImages` row per new product, tag links added for missing only
and an `InventoryMovements` ledger row for positive opening stock. No existing
product, order, or category row is ever modified.

## Image assets

Generated product art was retired in November 2026. The dataset no longer emits
`/products/bd/` URLs, the generator script was removed, and the 6,874 flat-vector
files were deleted from the repository. Products without a sourced photograph
render the storefront's own "No image" placeholder; real photography lives under
`web/public/products/` and is attached by the image backfill pipeline.

## Verification (live PostgreSQL, 2026-11-07)

Applied against the dev database `ninecube` (PostgreSQL 18 container,
`127.0.0.1:5433`), which already held 183 products from earlier pipeline runs:

| Check | Result |
| --- | --- |
| Products inserted | 5,300 (5,483 total in DB; pre-existing rows untouched) |
| Exactly one primary category per product | **0 violations** |
| Products missing/with multiple primary images | **0** |
| Zero/negative prices or stock | **0** |
| Category depth > 4 | **0** |
| Opening-stock ledger rows (`InventoryMovements`) | 4,935 (stock>0 rows only) |
| Rerun idempotency | Exact no-op: 0 inserts on second apply |

The loader also adapts when the target predates the latest EF migrations —
e.g. it writes `UnitCost` only when the column exists on the target, and
SKU/slug-based idempotency guarantees conflict-safe reruns.
