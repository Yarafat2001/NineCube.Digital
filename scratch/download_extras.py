import json
import os
import subprocess
import re
import sys

sys.stdout.reconfigure(line_buffering=True)
with open('scratch/chaldal_scraped_products.json', encoding='utf-8') as f:
    chaldal_db = json.load(f)

master_dir = r'C:\Users\yeasi\source\repos\NineCube.Digital\scratch\bd_master_photos'
os.makedirs(master_dir, exist_ok=True)

extra_targets = {
    'aarong_sweet_yogurt_packet': 'aarong-dairy-sweetened-yogurt-500-gm',
    'aarong_sour_yogurt_packet': 'aarong-dairy-sour-curd-500-gm',
    'aarong_liquid_milk_packet': 'aarong-dairy-pasteurized-liquid-milk-1-ltr',
    'dano_powder_milk_packet': 'dano-daily-pushti-milk-powder-1-kg',
    'marks_milk_powder_packet': 'marks-full-cream-milk-powder-poly-1-kg',
    'aarong_roshogolla_packet': 'aarong-dairy-roshogolla-600-gm',
    'mojo_cola_packet': 'mojo-soft-drink-2-ltr',
    'pran_litchi_packet': 'pran-drinko-litchi-juice-250-ml',
    'meril_soap_packet': 'meril-milk-beli-soap-bar-100-gm',
    'closeup_toothpaste_packet': 'closeup-toothpaste-menthol-fresh-145-gm'
}

for tag, key in extra_targets.items():
    out_path = os.path.join(master_dir, f"{tag}.jpg")
    if os.path.exists(out_path) and os.path.getsize(out_path) > 5000:
        continue
    if key in chaldal_db:
        url = chaldal_db[key]['url']
        m = re.search(r'pictureId(?:%3D|=)(\d+)', url)
        if m:
            pic_id = m.group(1)
            direct_url = f"https://eggyolk.chaldal.com/api/Picture/Raw?pictureId={pic_id}"
            try:
                subprocess.run(['curl.exe', '-s', '--max-time', '8', direct_url, '-o', out_path], check=True)
                print(f"[{tag}] OK: {os.path.getsize(out_path)} bytes")
            except Exception as e:
                print(f"[{tag}] Err: {e}")
