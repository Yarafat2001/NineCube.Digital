"""One-time repair for catalogue rows loaded before ProductProvenanceAndCurrency.

Only the new provenance columns (Source*, Currency, NeedsReview, PriceBasis,
PriceVerifiedAt, SpecsJson) are filled, and only for BD-% SKUs that already
have one of the application's default values. Name, price, stock, timestamps,
rowversion and the legacy-product slug are never touched; the loader's
never-UPDATE rule for existing products is unchanged. Safe to re-run.
"""
import json
from common import CLEAN, sql, sql_json, save_json, ROOT
from datetime import datetime, timezone

def esc(value):
    return "NULL" if value in (None, "") else "N'" + str(value).replace("'", "''") + "'"

def main():
    records = {p["sku"]: p for p in json.loads((CLEAN / "products.json").read_text(encoding="utf-8"))}
    targets = sql_json("""SELECT p.Sku FROM Products p WHERE p.Sku LIKE 'BD-%'
        AND (p.SourceUrl IS NULL OR p.SourceUrl='' OR p.Currency='USD' OR p.NeedsReview IS NULL)""")
    missing = [t["Sku"] for t in targets if t["Sku"] not in records]
    if missing:
        raise SystemExit(f"Refusing: BD- rows without a clean record: {missing}")
    updated = 0
    for t in targets:
        r = records[t["Sku"]]
        specs = json.dumps(r.get("specs", {}), ensure_ascii=False).replace("'", "''")
        verified = r.get("price_verified_at")
        statement = ("SET XACT_ABORT ON; BEGIN TRANSACTION;\n"
            f"UPDATE Products SET SourceName={esc(r['source_name'])},SourceUrl={esc(r['source_url'])},"
            f"SourceLicense={esc(r['source_license'])},Currency=N'{r['currency']}',NeedsReview="
            f"{1 if r['needs_review'] else 0},PriceBasis={esc(r.get('price_basis'))},"
            f"PriceVerifiedAt={esc(verified)},SpecsJson=N'{specs}'\n"
            f"WHERE Sku=N'{t['Sku']}' AND (SourceUrl IS NULL OR SourceUrl='' OR Currency=N'USD');\n"
            "COMMIT;")
        sql(statement)
        updated += 1
    remaining = sql_json("SELECT COUNT(*) n FROM Products WHERE Sku LIKE 'BD-%' AND (SourceUrl IS NULL OR SourceUrl='')")[0]["n"]
    entry = dict(at=datetime.now(timezone.utc).isoformat(), kind="provenance-backfill",
                 rows=updated, remaining_missing_source_url=remaining)
    history_path = CLEAN / "load-runs.json"
    history = json.loads(history_path.read_text(encoding="utf-8"))
    history.append(entry)
    save_json(history_path, history)
    print(json.dumps(entry))

if __name__ == "__main__":
    main()
