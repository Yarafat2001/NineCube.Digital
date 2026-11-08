import json
from collections import Counter

path = 'C:/Users/yeasi/source/repos/NineCube.Digital/src/NineCube.Infrastructure/Persistence/production-catalogue.json'
with open(path, encoding='utf-8') as f:
    bundle = json.load(f)

products = bundle.get('products', [])
print(f"Total products: {len(products)}")

# Categories
cats = Counter(p.get('category') for p in products)
print("\n--- Categories ---")
for c, count in cats.most_common(30):
    print(f"  {c}: {count}")

# Check image assignments
img_counts = Counter()
for p in products:
    images = p.get('images', [])
    for img in images:
        img_counts[img.get('url')] += 1

print("\n--- Most Reused Images (Over 10 times) ---")
for url, count in img_counts.most_common(25):
    print(f"  {url}: {count} times")
