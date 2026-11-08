import os
import shutil

# Copy the candidate images to artifacts folder so we can inspect or compare
art_dir = r"C:\Users\yeasi\.gemini\antigravity\brain\c29260b8-4e39-4119-8fe7-84a12d0e5923"

files_to_copy = [
    ('web/public/products/bd/fresh-mustard-oil-1l.jpg', 'debug_fresh_mustard_oil_1l.jpg'),
    ('web/public/products/bd/canonical_fresh_mustard_packet.jpg', 'debug_canonical_fresh_mustard_packet.jpg'),
    ('web/public/products/bd/canonical_mustard_oil_open.jpg', 'debug_canonical_mustard_oil_open.jpg'),
    ('web/public/products/bd/fresh-extra-virgin-olive-oil-1l.jpg', 'debug_fresh_olive_oil_1l.jpg'),
    ('web/public/products/bd/canonical_olive_oil_packet.jpg', 'debug_canonical_olive_oil_packet.jpg'),
    ('web/public/products/bd/canonical_olive_oil_open.jpg', 'debug_canonical_olive_oil_open.jpg'),
    ('web/public/products/bd/aarong-anklet-gold-plated-premium-line.jpg', 'debug_aarong_anklet.jpg'),
    ('web/public/products/bd/canonical_anklet_gold_packet.jpg', 'debug_canonical_anklet_packet.jpg'),
    ('web/public/products/bd/canonical_anklet_gold_open.jpg', 'debug_canonical_anklet_open.jpg'),
    ('web/public/products/bd/aarong-baby-winter-set-size-m.jpg', 'debug_aarong_baby.jpg'),
    ('web/public/products/bd/canonical_baby_winter_packet.jpg', 'debug_canonical_baby_packet.jpg'),
    ('web/public/products/bd/canonical_baby_winter_open.jpg', 'debug_canonical_baby_open.jpg'),
]

for src, dst in files_to_copy:
    full_src = os.path.join(r"C:\Users\yeasi\source\repos\NineCube.Digital", src)
    full_dst = os.path.join(art_dir, dst)
    if os.path.exists(full_src):
        shutil.copyfile(full_src, full_dst)
        print(f"Copied {src} -> {dst} ({os.path.getsize(full_dst)} bytes)")
    else:
        print(f"MISSING: {src}")
