"""Build the embedded system feed from the BD master dataset.

Merges data/bd-catalog/bd-catalog.json into
src/NineCube.Infrastructure/Persistence/production-catalogue.json so the
ProductionCatalogImporter (run at every API startup) installs the catalogue
into any target PostgreSQL database (Render included).

Merge rules (same add-only philosophy as the loader):
  - Existing feed rows are preserved verbatim first (order by depth).
  - Dataset categories not already present are appended (depth-first order
    resolved against the union, so every parentSlug exists).
  - Dataset products not already present are appended.
  - laptopStockInitializationSkus copied from the existing feed.

Run:  python seed/bd_master_seed/build_embedded_feed.py
"""

from __future__ import annotations

import json
from pathlib import Path

import re
import unicodedata

REPO = Path(__file__).resolve().parents[2]
DATASET = REPO / "data" / "bd-catalog" / "bd-catalog.json"
FEED = REPO / "src" / "NineCube.Infrastructure" / "Persistence" / "production-catalogue.json"


def kebab_fallback(text: str) -> str:
    return re.sub(r"[^a-zA-Z0-9]+", "-", text).strip("-").lower()


def main() -> int:
    data = json.loads(DATASET.read_text(encoding="utf-8"))
    feed = json.loads(FEED.read_text(encoding="utf-8"))

    cat_slugs = {c["slug"] for c in feed["categories"]}
    merged_cats = list(feed["categories"])
    for c in data["categories"]:
        if c["slug"] in cat_slugs:
            continue
        merged_cats.append({
            "name": c["name"], "slug": c["slug"],
            "parentSlug": c["parentSlug"], "depth": c["depth"],
        })
        cat_slugs.add(c["slug"])
    for c in merged_cats:
        if c["parentSlug"] is not None:
            assert c["parentSlug"] in cat_slugs, c["slug"]
        assert 1 <= c["depth"] <= 4, f"bad depth {c['slug']}"

    prod_skus = {p["sku"] for p in feed["products"]}
    prod_slugs = {p["slug"] for p in feed["products"]}
    cat_leaf_ok = cat_slugs
    merged_prods = list(feed["products"])
    for p in data["products"]:
        assert p["sku"] not in prod_skus
        assert p["slug"] not in prod_slugs and len(p["slug"]) > 0
        assert p["category"] in cat_leaf_ok
        merged_prods.append({
            "sku": p["sku"], "slug": p["slug"], "name": p["name"],
            "price": float(p["price"]), "currency": p["currency"],
            "stockQuantity": p["stockQuantity"], "description": p["description"],
            "category": p["category"], "tags": p["tags"],
            "specsJson": p["specsJson"], "sourceName": p["sourceName"],
            "sourceUrl": None, "sourceLicense": p["sourceLicense"],
            "priceBasis": p["priceBasis"], "needsReview": p["needsReview"],
            "images": p["images"],
        })
        prod_skus.add(p["sku"]); prod_slugs.add(p["slug"])

    # appends must reference parents that already exist (DB/old rows or an
    # earlier dataset traversal step) — dataset order is parents-first.
    seen: set[str] = {c["slug"] for c in feed["categories"]}
    for c in data["categories"]:
        if c["slug"] in seen:
            continue
        assert c["parentSlug"] is None or c["parentSlug"] in seen, \
            f"append order broke parent chain for {c['slug']}"
        seen.add(c["slug"])

    out = {
        "categories": merged_cats,
        "products": merged_prods,
        "laptopStockInitializationSkus": feed.get("laptopStockInitializationSkus", []),
    }
    FEED.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")),
                    encoding="utf-8")
    mb = FEED.stat().st_size / 1_048_576
    print(f"feed rebuilt: {len(merged_cats)} categories, {len(merged_prods)} products, {mb:.1f} MB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
