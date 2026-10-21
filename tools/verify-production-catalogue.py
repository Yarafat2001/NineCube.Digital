"""Read-only verification of the public category tree and every bundled API image."""
import concurrent.futures
import json
import sys
import urllib.request
from pathlib import Path

root = Path(__file__).resolve().parents[1]
base = (sys.argv[1] if len(sys.argv) > 1 else "https://ninecube-api.onrender.com").rstrip("/")
bundle = json.loads((root / "src/NineCube.Infrastructure/Persistence/production-catalogue.json").read_text(encoding="utf-8"))
with urllib.request.urlopen(base + "/api/categories", timeout=60) as response:
    tree = json.load(response)
def flatten(nodes):
    for node in nodes:
        yield node
        yield from flatten(node.get("children", []))
categories = list(flatten(tree))
missing = sorted({c["slug"] for c in bundle["categories"]} - {c["slug"] for c in categories})
urls = sorted({image["url"] for product in bundle["products"] for image in product["images"]})
def check_image(url):
    try:
        request = urllib.request.Request(base + url, method="HEAD")
        with urllib.request.urlopen(request, timeout=60) as response:
            if response.status != 200 or int(response.headers.get("Content-Length", "0")) <= 0:
                return url
    except Exception:
        return url
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
    broken = [result for result in pool.map(check_image, urls) if result]
report = dict(categories=len(categories), missingCategories=missing,
    rootProductCounts={category["name"]: category["productCount"] for category in tree},
    uniqueImagesChecked=len(urls), brokenImages=broken)
print(json.dumps(report, indent=2))
if missing or broken:
    raise SystemExit(1)
