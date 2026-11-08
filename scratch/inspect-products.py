import json

with open('src/NineCube.Infrastructure/Persistence/production-catalogue.json', encoding='utf-8') as f:
    bundle = json.load(f)

products = bundle.get('products', [])
print(f"Total products in JSON: {len(products)}")

targets = [
    'bashundhara',
    'fresh-mustard-oil',
    'extra-virgin-olive-oil',
    'anklet',
    'baby-winter',
    '10-minute-school',
    'pran'
]

found = 0
for p in products:
    slug = (p.get('slug') or '').lower()
    name = (p.get('name') or '').lower()
    for t in targets:
        if t in slug or t in name:
            found += 1
            images = p.get('images', [])
            print(f"[{found}] Name: {p.get('name')} | Slug: {slug}")
            print(f"    Images count: {len(images)}")
            for i, img in enumerate(images[:4]):
                print(f"       ({i}) url={img.get('url')} alt={img.get('altText')}")
            break
        if found >= 20:
            break
    if found >= 20:
        break
