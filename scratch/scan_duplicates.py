import os
import hashlib
from collections import defaultdict

hash_to_files = defaultdict(list)
dir_path = 'web/public/products/bd'

for f in os.listdir(dir_path):
    if f.endswith('.jpg') or f.endswith('.png'):
        p = os.path.join(dir_path, f)
        with open(p, 'rb') as fp:
            h = hashlib.md5(fp.read()).hexdigest()
        hash_to_files[h].append(f)

print(f"Total files: {sum(len(v) for v in hash_to_files.values())}")
print(f"Unique hashes: {len(hash_to_files)}")

# Print top 20 most duplicated hashes
sorted_hashes = sorted(hash_to_files.items(), key=lambda x: len(x[1]), reverse=True)
for h, files in sorted_hashes[:20]:
    print(f"Hash {h}: {len(files)} files. Example: {files[:5]}")
