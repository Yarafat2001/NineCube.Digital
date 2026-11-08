import json
import os

cat_path = r"C:\Users\yeasi\source\repos\NineCube.Digital\src\NineCube.Infrastructure\Persistence\production-catalogue.json"
with open(cat_path, "r", encoding="utf-8") as f:
    data = json.load(f)

print(f"Total categories: {len(data.get('categories', []))}")
print(f"Total products: {len(data.get('products', []))}")

print("\n--- Categories under or related to electronics, home, furniture ---")
for c in data.get('categories', []):
    slug = c.get('slug', '')
    parent = c.get('parent')
    depth = c.get('depth')
    name = c.get('name')
    if parent in ['electronics', 'home-appliances', 'home', 'furniture'] or slug in ['electronics', 'home-appliances', 'home', 'furniture', 'kitchenware', 'bedding-linen', 'home-furniture', 'decor-lighting']:
        print(f"slug: {slug:20} | name: {name:25} | parent: {str(parent):18} | depth: {depth}")

print("\n--- Check sample bashundhara chinigura products ---")
for p in data.get('products', []):
    slug = p.get('slug', '')
    if 'bashundhara' in slug and 'chinigura' in slug:
        print(f"slug: {slug}")
        print(f"  imageUrl: {p.get('imageUrl')}")
        print(f"  images: {p.get('images')}")
        break

print("\n--- Categories count of products ---")
from collections import Counter
cat_counts = Counter()
for p in data.get('products', []):
    for c in p.get('categories', []):
        cat_counts[c.get('slug')] += 1
for cat, cnt in cat_counts.most_common(25):
    print(f"  {cat:25}: {cnt}")
