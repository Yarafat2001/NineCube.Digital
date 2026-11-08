import json
import os
import shutil
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

print("=== Synchronizing Authentic BD Catalog & Imagery (Packet + Open) ===")

master_dir = r'C:\Users\yeasi\source\repos\NineCube.Digital\scratch\bd_master_photos'
output_dir = r'C:\Users\yeasi\source\repos\NineCube.Digital\web\public\products\bd'
os.makedirs(output_dir, exist_ok=True)

# Helper to square-crop and resize an image to 800x800
def prepare_square(im_path, bg_color=(255, 255, 255)):
    try:
        im = Image.open(im_path)
        if im.mode in ('RGBA', 'LA') or (im.mode == 'P' and 'transparency' in im.info):
            im = im.convert('RGBA')
            bg = Image.new('RGB', im.size, bg_color)
            bg.paste(im, mask=im.split()[-1])
            im = bg
        else:
            im = im.convert('RGB')
            
        w, h = im.size
        # If nearly square, crop center
        if 0.8 <= w / h <= 1.25:
            side = min(w, h)
            left = (w - side) // 2
            top = (h - side) // 2
            im = im.crop((left, top, left + side, top + side))
        else:
            # Letterbox inside square with background
            side = max(w, h)
            square = Image.new('RGB', (side, side), bg_color)
            square.paste(im, ((side - w) // 2, (side - h) // 2))
            im = square
            
        return im.resize((800, 800), Image.Resampling.LANCZOS)
    except Exception as e:
        print(f"Error preparing {im_path}: {e}")
        return None

# Load available masters into memory
masters = {}
for fname in os.listdir(master_dir):
    if fname.endswith(('.jpg', '.png')):
        key = os.path.splitext(fname)[0]
        full_path = os.path.join(master_dir, fname)
        sq = prepare_square(full_path)
        if sq:
            masters[key] = sq
            print(f"Loaded master: {key} (800x800)")

# Also load existing open textures from photo_cache if available
photo_cache = r'C:\Users\yeasi\source\repos\NineCube.Digital\scratch\photo_cache'
if os.path.exists(photo_cache):
    for fname in os.listdir(photo_cache):
        if fname.endswith('.jpg'):
            key = os.path.splitext(fname)[0]
            if key not in masters:
                full_path = os.path.join(photo_cache, fname)
                sq = prepare_square(full_path)
                if sq:
                    masters[f"cached_{key}"] = sq

print(f"Total master textures loaded in memory: {len(masters)}")
