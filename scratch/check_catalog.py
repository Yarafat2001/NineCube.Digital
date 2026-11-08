import json

with open('data/bd-catalog/bd-catalog.json', 'r', encoding='utf-8') as f:
    bd = json.load(f)

products = bd['products']
for p in products:
    name = p.get('name', '')
    if any(k in name.lower() for k in ['mustard oil', 'extra virgin olive oil', 'anklet', 'baby winter', 'bashundhara aromatic chinigura']):
        print(f"Slug: {p.get('slug')} | Name: {name}")
        print(f"  imageUrl: {p.get('imageUrl')}")
        print(f"  images: {p.get('images')}")
