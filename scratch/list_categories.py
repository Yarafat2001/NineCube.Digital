import json

with open('data/bd-catalog/bd-catalog.json', 'r', encoding='utf-8') as f:
    bd = json.load(f)

categories = bd.get('categories', [])
print(f"Categories count: {len(categories)}")
for c in categories[:30]:
    print(f"  {c.get('slug')}: {c.get('name')}")
