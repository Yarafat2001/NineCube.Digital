import json
from collections import Counter

catalog_path = r'C:\Users\yeasi\source\repos\NineCube.Digital\data\bd-catalog\bd-catalog.json'
with open(catalog_path, encoding='utf-8') as f:
    products = json.load(f)

print(f"Total products in catalog: {len(products)}")

brand_counts = Counter(p.get('brandName') for p in products)
print(f"\nTotal unique brands: {len(brand_counts)}")
print("Top 20 brands:")
for b, count in brand_counts.most_common(20):
    print(f"  {b}: {count} products")

cat_counts = Counter(c['slug'] for p in products for c in p.get('categories', []) if c.get('isPrimary'))
print(f"\nTotal leaf categories: {len(cat_counts)}")
print("Top 25 categories:")
for c, count in cat_counts.most_common(25):
    print(f"  {c}: {count} products")
