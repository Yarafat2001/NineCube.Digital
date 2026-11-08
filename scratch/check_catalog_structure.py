import json

with open('data/bd-catalog/bd-catalog.json', 'r', encoding='utf-8') as f:
    bd = json.load(f)

print("Type of bd:", type(bd))
if isinstance(bd, dict):
    print("Keys:", list(bd.keys()))
    products = bd.get('products', bd.get('items', []))
    print("Num products:", len(products))
elif isinstance(bd, list):
    print("Num items:", len(bd))
    products = bd
    if len(bd) > 0:
        print("Type of first item:", type(bd[0]))

for p in products[:10]:
    if isinstance(p, dict):
        print("Product keys:", list(p.keys()))
        print("Example title:", p.get('title') or p.get('name'))
        break
