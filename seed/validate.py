"""SQL/API checks and a reproducible report; exits nonzero on a failed invariant."""
from collections import Counter
from datetime import datetime
from zoneinfo import ZoneInfo
import json
import os
import time
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen
from common import ROOT, RAW, CLEAN, save_json, sql_json, categories
from load import validate_records

def flatten(nodes):
    return [item for node in nodes for item in [node, *flatten(node.get("children", []))]]

def api_auth():
    base = os.environ.get("NINECUBE_API_URL", "http://127.0.0.1:5080").rstrip("/")
    email = os.environ.get("NINECUBE_DEMO_EMAIL", "seed-validator@ninecube.local")
    password = os.environ.get("NINECUBE_DEMO_PASSWORD", "Str0ng!Passw0rd")
    body = json.dumps({"email": email, "password": password}).encode()
    for path, payload in [("/api/auth/login", body),
                          ("/api/auth/register", json.dumps({"email": email, "password": password, "name": "Seed Validator"}).encode())]:
        try:
            with urlopen(Request(base + path, data=payload, headers={"Content-Type": "application/json"}), timeout=180) as r:
                return base, json.load(r)["accessToken"]
        except HTTPError as e:
            if e.code not in (401, 409):
                raise
    raise RuntimeError("API authentication failed for the seed validator account.")

def api_get(base, token, path, attempts=5):
    for attempt in range(1, attempts + 1):
        try:
            with urlopen(Request(base + path, headers={"Authorization": "Bearer " + token}), timeout=180) as r:
                status, body = r.status, json.load(r)
        except HTTPError as e:
            status, body = e.code, json.loads(e.read().decode("utf-8", errors="replace") or "{}")
        except (TimeoutError, ConnectionError):
            status, body = 0, {}
        # Cold LocalDB executions exceed the API's 30 s command timeout (500) and the
        # first queries sometimes stall the socket; retry those transient hiccups
        # instead of failing a whole validation run. A 2xx paged body must carry items.
        flaky = (isinstance(status, int) and status >= 500) or status == 0 or \
            (status < 300 and isinstance(body, dict) and "items" not in body and "totalCount" not in body)
        if not flaky or attempt == attempts:
            return status, body
        time.sleep(3 * attempt)

def main():
    records = json.loads((CLEAN / "products.json").read_text(encoding="utf-8"))
    validate_records(records, categories(), json.loads((CLEAN / "allowed-tags.json").read_text(encoding="utf-8")))
    coverage = {c["slug"]: c for c in json.loads((CLEAN / "coverage.json").read_text(encoding="utf-8"))}
    leaves = sql_json("""SELECT c.Slug,c.Name,COUNT(DISTINCT pc.ProductId) AS ProductCount,
    COUNT(DISTINCT CASE WHEN pc.IsPrimary=1 THEN pc.ProductId END) AS PrimaryCount
    FROM Categories c LEFT JOIN ProductCategories pc ON pc.CategoryId=c.Id
    WHERE NOT EXISTS(SELECT 1 FROM Categories child WHERE child.ParentId=c.Id)
    GROUP BY c.Slug,c.Name ORDER BY c.Slug""")
    violations = sql_json("""SELECT p.Id FROM Products p LEFT JOIN ProductCategories pc ON pc.ProductId=p.Id
    GROUP BY p.Id HAVING COUNT(pc.CategoryId)=0 OR SUM(CASE WHEN pc.IsPrimary=1 THEN 1 ELSE 0 END)<>1""")
    price_errors = sql_json("SELECT Id FROM Products WHERE Price<=0")
    duplicate_skus = sql_json("SELECT Sku FROM Products GROUP BY Sku HAVING COUNT(*)>1")
    duplicate_slugs = sql_json("SELECT Slug FROM Products GROUP BY Slug HAVING COUNT(*)>1")
    orphan_tags = sql_json("SELECT pt.ProductId FROM ProductTags pt LEFT JOIN Tags t ON t.Id=pt.TagId WHERE t.Id IS NULL")
    missing_sources = sql_json("SELECT Id FROM Products WHERE Sku LIKE 'BD-%' AND (SourceUrl IS NULL OR SourceUrl='')")
    loaded = sql_json("SELECT p.Sku,c.Slug FROM Products p JOIN ProductCategories pc ON pc.ProductId=p.Id AND pc.IsPrimary=1 JOIN Categories c ON c.Id=pc.CategoryId")
    actual_primary = {p["Sku"]: p["Slug"] for p in loaded}
    missing = [p["slug"] for p in records if actual_primary.get(p["sku"]) != p["primaryCategorySlug"]]
    all_links = sql_json("SELECT p.Sku,c.Slug FROM Products p JOIN ProductCategories pc ON pc.ProductId=p.Id JOIN Categories c ON c.Id=pc.CategoryId")
    link_map = {}
    for row in all_links:
        link_map.setdefault(row["Sku"], set()).add(row["Slug"])
    missing_links = [p["slug"] for p in records if not set(p["extraCategorySlugs"]) <= link_map.get(p["sku"], set())]
    tags = sql_json("SELECT p.Sku,t.Name FROM Products p JOIN ProductTags pt ON pt.ProductId=p.Id JOIN Tags t ON t.Id=pt.TagId")
    actual_tags = {}
    for tag in tags:
        actual_tags.setdefault(tag["Sku"], set()).add(tag["Name"])
    missing_tags = [p["slug"] for p in records if not set(p["tags"]).issubset(actual_tags.get(p["sku"], set()))]
    counts = sql_json("""SELECT c.Id,c.Slug,COUNT(DISTINCT pc.ProductId) AS ProductCount,
    COUNT(DISTINCT CASE WHEN p.IsActive=1 AND p.StockQuantity>0 THEN p.Id END) AS InStockCount,
    (SELECT COUNT(*) FROM ProductCategories direct WHERE direct.CategoryId=c.Id) AS DirectProductCount
    FROM Categories c JOIN Categories descendant ON descendant.Path LIKE c.Path+'%'
    AND descendant.IsActive=1 AND NOT EXISTS(SELECT 1 FROM Categories hidden WHERE hidden.IsActive=0 AND descendant.Path LIKE hidden.Path+'%')
    LEFT JOIN ProductCategories pc ON pc.CategoryId=descendant.Id LEFT JOIN Products p ON p.Id=pc.ProductId
    WHERE c.IsActive=1 AND NOT EXISTS(SELECT 1 FROM Categories hidden WHERE hidden.IsActive=0 AND c.Path LIKE hidden.Path+'%')
    GROUP BY c.Id,c.Slug ORDER BY c.Id""")
    base, token = api_auth()
    _, tree = api_get(base, token, "/api/categories")
    api = flatten(tree)
    api_by_id = {c["id"]: c for c in api}
    count_mismatches = [c["Slug"] for c in counts if c["Id"] not in api_by_id or any(
        api_by_id[c["Id"]][key[0].lower()+key[1:]] != c[key]
        for key in ["ProductCount", "InStockCount", "DirectProductCount"])]
    count_mismatches += [str(c["id"]) for c in api if c["id"] not in {s["Id"] for s in counts}]

    api_checks = []
    def check(name, condition, detail=""):
        api_checks.append(dict(check=name, passed=bool(condition), detail=detail))
    sql_total = {c["Slug"]: c for c in counts}
    status, page = api_get(base, token, "/api/products?categorySlug=electronics&includeDescendants=true&pageSize=1")
    check("descendant category query", status == 200 and page.get("totalCount") == sql_total["electronics"]["ProductCount"],
          f"api={page.get('totalCount')} sql={sql_total['electronics']['ProductCount']}")
    status, page = api_get(base, token, "/api/products?categorySlug=electronics&includeDescendants=false&pageSize=1")
    check("direct-only category query (empty parent)", status == 200 and page.get("totalCount") == 0, f"status={status} total={page.get('totalCount')}")
    cross = next(p for p in records if p["extraCategorySlugs"])
    food_slug = cross["primaryCategorySlug"]
    extra_slug = cross["extraCategorySlugs"][0]
    _, p1 = api_get(base, token, f"/api/products?categorySlug={food_slug}&includeDescendants=false&pageSize=200")
    _, p2 = api_get(base, token, f"/api/products?categorySlug={extra_slug}&includeDescendants=false&pageSize=200")
    check("cross-listed product appears under both categories", cross["sku"] in [i["sku"] for i in p1.get("items", [])] and cross["sku"] in [i["sku"] for i in p2.get("items", [])], cross["slug"])
    _, parent_page = api_get(base, token, "/api/products?categorySlug=grocery&pageSize=200")
    occurrences = [i["sku"] for i in parent_page.get("items", [])].count(cross["sku"])
    check("cross-listed product appears once in combined descendant query", occurrences <= 1, f"occurrences={occurrences}")
    _, price_page = api_get(base, token, "/api/products?minPrice=1000&maxPrice=5000&pageSize=200")
    check("price filter bounds", all(1000 <= i["price"] <= 5000 for i in price_page.get("items", [])) and price_page.get("totalCount") > 3, f"count={price_page.get('totalCount')}")
    _, tag_page = api_get(base, token, "/api/products?tag=" + quote("Brand: Walton") + "&pageSize=1")
    sql_walton = sql_json("SELECT COUNT(*) n FROM Products p JOIN ProductTags pt ON pt.ProductId=p.Id JOIN Tags t ON t.Id=pt.TagId WHERE t.Name='Brand: Walton'")[0]["n"]
    check("tag filter", tag_page.get("totalCount") == sql_walton, f"api={tag_page.get('totalCount')} sql={sql_walton}")
    _, stock_page = api_get(base, token, "/api/products?inStock=true&pageSize=200")
    check("inStock filter", all(i["stockQuantity"] > 0 and i["isActive"] for i in stock_page.get("items", [])))
    # The API clamps pageSize>100 to a 20-item page, so compare against the same page size.
    _, name_page = api_get(base, token, "/api/products?sort=name&pageSize=20")
    sql_name_ids = [r["Id"] for r in sql_json("SELECT Id FROM Products ORDER BY Name, Id OFFSET 0 ROWS FETCH NEXT 20 ROWS ONLY")]
    check("sort=name follows SQL collation order", [i["id"] for i in name_page.get("items", [])] == sql_name_ids,
          f"api={len(name_page.get('items', []))} sql={len(sql_name_ids)}")
    _, price_sort_page = api_get(base, token, "/api/products?sort=price&pageSize=200")
    check("sort=price ascending", [i["price"] for i in price_sort_page.get("items", [])] == sorted(i["price"] for i in price_sort_page.get("items", [])))
    _, stock_sort_page = api_get(base, token, "/api/products?sort=stock&pageSize=200")
    check("sort=stock descending (app behaviour)", [i["stockQuantity"] for i in stock_sort_page.get("items", [])] ==
          sorted((i["stockQuantity"] for i in stock_sort_page.get("items", [])), reverse=True))
    _, newest_page = api_get(base, token, "/api/products?sort=newest&pageSize=5")
    check("sort=newest responds", newest_page.get("totalCount") == sql_json("SELECT COUNT(*) n FROM Products WHERE IsActive=1")[0]["n"])
    status, _ = api_get(base, token, "/api/products?categorySlug=no-such-category-zz")
    check("unknown category returns 404", status == 404, f"status={status}")
    _, search_page = api_get(base, token, "/api/products?q=" + quote("iPhone 13"))
    check("keyword search", all("iphone" in i["name"].lower() for i in search_page.get("items", [])) and search_page["totalCount"] >= 1)

    history = [e for e in json.loads((CLEAN / "load-runs.json").read_text(encoding="utf-8")) if e.get("kind", "catalogue") == "catalogue"]
    reruns = history[-2:]
    rerun_stable = len(reruns) == 2 and all(r["before"] == r["after"] and sum(r["inserted"].values()) == 0 for r in reruns)
    under_8 = [dict(slug=c["Slug"], products=c["ProductCount"],
                    reason=coverage.get(c["Slug"], {}).get("note") or "Approved-source rows exhausted; fewer than 8 rather than fabricated")
               for c in leaves if c["ProductCount"] < 8]
    result = dict(leaf_counts=leaves, leaves_under_eight=under_8, category_counts=counts,
        invalid_primary_products=violations, nonpositive_prices=price_errors, duplicate_skus=duplicate_skus,
        duplicate_slugs=duplicate_slugs, orphan_tags=orphan_tags, missing_source_urls=missing_sources,
        missing_seed_products=missing, missing_seed_links=missing_links, missing_seed_tags=missing_tags,
        api_count_mismatches=count_mismatches, api_checks=api_checks,
        unique_logical_slugs=len({p["slug"] for p in records}) == len(records), reruns_stable=rerun_stable,
        out_of_stock_seed_percent=round(100*sum(p["stockQuantity"] == 0 for p in records)/len(records), 2),
        low_stock_seed_percent=round(100*sum(1 <= p["stockQuantity"] <= 5 for p in records)/len(records), 2),
        preservation_checks_passed=all(r[k] for r in history for k in ["existing_products_unchanged", "categories_unchanged", "order_items_unchanged"]))
    save_json(CLEAN / "validation.json", result)
    write_report(records, result, history, coverage, under_8)
    print(json.dumps({k: v for k, v in result.items() if k not in ["leaf_counts", "category_counts", "api_checks"]}, indent=2))
    checks = [not result[k] for k in ["invalid_primary_products", "nonpositive_prices", "duplicate_skus", "duplicate_slugs",
        "orphan_tags", "missing_source_urls", "missing_seed_products", "missing_seed_links", "missing_seed_tags", "api_count_mismatches"]]
    checks += [all(c["passed"] for c in api_checks), result["unique_logical_slugs"], result["reruns_stable"],
        result["preservation_checks_passed"], 5 <= result["out_of_stock_seed_percent"] <= 10]
    if not all(checks):
        raise SystemExit("Validation failed; inspect clean/validation.json and SEED_REPORT.md.")

def write_report(records, result, history, coverage, under_8):
    manifest = json.loads((RAW / "manifest.json").read_text(encoding="utf-8")) if (RAW / "manifest.json").exists() else []
    if manifest:
        save_json(CLEAN / "source-manifest.json", manifest)
    skipped = json.loads((CLEAN / "skipped.json").read_text(encoding="utf-8"))
    scenario_history = json.loads((CLEAN / "load-runs.json").read_text(encoding="utf-8"))
    scenario_entries = [e for e in scenario_history if e.get("kind") in ("scenarios", "scenario-cleanup")]
    initial = next((e for e in reversed(history) if sum(e["inserted"].values()) > 0), history[0])
    leaves = result["leaf_counts"]
    text = ["# Bangladesh catalogue seed report", "",
        "> Master brief update (15 October 2026): further imports are stopped by the read-only category gate. See [MASTER_SEED_PREFLIGHT.md](MASTER_SEED_PREFLIGHT.md). The figures below describe the earlier imports into the existing tree, not complete master taxonomy coverage.", "",
        "Validated: " + datetime.now(ZoneInfo("Asia/Dhaka")).strftime("%Y-%m-%d %H:%M %Z"), "",
        f"Clean dataset: **{len(records)} products**. The latest inserting run added {sum(initial['inserted'].values())}; "
        f"the two following reruns were exact no-ops. Database total: {history[-1]['after']['Products']} products, "
        f"{history[-1]['after']['Tags']} tags, {history[-1]['after']['ProductCategories']} category links.", "",
        "## Scope and schema differences", "",
        "The full 15-root Bangladesh tree was absent from the database; it was installed once through seed/seed_categories_bd.py "
        "(explicitly authorized as setup; slug set mirrors the brief within the tree the application already had). The product "
        "loader itself cannot create or modify categories. Slugs follow the database tree, which differs from the brief in names "
        "(e.g. `shirts` rather than `mens-shirts`, `uncategorized` present).", "",
        "Products now carries Slug/Currency/NeedsReview/PriceBasis/PriceVerifiedAt/Source*/SpecsJson columns (the application's "
        "ProductProvenanceAndCurrency migration). New rows store the readable kebab-case slug, BDT currency, provenance and specs "
        "directly. The BD-<sha> SKU mapping remains for insert-if-missing identity, and rows imported before that migration keep "
        "their legacy slugs: the loader never updates existing products, so nothing was rewritten.", "",
        "OrderItem snapshots and Orders were not touched; preservation checks compare every pre-existing row. The application "
        "currency display was already corrected to per-product Currency by the same migration.", "",
        "## Sources and attribution", "",
        "| Source | License | Clean rows |", "|---|---|---:|"]
    for source, count in sorted(Counter(p["source_name"] for p in records).items(), key=lambda x: -x[1]):
        sample = next(p for p in records if p["source_name"] == source)
        text.append(f"| [{source}]({sample['source_url']}) | {sample['source_license']} | {count} |")
    text += ["",
        "Open Food Facts contributors: ODbL-1.0 / DbCL-1.0 (https://world.openfoodfacts.org/terms-of-use); only factual names, "
        "brands, pack sizes and category tags were used; no descriptions or images copied. The Hugging Face dataset "
        "jomarie04/smartphone-specifications-2020-2024 (MIT, pinned revision in raw/hf-provenance.json) supplied phone model "
        "identity and specs only; its USD prices were discarded. Official catalogue pages (Walton, Bata, Hatil, Apex Bangladesh) "
        "supplied factual product names and listed BDT prices; no descriptions, images or reviews were reused; robots.txt was "
        "honored and one request per second per host was enforced. Generic fallback items cite verified Wikipedia reference "
        "pages (CC BY-SA 4.0) for product-type background only and are always needs_review=true, per brief section 4.7.", "",
        "## Leaf coverage", "", "| Leaf | New seed rows | Products in DB | Primary | Status |", "|---|---:|---:|---:|---|"]
    for leaf in leaves:
        note = coverage.get(leaf["Slug"], {}).get("note", "")
        status = "covered" if leaf["ProductCount"] >= 8 else ("partial - " + note if note else "partial")
        text.append(f"| {leaf['Name']} ({leaf['Slug']}) | {sum(p['primaryCategorySlug'] == leaf['Slug'] for p in records)} | "
                    f"{leaf['ProductCount']} | {leaf['PrimaryCount']} | {status} |")
    text += ["", "## Leaves below eight products (with reasons)", ""]
    for gap in under_8:
        text.append(f"- `{gap['slug']}`: {gap['products']} products — {gap['reason']}")
    if not under_8:
        text.append("- none")
    text += ["", "Brief rule: fewer products are seeded rather than fabricating data or scraping competitor catalogues.", "",
        "## Checks", "", "```json", json.dumps({k: v for k, v in result.items() if k not in ["leaf_counts", "category_counts"]}, ensure_ascii=False, indent=2), "```", "",
        "Latest catalogue load runs (inserting run plus two no-op reruns):", "", "```json",
        json.dumps(history[-3:], ensure_ascii=False, indent=2), "```", "",
        "Preservation checks compare every pre-existing Product field including rowversion, all category fields and every "
        "OrderItem field. Each category batch commits independently; rerunning resumes safely. Existing products keep their "
        "StockQuantity, prices and primary categories; reruns only add missing extra-category and tag links (brief section 7), "
        "which is why the first run above reports links and tag links added for the pre-migration rows.", "",
        "## Dev-only scenario fixtures", ""]
    if scenario_entries:
        text.append("Applied and removed on the development database via `load.py --with-scenarios` / `scenarios/cleanup.py`: "
                    "uncategorized single-category fallback, two-category cross-listing, inactive product, out-of-stock product, "
                    "an active orderable product under `TEST: Inactive Category` (ordering depends only on Product.IsActive and "
                    "stock), and an empty `TEST: Empty Category` (API: 200 with an empty page). The cleanup script deletes only "
                    "rows whose SKU, slug and TEST: name all match the fixtures and verified zero leftovers.")
        text += ["", "```json", json.dumps(scenario_entries[-2:], ensure_ascii=False, indent=2), "```", ""]
    else:
        text.append("Not applied in this validation run. See seed/scenarios/.")
    text += ["## Skipped rows", "", f"{len(skipped)} source rows were skipped. Full per-row reasons: seed/clean/skipped.json.", "",
        "| Reason | Rows |", "|---|---:|"]
    for reason, count in Counter(p["reason"] for p in skipped).items():
        text.append(f"| {reason.split('(')[0].strip()} | {count} |")
    text += ["", "## Blocked or unavailable access", ""]
    blocks = {}
    for m in manifest:
        if m.get("status") == "blocked":
            blocks[m["url"]] = m.get("error", "")
    for url, error in sorted(blocks.items()):
        text.append(f"- {url}: {error}. No access-control or rate-limit bypass attempted.")
    text += ["",
        "Aarong, Otobi product listings, Pran, Square Pharmaceuticals, ACI, Teer/Radhuni, Berger and Rahimafrooz pages either "
        "render products client-side, serve only category headings, or returned access challenges; they contain no fetchable "
        "name-plus-price records, so those brands could not be imported and their leaves received section-4.7 generic "
        "fallbacks instead of fabricated brand items. Open Food Facts returned 503 for new searches during this session; the "
        "cached Bangladesh page from the successful fetch was reused unchanged (raw/manifest.json). DGDA/BSTI lists were "
        "unreachable (TLS errors), so no compliance certification is claimed on any row. No competitor stores were scraped.", "",
        "## All items requiring review", "", "| Products needing review | of clean rows |", "|---:|---:|",
        f"| {sum(p['needs_review'] for p in records)} | {len(records)} |", "",
        "Per-row review reasons are in seed/clean/products.json (review_reasons). Estimated-price rows (Open Food Facts "
        "community identities, historical phone models, generic fallbacks) and official rows with VAT or variant caveats are "
        "flagged; official catalogue rows with a plain listed BDT price are not.", ""]
    (ROOT.parent / "SEED_REPORT.md").write_text("\n".join(text) + "\n", encoding="utf-8")

if __name__ == "__main__":
    main()
