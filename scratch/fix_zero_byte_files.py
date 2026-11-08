import os
import shutil

repo_root = r"C:\Users\yeasi\source\repos\NineCube.Digital"
bd_dir = os.path.join(repo_root, "web", "public", "products", "bd")

zero_files = []
for r, d, fs in os.walk(bd_dir):
    for f in fs:
        p = os.path.join(r, f)
        if os.path.getsize(p) == 0:
            zero_files.append(p)

print(f"Found {len(zero_files)} zero-byte files:")
marks_path = os.path.join(bd_dir, 'canonical_marks_milk_powder_packet.jpg')
dano_path = os.path.join(bd_dir, 'canonical_dano_powder_milk_packet.jpg')
pran_rice_path = os.path.join(bd_dir, 'canonical_pran_rice_packet.jpg')

for p in zero_files:
    fname = os.path.basename(p).lower()
    if 'rice' in fname:
        shutil.copyfile(pran_rice_path, p)
        print(f"Replaced {fname} with pran_rice ({os.path.getsize(p)} bytes)")
    elif 'milk-powder' in fname or 'powder-milk' in fname:
        shutil.copyfile(marks_path, p)
        print(f"Replaced {fname} with marks_milk ({os.path.getsize(p)} bytes)")
    else:
        print(f"UNKNOWN zero-byte file: {fname}")

# Verify no zero-byte files remain
remaining = [os.path.join(r, f) for r, d, fs in os.walk(bd_dir) for f in fs if os.path.getsize(os.path.join(r, f)) == 0]
print(f"Remaining 0-byte files in {bd_dir}: {len(remaining)}")
