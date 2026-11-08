import urllib.request
import re
import json

headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}

req = urllib.request.Request('https://chaldal.com/cooking', headers=headers)
with urllib.request.urlopen(req, timeout=10) as resp:
    html = resp.read().decode('utf-8', errors='ignore')
    # Look for script tags or JSON state
    scripts = re.findall(r'<script[^>]*>(.*?)</script>', html, re.DOTALL)
    print(f"Total script tags: {len(scripts)}")
    for i, s in enumerate(scripts):
        if len(s) > 1000:
            print(f"Script #{i}: length {len(s)}, preview: {s[:120]}...")
            # Look for product keywords
            if 'Bashundhara' in s or 'Chinigura' in s or 'Pran' in s or 'Rupchanda' in s or 'Radhuni' in s:
                print(f"  FOUND BD BRANDS in Script #{i}!")
                # Let's save this script content to inspect
                with open('scratch/chaldal_state.js', 'w', encoding='utf-8') as f:
                    f.write(s)
                print("  Saved to scratch/chaldal_state.js")
