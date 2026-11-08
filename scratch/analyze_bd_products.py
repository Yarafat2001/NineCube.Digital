import json
from collections import defaultdict

with open('data/bd-catalog/bd-catalog.json', encoding='utf-8') as f:
    catalog = json.load(f)

products = catalog['products']
print(f"Total products: {len(products)}")

by_cat = defaultdict(list)
for p in products:
    by_cat[p['category']].append(p)

print(f"\nTotal categories: {len(by_cat)}")
for cat in sorted(by_cat.keys()):
    items = by_cat[cat]
    sample_names = [x['name'] for x in items[:3]]
    brands = set(x['brand'] for x in items)
    print(f"[{cat}] ({len(items)} items, {len(brands)} brands): e.g. {sample_names}")
