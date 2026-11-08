import urllib.request
import re

headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
req = urllib.request.Request('https://chaldal.com/rices', headers=headers)
with urllib.request.urlopen(req, timeout=30) as resp:
    html = resp.read().decode('utf-8', errors='ignore')
    imgs = set(re.findall(r'https://i\.chaldn\.com/_mpimage/([a-zA-Z0-9-]+)\?src=([^\s"\'<>]+)', html))
    print(f"Total images found: {len(imgs)}")
    rice_items = [(s, f"https://i.chaldn.com/_mpimage/{s}?src={src}&q=best&v=1&m=600") for s, src in imgs if 'rice' in s.lower() or 'chal' in s.lower() or 'chinigura' in s.lower() or 'miniket' in s.lower() or 'nazirshail' in s.lower()]
    print(f"Found {len(rice_items)} actual rice products:")
    for s, u in sorted(rice_items):
        print(f"  {s}")
