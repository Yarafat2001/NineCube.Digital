"""Fetch Bangladesh-only food data. No images or copyrighted descriptions."""
import argparse
from urllib.parse import urlencode
from common import fetch, RAW, save_json
import json

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh", action="store_true")
    args = parser.parse_args()
    records = []
    # Two relevant source categories; actual SQL leaf mapping happens at transform time.
    for category in ["en:coffees", "en:teas"]:
        for page in range(1, 4):
            query = urlencode(dict(countries_tags="en:bangladesh", categories_tags=category,
                page=page, page_size=100, fields="code,product_name,product_name_en,brands,quantity,categories_tags,countries_tags"))
            data = fetch("https://world.openfoodfacts.org/api/v2/search?" + query,
                         f"off-{category[3:]}-{page}.json", "Open Food Facts", "ODbL-1.0 / DbCL-1.0", args.refresh)
            if not data:
                break
            payload = json.loads(data)
            records.extend(payload.get("products", []))
            if page * 100 >= payload.get("count", 0):
                break
    save_json(RAW / "off-products.json", records)
    # A broad Bangladesh export also allows local category matching when combined filters time out.
    if not records:
        for page in range(1, 15):
            query = f"countries_tags=en%3Abangladesh&page_size=100&page={page}&fields=code,product_name,brands,categories_tags,quantity,countries_tags"
            data = fetch("https://world.openfoodfacts.org/api/v2/search?" + query,
                         f"off-bangladesh-{page}.json", "Open Food Facts", "ODbL-1.0 / DbCL-1.0", args.refresh)
            if not data:
                break
            payload = json.loads(data)
            records.extend(payload.get("products", []))
            if page * 100 >= payload.get("count", 0):
                break
        save_json(RAW / "off-products.json", records)

if __name__ == "__main__":
    main()

