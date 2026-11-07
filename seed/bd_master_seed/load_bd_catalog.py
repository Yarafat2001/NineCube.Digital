"""Load the BD master seed catalog into NineCube (add-only, idempotent).

Targets (choose via environment, no credential ever on a command line):
  SQL Server   NINECUBE_SQL_SERVER  + NINECUBE_SQL_DATABASE
               (optional NINECUBE_SQL_USER, SQLCMDPASSWORD env, NINECUBE_SQL_ENCRYPT)
  PostgreSQL   NINECUBE_PG_DSN      (or DATABASE_URL: postgres://...)

Records: data/bd-catalog/bd-catalog.json (schema of ProductionCatalogImporter.Feed
extended with unitCost/compareAtPrice/brand/imageUrl).

Guarantees (same philosophy as seed/load.py):
  - Categories are created parent-first, never renamed or moved.
  - Products insert-only: existing SKU/SLUG rows are never updated or deleted.
  - Exactly one primary category per product; extra-category links only added
    when missing.
  - Primary ProductImages row added only when the product has no images.
  - Opening stock recorded as an InventoryMovement (positive stock, new rows).

Commands:
  --check        validate local records only, no DB
  --dry-run      full connection checks + counts of what would be written
  (default)      apply
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
CATALOG = REPO / "data" / "bd-catalog" / "bd-catalog.json"
BATCH = 80
OPENING_STOCK_REASON = "Opening stock from BD master seed v1"


# --------------------------------------------------------------------------
# dialect helpers
# --------------------------------------------------------------------------
class Dialect:
    def __init__(self, name: str):
        self.name = name

    def q(self, ident: str) -> str:
        return f'"{ident}"' if self.name == "pg" else f"[{ident}]"

    def ph(self, position: int = 0) -> str:
        if self.name == "pg":
            return f"%s"
        return "?"


def connect():
    """Return (connection, dialect) for the configured target."""
    sql_server = os.environ.get("NINECUBE_SQL_SERVER")
    sql_db = os.environ.get("NINECUBE_SQL_DATABASE")
    pg_dsn = os.environ.get("NINECUBE_PG_DSN") or (
        _pg_from_database_url(os.environ.get("DATABASE_URL") or ""))
    targets = [t for t in (bool(sql_server and sql_db), bool(pg_dsn)) if t]
    if len(targets) > 1:
        raise SystemExit("Set either SQL Server or Postgres env vars, not both.")
    if sql_server and sql_db:
        try:
            import pyodbc  # type: ignore
        except ImportError as e:
            raise SystemExit(f"pyodbc not installed: {e}\npip install -r seed/requirements.txt")
        drivers = [d for d in pyodbc.drivers() if d.startswith("ODBC Driver")]
        if not drivers:
            raise SystemExit("No ODBC Driver (17/18) for SQL Server installed.")
        drivers.sort(reverse=True)
        driver = drivers[-1]
        encrypt = (os.environ.get("NINECUBE_SQL_ENCRYPT", "no") == "yes")
        user = os.environ.get("NINECUBE_SQL_USER")
        common = (f"Driver={{{driver}}};Encrypt={'yes' if encrypt else 'no'};"
                  "TrustServerCertificate=yes;")
        if user:
            conn_str = (
                f"Server={sql_server};Database={sql_db};Uid={user};"
                f"Pwd={os.environ.get('SQLCMDPASSWORD', '')};" + common)
        else:
            conn_str = f"Server={sql_server};Database={sql_db};Trusted_Connection=yes;" + common
        return pyodbc.connect(conn_str, autocommit=False), Dialect("mssql")
    if pg_dsn:
        try:
            import psycopg  # type: ignore
        except ImportError:
            try:
                import psycopg2 as _m  # type: ignore
                pg_dsn_conn = _m.connect(pg_dsn)
                return pg_dsn_conn, Dialect("pg")
            except ImportError as e:
                raise SystemExit("Install psycopg: pip install \"psycopg[binary]\"")
        return psycopg.connect(pg_dsn), Dialect("pg")
    raise SystemExit(
        "No connection target. Set NINECUBE_SQL_SERVER + NINECUBE_SQL_DATABASE "
        "(SQL Server) or NINECUBE_PG_DSN / DATABASE_URL (PostgreSQL).")


def _pg_from_database_url(url: str) -> str:
    if not url.lower().startswith(("postgres://", "postgresql://")):
        return ""
    return url.replace("postgres://", "postgresql://", 1)


# --------------------------------------------------------------------------
# idempotent write steps
# --------------------------------------------------------------------------
def table_columns(cur, dialect: Dialect, table: str) -> set[str]:
    if dialect.name == "pg":
        cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name = %s",
                    (table,))
    else:
        cur.execute("SELECT c.name FROM sys.columns c "
                    "JOIN sys.tables t ON c.object_id = t.object_id WHERE t.name = ?",
                    (table,))
    return {r[0] for r in cur.fetchall()}


def select_map(cur, dialect: Dialect, sql: str, key_idx: int = 0) -> dict:
    cur.execute(sql)
    return {row[key_idx]: row for row in cur.fetchall()}


def insert_id(cur, dialect: Dialect, sql: str, params: tuple) -> int:
    """INSERT and return the generated Id (portable HRD across pg / mssql)."""
    if dialect.name == "pg":
        cur.execute(sql + " RETURNING \"Id\"", params)
        return cur.fetchone()[0]
    cur.execute(sql, params)
    cur.execute("SELECT SCOPE_IDENTITY()")
    return int(cur.fetchone()[0])


def run(data: dict, dry_run: bool) -> int:
    conn, dialect = connect()
    q = dialect.q
    now = datetime.now(timezone.utc)
    stats = {k: 0 for k in ("categories", "brands", "productLines", "products",
                            "images", "primaryLinks", "extraLinks", "tags",
                            "tagLinks", "stockMovements")}

    def commit():
        if not dry_run:
            conn.commit()

    with conn.cursor() as cur:
        cat_table = q("Categories")
        cats = select_map(cur, dialect, f"SELECT {q('Id')}, {q('Slug')} FROM {cat_table}")
        by_slug = {r[1]: r[0] for r in cats.values()}
        for c in data["categories"]:
            if c["slug"] in by_slug:
                continue
            parent_id = by_slug.get(c["parentSlug"]) if c["parentSlug"] else None
            new_id = insert_id(
                cur, dialect,
                f"INSERT INTO {cat_table} ({q('Name')}, {q('Slug')}, {q('ParentId')}, "
                f"{q('Path')}, {q('Depth')}, {q('SortOrder')}, {q('IsActive')}) "
                f"VALUES ({dialect.ph()}, {dialect.ph()}, {dialect.ph()}, {dialect.ph()}, "
                f"{dialect.ph()}, {dialect.ph()}, {dialect.ph()})",
                (c["name"], c["slug"], parent_id, c["path"], c["depth"],
                 c["sortOrder"], c["isActive"]))
            stats["categories"] += 1
            by_slug[c["slug"]] = new_id
        commit()

        brand_table = q("Brands")
        cur.execute(f"SELECT {q('Id')}, {q('Slug')} FROM {brand_table}")
        brands = {r[1]: r[0] for r in cur.fetchall()}
        brand_names = {b["name"]: b["slug"] for b in data["brands"]}
        for b in data["brands"]:
            if b["slug"] in brands:
                continue
            brands[b["slug"]] = insert_id(
                cur, dialect,
                f"INSERT INTO {brand_table} ({q('Name')}, {q('Slug')}, {q('IsActive')}, {q('CreatedAt')}) "
                f"VALUES ({dialect.ph()}, {dialect.ph()}, {dialect.ph()}, {dialect.ph()})",
                (b["name"], b["slug"], True, now))
            stats["brands"] += 1
        commit()

        tag_table = q("Tags")
        cur.execute(f"SELECT {q('Id')}, {q('Name')} FROM {tag_table}")
        tags = {r[1]: r[0] for r in cur.fetchall()}
        wanted_tags = sorted({t for p in data["products"] for t in p["tags"]})
        for t in wanted_tags:
            if t in tags:
                continue
            tag_id = insert_id(
                cur, dialect,
                f"INSERT INTO {tag_table} ({q('Name')}) VALUES ({dialect.ph()})", (t,))
            tags[t] = tag_id
            stats["tags"] += 1
        commit()

        prod_table = q("Products")
        cat_link = q("ProductCategories")
        img_table = q("ProductImages")
        prod_tag = q("ProductTags")
        mov_table = q("InventoryMovements")
        identifiers = ",".join([q("Id"), q("Sku"), q("Slug")])
        cur.execute(f"SELECT {identifiers} FROM {prod_table}")
        from_row = {r[1].lower(): r for r in cur.fetchall()}
        n_existing = len(from_row)
        prod_cols = table_columns(cur, dialect, "Products")
        use_unit_cost = "UnitCost" in prod_cols
        cols = [q("Sku"), q("Slug"), q("Name"), q("Description"), q("ImageUrl"),
                q("Currency"), q("BrandId"),
                q("Price"), q("CompareAtPrice"), q("StockQuantity"), q("IsActive"),
                q("SourceName"), q("SourceUrl"), q("SourceLicense"), q("SpecsJson"),
                q("PriceBasis"), q("PriceVerifiedAt"), q("NeedsReview"),
                q("CreatedAt"), q("UpdatedAt")]
        if use_unit_cost:
            cols.insert(7, q("UnitCost"))
        col_sql = ", ".join(cols)
        ph_sql = ", ".join(dialect.ph() for _ in cols)
        for p in data["products"]:
            if p["sku"].lower() in from_row or p["slug"].lower() in from_row:
                continue
            brand_id = brands.get(brand_names[p["brand"]])
            row = [
                p["sku"], p["slug"], p["name"], p["description"], p["imageUrl"],
                "BDT", brand_id,
                Decimal(str(p["price"])),
                Decimal(str(p["compareAtPrice"])) if p["compareAtPrice"] else None,
                p["stockQuantity"], p["isActive"], p["sourceName"], p["sourceUrl"],
                p["sourceLicense"], p["specsJson"], p["priceBasis"],
                now if p["priceBasis"] and not p["needsReview"] else None,
                p["needsReview"], now, now,
            ]
            if use_unit_cost:
                row.insert(7, Decimal(str(p["unitCost"])))
            pid = insert_id(
                cur, dialect,
                f"INSERT INTO {prod_table} ({col_sql}) VALUES ({ph_sql})",
                tuple(row))
            stats["products"] += 1
            from_row[p["sku"].lower()] = (pid, p["sku"], p["slug"])
            # primary category
            cat_id = by_slug[p["category"]]
            cur.execute(
                f"INSERT INTO {cat_link} ({q('ProductId')}, {q('CategoryId')}, {q('IsPrimary')}) "
                f"VALUES ({dialect.ph()}, {dialect.ph()}, {dialect.ph()})", (pid, cat_id, True))
            stats["primaryLinks"] += 1
            for ex in p["extraCategories"]:
                cur.execute(
                    f"INSERT INTO {cat_link} ({q('ProductId')}, {q('CategoryId')}, {q('IsPrimary')}) "
                    f"VALUES ({dialect.ph()}, {dialect.ph()}, {dialect.ph()})",
                    (pid, by_slug[ex], False))
                stats["extraLinks"] += 1
            # primary image
            for i, im in enumerate(p["images"]):
                cur.execute(
                    f"INSERT INTO {img_table} ({q('ProductId')}, {q('Url')}, {q('StoragePath')}, "
                    f"{q('IsPrimary')}, {q('SortOrder')}, {q('AltText')}, {q('CreatedAt')}) "
                    f"VALUES ({dialect.ph()}, {dialect.ph()}, {dialect.ph()}, {dialect.ph()}, "
                    f"{dialect.ph()}, {dialect.ph()}, {dialect.ph()})",
                    (pid, im["url"], None, i == 0, i, str(im["altText"]), now))
                stats["images"] += 1
            # tags
            for t in p["tags"]:
                cur.execute(
                    f"INSERT INTO {prod_tag} ({q('ProductId')}, {q('TagId')}) "
                    f"VALUES ({dialect.ph()}, {dialect.ph()})", (pid, tags[t]))
                stats["tagLinks"] += 1
            # opening stock movement
            if p["stockQuantity"] > 0:
                cur.execute(
                    f"INSERT INTO {mov_table} ({q('ProductId')}, {q('Delta')}, {q('Reason')}, {q('CreatedAt')}) "
                    f"VALUES ({dialect.ph()}, {dialect.ph()}, {dialect.ph()}, {dialect.ph()})",
                    (pid, p["stockQuantity"], OPENING_STOCK_REASON, now))
                stats["stockMovements"] += 1
        commit()

    n_before = n_existing
    print(json.dumps({
        "mode": "dry-run" if dry_run else "apply",
        "existingProductsBefore": n_before,
        **stats,
        "note": "no existing product was modified; insert-only",
    }, indent=2))
    return 0


def _slug(name: str) -> str:
    import re
    import unicodedata as u
    s = u.normalize("NFKD", name).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()
    return s or "brand"


def validate(data: dict) -> None:
    skus: set[str] = set()
    slugs: set[str] = set()
    cat_slugs = {c["slug"] for c in data["categories"]}
    brand_names = {b["name"] for b in data["brands"]}
    for p in data["products"]:
        assert p["sku"] not in skus, f"dup sku {p['sku']}"
        assert p["slug"] not in slugs, f"dup slug {p['slug']}"
        skus.add(p["sku"]); slugs.add(p["slug"])
        assert p["category"] in cat_slugs, p["sku"]
        for t in p["tags"]:
            assert t.startswith("Brand: ") or t in ("Budget", "Mid-range", "Premium",
                                                    "Local Brand", "Imported",
                                                    "Made in Bangladesh", "Eid", "Gaming"), t
        assert p["brand"] in brand_names, p["sku"]
        assert p["price"] > 0 and p["stockQuantity"] >= 0, p["sku"]
        assert len(p["sku"]) <= 24 and len(p["name"]) <= 200, p["sku"]
    assert len(data["categories"]) >= 100
    assert len(data["products"]) >= 5000


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="validate records only (no DB)")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    data = json.loads(CATALOG.read_text(encoding="utf-8"))
    if args.check:
        validate(data)
        print(f"check OK: {len(data['products'])} products, "
              f"{len(data['categories'])} categories, {len(data['brands'])} brands")
        return 0
    validate(data)
    return run(data, args.dry_run)


if __name__ == "__main__":
    sys.exit(main())
