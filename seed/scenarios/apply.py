"""Dev-only scenario fixtures (brief section 9). Never run by default.
Creates clearly-prefixed TEST: rows plus two TEST categories so staff and
automated tests can exercise the fallback, cross-list, inactive, out-of-stock
and hidden-category rules. scenarios/cleanup.py removes exactly these rows and
never touches catalogue data.
"""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from common import CLEAN, save_json, sku, sql, sql_json
from load import batch_sql

CATEGORIES = [
    ("TEST: Inactive Category", "test-inactive-category", 0),
    ("TEST: Empty Category", "test-empty-category", 1),
]

def fixture(slug, name, primary, extras=(), active=True, stock=10):
    return dict(name=name, slug=slug, sku=sku(slug), currency="BDT", price=111.0,
        stockQuantity=stock, isActive=active, shortDescription=name + " (dev fixture; remove via scenarios/cleanup.py)",
        primaryCategorySlug=primary, extraCategorySlugs=list(extras), tags=["Brand: Scenario test", "Budget"],
        specs={}, imageUrl=None, needs_review=True, review_reasons=["Dev-only scenario fixture"],
        placeholder=True, requires_dgda=False, requires_bsti=None,
        price_basis="Arbitrary fixture price", source_name="Scenario fixture (dev only)",
        source_url="local-dev-fixture://ninecube/seed/scenarios", source_license="None; development fixture")

FIXTURES = [
    fixture("test-uncategorized-single", "TEST: Uncategorized Fallback Single", "uncategorized"),
    fixture("test-two-category", "TEST: Two Category Cross Listed", "chairs", ["beds"]),
    fixture("test-inactive-product", "TEST: Inactive Product", "uncategorized", active=False),
    fixture("test-out-of-stock-product", "TEST: Out Of Stock Product", "uncategorized", stock=0),
    fixture("test-orderable-in-hidden-category", "TEST: Orderable Under Hidden Category", "test-inactive-category", stock=10),
]

def main():
    statement = ("SET XACT_ABORT ON; BEGIN TRANSACTION;\n"
        "DECLARE @lock int; EXEC @lock=sp_getapplock @Resource='NineCube.Categories',@LockMode='Exclusive',"
        "@LockOwner='Transaction',@LockTimeout=15000; IF @lock<0 THROW 51000,'Taxonomy lock failed',1;\n")
    for name, slug, active in CATEGORIES:
        statement += (f"IF NOT EXISTS(SELECT 1 FROM Categories WHERE Slug=N'{slug}') "
            f"INSERT Categories(Name,Slug,ParentId,Path,Depth,SortOrder,IsActive) "
            f"VALUES (N'{name}',N'{slug}',NULL,N'/{slug}/',1,99,{active});\n")
    statement += "COMMIT;"
    sql(statement)
    inserted = 0
    for category in sorted({f["primaryCategorySlug"] for f in FIXTURES}):
        result = sql(batch_sql([f for f in FIXTURES if f["primaryCategorySlug"] == category]))
        inserted += json.loads("".join(result.splitlines()))[0]["inserted"]
    counts = sql_json("SELECT (SELECT COUNT(*) FROM Products) AS Products,(SELECT COUNT(*) FROM ProductCategories) AS ProductCategories,(SELECT COUNT(*) FROM Categories) AS Categories")[0]
    history_path = CLEAN / "load-runs.json"
    history = json.loads(history_path.read_text(encoding="utf-8")) if history_path.exists() else []
    history.append(dict(at=datetime.now(timezone.utc).isoformat(), kind="scenarios", inserted=inserted,
        counts=counts, note="Dev-only TEST: fixtures and two TEST categories; excluded from catalogue validation"))
    save_json(history_path, history)
    print(json.dumps(dict(kind="scenarios", inserted=inserted, counts=counts)))

if __name__ == "__main__":
    main()
