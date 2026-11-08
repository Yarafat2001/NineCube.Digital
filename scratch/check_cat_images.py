import json
from collections import defaultdict

with open('src/NineCube.Infrastructure/Persistence/production-catalogue.json', 'r', encoding='utf-8') as f:
    feed = json.load(f)

products = feed['products']
cat_to_images = defaultdict(set)

for p in products:
    cat = p.get('category') or 'unknown'
    img = p.get('imageUrl') or 'none'
    cat_to_images[cat].add(img)

print("Categories and number of distinct images assigned:")
for cat, imgs in sorted(cat_to_images.items()):
    canonical_count = sum(1 for i in imgs if 'canonical_' in i)
    slug_count = sum(1 for i in imgs if 'canonical_' not in i and '/products/bd/' in i)
    other_count = len(imgs) - canonical_count - slug_count
    print(f"  {cat:25}: {len(imgs):4} distinct imgs (canonical: {canonical_count:2}, slug: {slug_count:4}, other: {other_count:2})")
