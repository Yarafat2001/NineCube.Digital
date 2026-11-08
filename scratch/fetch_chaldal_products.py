import urllib.request
import re
import json

headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}

def scrape_category(slug):
    url = f"https://chaldal.com/{slug}"
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            html = resp.read().decode('utf-8', errors='ignore')
            print(f"[{slug}] HTML length: {len(html)}")
            
            # Find all products and their picture URLs
            # On Chaldal, image URLs look like:
            # https://i.chaldn.com/_mpimage/<slug>?src=https%3A%2F%2Feggyolk.chaldal.com%2Fapi%2FPicture%2FRaw%3FpictureId%3D<id>&q=best&v=1&m=400
            matches = re.findall(r'https://i\.chaldn\.com/_mpimage/([a-zA-Z0-9-]+)\?src=([^\s"\'<>]+)', html)
            print(f"[{slug}] Found {len(matches)} image matches")
            results = []
            for item_slug, src in matches:
                if item_slug not in ['cooking', 'popular', 'rices', 'oil', 'spices']:
                    results.append((item_slug, f"https://i.chaldn.com/_mpimage/{item_slug}?src={src}"))
            return results
    except Exception as e:
        print(f"[{slug}] Error: {e}")
        return []

rice_items = scrape_category('rices')
print("Sample rice items:")
for s, u in rice_items[:10]:
    print(f"  {s} -> {u[:90]}")

oil_items = scrape_category('oil')
print("Sample oil items:")
for s, u in oil_items[:10]:
    print(f"  {s} -> {u[:90]}")
