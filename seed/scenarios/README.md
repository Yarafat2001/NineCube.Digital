# Dev-only scenario fixtures (brief section 9)

These scripts exercise edge cases the catalogue itself never contains: a product
with no category beyond the `uncategorized` fallback, a product cross-listed in
two categories, an inactive product, an out-of-stock product, an orderable
product under a hidden (inactive) category, and an empty category.

**Never run these against anything but a development database.** They are not
part of the normal load; `load.py --with-scenarios` is the intended entry point,
and `validate.py` ignores their history entries (`kind` is `scenarios` /
`scenario-cleanup`, catalogue validation reads only `catalogue` runs).

## What apply.py creates

Two categories, clearly prefixed so they can never be confused with real
taxonomy:

| Category | IsActive |
|---|---|
| `TEST: Inactive Category` (`test-inactive-category`) | 0 |
| `TEST: Empty Category` (`test-empty-category`) | 1 |

Five products, all named `TEST: …`, all with `needs_review=true`, an obviously
arbitrary price, and the `Brand: Scenario test` tag:

| Slug | Demonstrates |
|---|---|
| `test-uncategorized-single` | single-category fallback under `uncategorized` |
| `test-two-category` | cross-listing (`chairs` primary + `beds` extra) |
| `test-inactive-product` | inactive product stays invisible to default queries |
| `test-out-of-stock-product` | zero stock, still listed |
| `test-orderable-in-hidden-category` | active, stocked product under the hidden category |

Products are inserted through the same `load.batch_sql` statement as catalogue
rows, so they inherit every loader guarantee (leaf-primary check, SKU identity,
serializable batch, app lock). The two TEST categories are inserted under the
same `NineCube.Categories` application lock.

## Run

```powershell
python seed/load.py --with-scenarios   # catalogue first, then fixtures
# … verify behaviour, then:
python seed/scenarios/cleanup.py
```

Re-running `apply.py` is a no-op for existing fixtures (same SKUs); reruns only
add missing links.

## What cleanup.py removes

Only the five fixture SKUs (their `ProductTags`, `ProductCategories`, `Products`
rows), the `Brand: Scenario test` tag once no product references it, and the two
TEST categories. It refuses to run if any fixture row's SKU, slug or `TEST:`
name no longer matches the fixtures, or if either TEST category accumulated a
link to a non-fixture product. After the DELETEs it verifies zero leftovers and
aborts loudly otherwise, then records a `scenario-cleanup` entry with the
restored table counts.

Orders and OrderItems are never touched by either script; the hidden-category
fixture is orderable in principle, so if you place a test order against it,
delete the order through the application before cleanup (cleanup would
otherwise refuse to remove a linked category).
