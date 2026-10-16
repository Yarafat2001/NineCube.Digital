"""Insert new products only, one serializable transaction per primary category."""
import argparse
import sys
from collections import Counter
from datetime import datetime, timezone
import json
import re
from common import ParameterizedSql, CLEAN, ROOT, categories, save_json, sku, sql, sql_json

def validate_records(records, tree, allowed_tags):
    if not records:
        raise ValueError("No clean products. Fetch and transform first.")
    by_slug = {c["Slug"]: c for c in tree}
    parents = {c.get("ParentId") for c in tree}
    seen = set()
    identities = set()
    for p in records:
        slug = p["slug"]
        if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug) or len(slug) > 400 or slug in seen:
            raise ValueError("Invalid, oversized or duplicate slug: " + slug)
        seen.add(slug)
        if p.get("sku") != sku(slug):
            raise ValueError("Slug/SKU mapping mismatch: " + slug)
        category = by_slug.get(p["primaryCategorySlug"])
        if not category or category["Id"] in parents:
            raise ValueError("Primary category missing or not a leaf: " + p["primaryCategorySlug"])
        for extra in p["extraCategorySlugs"]:
            if extra not in by_slug:
                raise ValueError("Extra category missing: " + extra)
        if not p["name"].strip() or len(p["name"]) > 200 or len(p["shortDescription"]) > 150:
            raise ValueError("Invalid name/description: " + slug)
        if p["currency"] != "BDT" or not 0 < p["price"] < 10**12 or round(p["price"], 2) != p["price"]:
            raise ValueError("Invalid BDT price: " + slug)
        if type(p["stockQuantity"]) is not int or not 0 <= p["stockQuantity"] <= 200:
            raise ValueError("Invalid stock: " + slug)
        if type(p["isActive"]) is not bool or type(p["needs_review"]) is not bool:
            raise ValueError("Invalid boolean: " + slug)
        if not p["tags"] or any(t not in allowed_tags or len(t) > 80 for t in p["tags"]):
            raise ValueError("Unknown/invalid tag: " + slug)
        if len([t for t in p["tags"] if t in {"Budget", "Mid-range", "Premium"}]) != 1:
            raise ValueError("Exactly one price tier is required: " + slug)
        brands = [t for t in p["tags"] if t.startswith("Brand: ")]
        if len(brands) != 1:
            raise ValueError("Exactly one sourced brand is required: " + slug)
        from transform import normalized
        identity = (normalized(p["name"]), normalized(brands[0]))
        if identity in identities:
            raise ValueError("Duplicate normalized name + brand: " + slug)
        identities.add(identity)
        if p.get("imageUrl") is not None:
            raise ValueError("This adapter imports no images; provide a reviewed image-license adapter first.")
        if any(not p.get(field) for field in ["source_name", "source_url", "source_license"]):
            raise ValueError("Source attribution missing: " + slug)
        if (len(p["source_name"]) > 300 or len(p["source_url"]) > 600 or len(p["source_license"]) > 600
                or len(p.get("price_basis") or "") > 600):
            raise ValueError("Attribution field exceeds loader column size: " + slug)

def snapshot():
    return dict(products=sql_json("SELECT Id,Sku,Slug,Name,Price,Currency,NeedsReview,StockQuantity,IsActive,CONVERT(varchar(18),RowVersion,1) AS RowVersion FROM Products ORDER BY Id"),
                categories=categories(), order_items=sql_json("SELECT * FROM OrderItems ORDER BY Id"),
                counts=sql_json("SELECT (SELECT COUNT(*) FROM Products) AS Products,(SELECT COUNT(*) FROM ProductCategories) AS ProductCategories,(SELECT COUNT(*) FROM Tags) AS Tags,(SELECT COUNT(*) FROM ProductTags) AS ProductTags")[0])

def batch_sql(records):
    rows = [dict(sku=p["sku"], slug=p["slug"], name=p["name"], price=p["price"],
        stockQuantity=p["stockQuantity"], isActive=p["isActive"], shortDescription=p["shortDescription"],
        currency=p["currency"], needsReview=bool(p["needs_review"]), priceBasis=p.get("price_basis"),
        priceVerifiedAt=(p.get("price_verified_at") or "")[:26] or None,
        sourceName=p["source_name"], sourceUrl=p["source_url"], sourceLicense=p["source_license"],
        specsJson=json.dumps(p.get("specs") or {}, ensure_ascii=False),
        primaryCategorySlug=p["primaryCategorySlug"], extraCategorySlugs=p["extraCategorySlugs"],
        tags=p["tags"]) for p in records]
    payload = json.dumps(rows, ensure_ascii=False)
    return ParameterizedSql("""
SET XACT_ABORT ON;
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
BEGIN TRANSACTION;
DECLARE @lock int;
EXEC @lock=sp_getapplock @Resource='NineCube.Categories',@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=15000;
IF @lock < 0 THROW 51000, 'Category lock could not be acquired', 1;
DECLARE @input nvarchar(max)=?;
SELECT * INTO #Input FROM OPENJSON(@input) WITH (
    sku nvarchar(64),slug nvarchar(400),name nvarchar(200),price decimal(18,2),stockQuantity int,isActive bit,
    shortDescription nvarchar(150),currency nvarchar(6),needsReview bit,priceBasis nvarchar(600),
    priceVerifiedAt datetime2,sourceName nvarchar(300),sourceUrl nvarchar(600),sourceLicense nvarchar(600),
    specsJson nvarchar(max),primaryCategorySlug nvarchar(120),
    extraCategorySlugs nvarchar(max) AS JSON,tags nvarchar(max) AS JSON);
DECLARE @links int=0,@tags int=0;
IF EXISTS(SELECT 1 FROM #Input i LEFT JOIN Categories c ON c.Slug=i.primaryCategorySlug
    WHERE c.Id IS NULL OR EXISTS(SELECT 1 FROM Categories child WHERE child.ParentId=c.Id))
    THROW 51001, 'Primary category missing or not a leaf', 1;
IF EXISTS(SELECT 1 FROM #Input i CROSS APPLY OPENJSON(i.extraCategorySlugs) e
    LEFT JOIN Categories c ON c.Slug=e.value WHERE c.Id IS NULL)
    THROW 51002, 'Extra category missing', 1;
IF EXISTS(SELECT 1 FROM #Input i JOIN Products p ON p.Sku=i.sku WHERE p.Name<>i.name)
    THROW 51003, 'Stable SKU belongs to a different product name', 1;
IF EXISTS(SELECT 1 FROM #Input i JOIN Products p ON p.Slug=i.slug AND p.Sku<>i.sku)
    THROW 51005, 'Slug belongs to a different product', 1;
DECLARE @New TABLE(Id int PRIMARY KEY,Sku nvarchar(64));
INSERT INTO Products(Sku,Name,Slug,Description,ImageUrl,Price,Currency,NeedsReview,PriceBasis,PriceVerifiedAt,
    SourceName,SourceUrl,SourceLicense,SpecsJson,StockQuantity,IsActive,CreatedAt,UpdatedAt)
OUTPUT inserted.Id,inserted.Sku INTO @New
SELECT i.sku,i.name,i.slug,i.shortDescription,NULL,i.price,i.currency,i.needsReview,i.priceBasis,i.priceVerifiedAt,
    i.sourceName,i.sourceUrl,i.sourceLicense,i.specsJson,i.stockQuantity,i.isActive,SYSUTCDATETIME(),SYSUTCDATETIME()
FROM #Input i WHERE NOT EXISTS(SELECT 1 FROM Products p WITH(UPDLOCK,HOLDLOCK) WHERE p.Sku=i.sku);
DECLARE @Targets TABLE(Id int PRIMARY KEY,Sku nvarchar(64));
INSERT INTO @Targets SELECT Id,Sku FROM @New
UNION SELECT p.Id,i.sku FROM #Input i JOIN Products p WITH(UPDLOCK,HOLDLOCK) ON p.Sku=i.sku;
-- Primary link only when the product has no category rows at all (new inserts).
INSERT INTO ProductCategories(ProductId,CategoryId,IsPrimary)
SELECT t.Id,c.Id,1 FROM @Targets t JOIN #Input i ON i.sku=t.Sku JOIN Categories c ON c.Slug=i.primaryCategorySlug
WHERE NOT EXISTS(SELECT 1 FROM ProductCategories pc WHERE pc.ProductId=t.Id);
-- Missing extra-category links, including for pre-existing products; never repoints a primary.
INSERT INTO ProductCategories(ProductId,CategoryId,IsPrimary)
SELECT DISTINCT t.Id,c.Id,0 FROM @Targets t JOIN #Input i ON i.sku=t.Sku
CROSS APPLY OPENJSON(i.extraCategorySlugs) e JOIN Categories c ON c.Slug=e.value
WHERE NOT EXISTS(SELECT 1 FROM ProductCategories pc WHERE pc.ProductId=t.Id AND pc.CategoryId=c.Id);
SET @links=@@ROWCOUNT;
INSERT INTO Tags(Name)
SELECT DISTINCT CAST(j.value AS nvarchar(80)) FROM @Targets t JOIN #Input i ON i.sku=t.Sku
CROSS APPLY OPENJSON(i.tags) j WHERE NOT EXISTS(SELECT 1 FROM Tags existing WITH(UPDLOCK,HOLDLOCK) WHERE existing.Name=j.value);
INSERT INTO ProductTags(ProductId,TagId)
SELECT DISTINCT t.Id,tag.Id FROM @Targets t JOIN #Input i ON i.sku=t.Sku
CROSS APPLY OPENJSON(i.tags) j JOIN Tags tag ON tag.Name=j.value
WHERE NOT EXISTS(SELECT 1 FROM ProductTags pt WHERE pt.ProductId=t.Id AND pt.TagId=tag.Id);
SET @tags=@@ROWCOUNT;
IF EXISTS(SELECT t.Id FROM @Targets t LEFT JOIN ProductCategories pc ON pc.ProductId=t.Id
    GROUP BY t.Id HAVING COUNT(pc.CategoryId)=0 OR SUM(CASE WHEN pc.IsPrimary=1 THEN 1 ELSE 0 END)<>1)
    THROW 51004, 'Category invariant violated', 1;
COMMIT;
SELECT (SELECT COUNT(*) FROM @New) AS inserted,@links AS linksAdded,@tags AS tagsAdded FOR JSON PATH;
""", [payload])

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--with-scenarios", action="store_true",
                        help="dev only: after the catalogue load, apply scenarios/apply.py TEST: fixtures")
    args = parser.parse_args()
    # The latest master brief explicitly requires stopping on missing target slugs.
    from preflight_master import main as master_preflight
    master_preflight()
    records = json.loads((CLEAN / "products.json").read_text(encoding="utf-8"))
    allowed_tags = json.loads((CLEAN / "allowed-tags.json").read_text(encoding="utf-8"))
    validate_records(records, categories(), allowed_tags)
    if args.dry_run:
        print("Preflight passed; no writes.")
        return
    before = snapshot()
    # Do not duplicate pre-existing products with the same normalized name and brand.
    from transform import normalized
    existing = sql_json("SELECT p.Sku,p.Name,t.Name AS Brand FROM Products p JOIN ProductTags pt ON pt.ProductId=p.Id JOIN Tags t ON t.Id=pt.TagId WHERE t.Name LIKE 'Brand: %'")
    existing_identities = {(normalized(p["Name"]), normalized(p["Brand"])): p["Sku"] for p in existing}
    skipped = []
    selected = []
    for p in records:
        brand = next(t for t in p["tags"] if t.startswith("Brand: "))
        match = existing_identities.get((normalized(p["name"]), normalized(brand)))
        if match and match != p["sku"]:
            skipped.append(dict(slug=p["slug"], reason="Existing normalized name + brand", sku=match))
        else:
            selected.append(p)
    inserted = {}
    links_added = tags_added = 0
    for category in sorted({p["primaryCategorySlug"] for p in selected}):
        # SQL checks leaves again under the same category lock used by the application.
        result = sql(batch_sql([p for p in selected if p["primaryCategorySlug"] == category]))
        row = json.loads("".join(result.splitlines()))[0]
        inserted[category] = row["inserted"]
        links_added += row.get("linksAdded", 0)
        tags_added += row.get("tagsAdded", 0)
    after = snapshot()
    old_ids = {p["Id"]: p for p in before["products"]}
    preserved = all(p == old_ids[p["Id"]] for p in after["products"] if p["Id"] in old_ids)
    evidence = dict(at=datetime.now(timezone.utc).isoformat(), inserted=inserted, skipped=skipped,
        links_added=links_added, tags_added=tags_added,
        before=before["counts"], after=after["counts"], existing_products_unchanged=preserved,
        categories_unchanged=before["categories"] == after["categories"],
        order_items_unchanged=before["order_items"] == after["order_items"])
    history_path = CLEAN / "load-runs.json"
    history = json.loads(history_path.read_text(encoding="utf-8")) if history_path.exists() else []
    history.append(evidence)
    save_json(history_path, history)
    print(json.dumps(evidence, indent=2))
    if not all(evidence[k] for k in ["existing_products_unchanged", "categories_unchanged", "order_items_unchanged"]):
        raise RuntimeError("Preservation check failed; inspect concurrent application activity and load-runs.json.")
    if args.with_scenarios:
        import subprocess
        subprocess.run([sys.executable, str(ROOT / "scenarios" / "apply.py")], check=True)

if __name__ == "__main__":
    main()
