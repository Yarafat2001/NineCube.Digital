import urllib.request
import re
import json

headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}

with open('scratch/chaldal_scraped_products.json', encoding='utf-8') as f:
    product_db = json.load(f)

print(f"Starting with {len(product_db)} products")

cats_to_fetch = ['rices', 'soft-drinks', 'coffees', 'plain-biscuits', 'cream-biscuits', 'toothpastes', 'lotion-cream', 'toilet-cleaning', 'lights', 'tools-hardware']

for cat in cats_to_fetch:
    url = f"https://chaldal.com/{cat}"
    try:
        print(f"Fetching {cat} with 35s timeout...")
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=35) as resp:
            html = resp.read().decode('utf-8', errors='ignore')
            matches = re.findall(r'https://i\.chaldn\.com/_mpimage/([a-zA-Z0-9-]+)\?src=([^\s"\'<>]+)', html)
            added = 0
            for slug, src in matches:
                if slug in ['cooking', 'popular', 'rices', 'oil', 'spices', 'food', 'snacks', 'dairy', 'beverages', 'hygiene']:
                    continue
                full_url = f"https://i.chaldn.com/_mpimage/{slug}?src={src}&q=best&v=1&m=600"
                if slug not in product_db:
                    product_db[slug] = {'slug': slug, 'category': cat, 'url': full_url}
                    added += 1
            print(f"[{cat}] Added {added} items. Total: {len(product_db)}")
    except Exception as e:
        print(f"[{cat}] Error: {e}")

with open('scratch/chaldal_scraped_products.json', 'w', encoding='utf-8') as f:
    json.dump(product_db, f, indent=2)
print(f"Updated scratch/chaldal_scraped_products.json with {len(product_db)} products!")
