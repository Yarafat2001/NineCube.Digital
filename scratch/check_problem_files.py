import os

terms = ['anklet', 'baby-winter', '10-minute', 'mustard-oil', 'olive-oil', 'chinigura', 'aromatic']
dir_path = 'web/public/products/bd'

for f in os.listdir(dir_path):
    f_lower = f.lower()
    for t in terms:
        if t in f_lower:
            p = os.path.join(dir_path, f)
            print(f"{f:60} : {os.path.getsize(p)} bytes")
            break
