import json

with open('scratch/chaldal_service_state.json', encoding='utf-8') as f:
    data = json.load(f)

cat_routes = data.get('RouterService', {}).get('categoryRoutes', {})
print(f"Total category routes: {len(cat_routes)}")
for slug, info in list(cat_routes.items())[:30]:
    print(f"  {slug} -> {info}")

# Look for rice, spices, oil, grocery routes
print("\nSpecific category routes:")
for slug in cat_routes:
    if any(k in slug.lower() for k in ['rice', 'oil', 'spice', 'dairy', 'tea', 'fish', 'meat', 'flour']):
        print(f"  {slug} -> {cat_routes[slug]}")
