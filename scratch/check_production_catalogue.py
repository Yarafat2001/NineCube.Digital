import json

with open('src/NineCube.Infrastructure/Persistence/production-catalogue.json', 'r', encoding='utf-8') as f:
    feed = json.load(f)

products = feed['products']
targets = [
    'fresh mustard oil',
    'radhuni mustard oil',
    'extra virgin olive oil',
    'anklet gold',
    'anklet oxidized',
    'baby winter set',
    'freelancing masterclass',
    'ielts preparation',
    'python development',
    'bashundhara aromatic chinigura',
    'pran aromatic chinigura',
]

for p in products:
    name = (p.get('name') or '').lower()
    slug = (p.get('slug') or '').lower()
    for t in targets:
        if t in name or t in slug:
            print(f"Target: {t}")
            print(f"  Name: {p.get('name')}")
            print(f"  Slug: {p.get('slug')}")
            print(f"  ImageUrl: {p.get('imageUrl')}")
            print(f"  Images: {p.get('images')}")
            print("-" * 50)
            break
