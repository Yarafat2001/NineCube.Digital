import urllib.request
import re

headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}

def find_unsplash(query):
    url = f"https://unsplash.com/s/photos/{query}"
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=10) as resp:
            html = resp.read().decode('utf-8', errors='ignore')
            # Look for photo IDs: photo-123456789-abcdef
            photos = re.findall(r'https://images\.unsplash\.com/photo-([a-zA-Z0-9_-]+)', html)
            print(f"[{query}] Found {len(set(photos))} photos:")
            for p in list(set(photos))[:5]:
                print(f"  https://images.unsplash.com/photo-{p}?auto=format&fit=crop&w=800&q=80")
    except Exception as e:
        print(f"[{query}] Error: {e}")

find_unsplash('anklet')
find_unsplash('silver-anklet')
find_unsplash('baby-winter-clothes')
find_unsplash('saree')
find_unsplash('kurta-men')
