import subprocess
import re
import json

print("Fetching rices with curl.exe...")
subprocess.run(['curl.exe', '-s', 'https://chaldal.com/rices', '-o', 'scratch/rices.html'], check=True)

with open('scratch/rices.html', encoding='utf-8', errors='ignore') as f:
    html = f.read()

imgs = set(re.findall(r'https://i\.chaldn\.com/_mpimage/([a-zA-Z0-9-]+)\?src=([^\s"\'<>]+)', html))

with open('scratch/chaldal_scraped_products.json', encoding='utf-8') as f:
    db = json.load(f)

added = 0
for s, src in imgs:
    if any(k in s.lower() for k in ['rice', 'chal', 'chinigura', 'miniket', 'nazirshail', 'basmati', 'polao']):
        full_url = f"https://i.chaldn.com/_mpimage/{s}?src={src}&q=best&v=1&m=600"
        db[s] = {'slug': s, 'category': 'rices', 'url': full_url}
        added += 1

print(f"Added {added} rice products! Total in DB: {len(db)}")
with open('scratch/chaldal_scraped_products.json', 'w', encoding='utf-8') as f:
    json.dump(db, f, indent=2)

print("\nSample rice products collected:")
for s in sorted(db.keys()):
    if 'chinigura' in s or 'miniket' in s or 'rice' in s:
        print("  ", s)
