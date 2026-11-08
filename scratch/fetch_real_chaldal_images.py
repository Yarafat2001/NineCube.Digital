import urllib.request
import re
import json

headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'}

urls = [
    ('pran_miniket', 'https://chaldal.com/pran-miniket-rice-5-kg'),
    ('pran_chinigura', 'https://chaldal.com/pran-chinigura-rice-aromatic-1-kg'),
    ('fresh_miniket', 'https://chaldal.com/fresh-miniket-rice-premium-quality-5-kg'),
    ('fresh_mustard', 'https://chaldal.com/fresh-mustard-oil-1-ltr'),
    ('radhuni_mustard', 'https://chaldal.com/radhuni-pure-mustard-oil-1-ltr'),
    ('fresh_soybean', 'https://chaldal.com/fresh-fortified-soybean-oil-5-ltr'),
    ('rupchanda_soybean', 'https://chaldal.com/rupchanda-fortified-soybean-oil-5-ltr'),
    ('teer_soybean', 'https://chaldal.com/teer-advanced-soybean-oil-5-ltr'),
    ('olitalia_olive_oil', 'https://chaldal.com/olitalia-extra-virgin-olive-oil-1-ltr'),
    ('borges_olive_oil', 'https://chaldal.com/borges-extra-virgin-olive-oil-1-ltr'),
]

for name, u in urls:
    try:
        req = urllib.request.Request(u, headers=headers)
        with urllib.request.urlopen(req, timeout=8) as resp:
            html = resp.read().decode('utf-8', errors='ignore')
            # Look for JSON-LD or meta og:image or chaldn.com image
            og_match = re.search(r'<meta\s+property=[\"\']og:image[\"\']\s+content=[\"\']([^\"\']+)[\"\']', html)
            if og_match:
                print(f"{name} -> og:image: {og_match.group(1)}")
            else:
                imgs = re.findall(r'https://images\.chaldn\.com/[^\s\"\'\<\>]+', html)
                if imgs:
                    print(f"{name} -> first img: {imgs[0]}")
                else:
                    print(f"{name} -> no image found")
    except Exception as e:
        print(f"{name} error: {e}")
