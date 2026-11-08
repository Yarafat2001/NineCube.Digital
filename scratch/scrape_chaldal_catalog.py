import urllib.request
import re
import json
import time

headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}

categories = [
    'rices', 'oil', 'spices', 'ghee', 'dairy', 'yogurt', 'liquid-uht-milk', 'powder-milk',
    'beverages-tea', 'juice', 'soft-drinks', 'coffees', 'local-snacks', 'plain-biscuits',
    'cream-biscuits', 'noodles', 'flour', 'dal-or-lentil', 'salt-sugar', 'soaps',
    'shampoo', 'toothpastes', 'hair-care', 'lotion-cream', 'handwash', 'tissue-wipes',
    'dish-wash', 'laundry', 'toilet-cleaning', 'lights', 'electric-multiplug',
    'batteries', 'kitchen-appliances', 'tools-hardware'
]

product_db = {}

for cat in categories:
    url = f"https://chaldal.com/{cat}"
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=12) as resp:
            html = resp.read().decode('utf-8', errors='ignore')
            
            # Extract image URLs
            # Format: https://i.chaldn.com/_mpimage/<slug>?src=https%3A%2F%2Feggyolk.chaldal.com%2Fapi%2FPicture%2FRaw%3FpictureId%3D<id>&q=best&v=1&m=400
            matches = re.findall(r'https://i\.chaldn\.com/_mpimage/([a-zA-Z0-9-]+)\?src=([^\s"\'<>]+)', html)
            count = 0
            for slug, src in matches:
                if slug in ['cooking', 'popular', 'rices', 'oil', 'spices', 'food', 'snacks', 'dairy', 'beverages', 'hygiene']:
                    continue
                full_url = f"https://i.chaldn.com/_mpimage/{slug}?src={src}&q=best&v=1&m=600"
                if slug not in product_db:
                    product_db[slug] = {
                        'slug': slug,
                        'category': cat,
                        'url': full_url
                    }
                    count += 1
            print(f"[{cat}] Extracted {count} unique products (total in DB: {len(product_db)})")
    except Exception as e:
        print(f"[{cat}] Failed: {e}")
    time.sleep(0.5)

print(f"\nFinal total collected: {len(product_db)} real BD products")
with open('scratch/chaldal_scraped_products.json', 'w', encoding='utf-8') as f:
    json.dump(product_db, f, indent=2)
print("Saved to scratch/chaldal_scraped_products.json")
