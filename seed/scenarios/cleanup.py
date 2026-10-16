"""Remove exactly the rows created by scenarios/apply.py.
Deletes only the five TEST: fixture SKUs, the scenario brand tag once unused,
and the two TEST categories. Catalogue products, links, tags, categories and
orders are untouched; the guard rails below refuse to run if a TEST slug ever
accumulated non-fixture links.
"""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from common import CLEAN, save_json, sku, sql, sql_json
from apply import CATEGORIES, FIXTURES

def main():
    skus = [f["sku"] for f in FIXTURES]
    slugs = [f["slug"] for f in FIXTURES]
    ids = ",".join(f"'{s}'" for s in skus)
    guarded = sql_json(f"""SELECT p.Id FROM Products p WHERE p.Sku IN ({ids})
        AND (p.Slug NOT IN ({",".join(f"'{s}'" for s in slugs)}) OR p.Name NOT LIKE 'TEST:%' OR p.Sku NOT LIKE 'BD-%')""")
    if guarded:
        raise SystemExit(f"Refusing cleanup: product rows {guarded} no longer look like fixtures.")
    category_ids = sql_json("""SELECT Id FROM Categories WHERE Slug IN ('test-inactive-category','test-empty-category')""")
    statement = ("SET XACT_ABORT ON; BEGIN TRANSACTION;\n"
        "DECLARE @lock int; EXEC @lock=sp_getapplock @Resource='NineCube.Categories',@LockMode='Exclusive',"
        "@LockOwner='Transaction',@LockTimeout=15000; IF @lock<0 THROW 51000,'Taxonomy lock failed',1;\n"
        f"DECLARE @ids table(Id int PRIMARY KEY); INSERT @ids SELECT Id FROM Products WHERE Sku IN ({ids});\n"
        "IF EXISTS(SELECT 1 FROM ProductCategories pc JOIN @ids x ON x.Id=pc.ProductId "
        "JOIN Products p ON p.Id=pc.ProductId WHERE p.Name NOT LIKE 'TEST:%') THROW 51001,'Non-fixture category link',1;\n"
        "DELETE ProductTags WHERE ProductId IN (SELECT Id FROM @ids);\n"
        "DELETE ProductCategories WHERE ProductId IN (SELECT Id FROM @ids);\n"
        "DELETE Products WHERE Id IN (SELECT Id FROM @ids);\n"
        "DELETE Tags WHERE Name=N'Brand: Scenario test' AND NOT EXISTS(SELECT 1 FROM ProductTags pt WHERE pt.TagId=Tags.Id);\n")
    for _, slug, _ in CATEGORIES:
        statement += (f"IF EXISTS(SELECT 1 FROM ProductCategories pc JOIN Categories c ON c.Id=pc.CategoryId "
            f"WHERE c.Slug=N'{slug}') THROW 51002,'Category still linked',1;\n"
            f"DELETE Categories WHERE Slug=N'{slug}';\n")
    statement += "COMMIT;"
    sql(statement)
    leftovers = sql_json(f"""SELECT (SELECT COUNT(*) FROM Products WHERE Sku IN ({ids})) AS products,
        (SELECT COUNT(*) FROM Categories WHERE Slug IN ('test-inactive-category','test-empty-category')) AS categories,
        (SELECT COUNT(*) FROM Tags WHERE Name=N'Brand: Scenario test') AS tags""")[0]
    if any(leftovers.values()):
        raise RuntimeError(f"Scenario cleanup left rows behind: {leftovers}")
    counts = sql_json("SELECT (SELECT COUNT(*) FROM Products) AS Products,(SELECT COUNT(*) FROM ProductCategories) AS ProductCategories,(SELECT COUNT(*) FROM Categories) AS Categories")[0]
    history_path = CLEAN / "load-runs.json"
    history = json.loads(history_path.read_text(encoding="utf-8")) if history_path.exists() else []
    history.append(dict(at=datetime.now(timezone.utc).isoformat(), kind="scenario-cleanup",
        removed=leftovers, counts=counts, note="All TEST: rows removed; counts restored"))
    save_json(history_path, history)
    print(json.dumps(dict(kind="scenario-cleanup", counts=counts, verified_empty=leftovers)))

if __name__ == "__main__":
    main()
