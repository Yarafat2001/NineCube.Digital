import json
from collections import Counter

with open('src/NineCube.Infrastructure/Persistence/production-catalogue.json', 'r', encoding='utf-8') as f:
    feed = json.load(f)

products = feed['products']
print(f"Total products in production-catalogue.json: {len(products)}")

img_urls = [p.get('imageUrl') for p in products if p.get('imageUrl')]
counts = Counter(img_urls)

print("Top 20 most frequent imageUrls:")
for url, count in counts.most_common(20):
    print(f"  {count}x: {url}")
