import json
import os
import subprocess
import re
import sys

sys.stdout.reconfigure(line_buffering=True)
print("=== Downloading Master Assets for All Categories ===")

with open('scratch/chaldal_scraped_products.json', encoding='utf-8') as f:
    chaldal_db = json.load(f)

master_dir = r'C:\Users\yeasi\source\repos\NineCube.Digital\scratch\bd_master_photos'
os.makedirs(master_dir, exist_ok=True)

# Helper to download raw picture from eggyolk.chaldal.com
def download_chaldal_raw(tag, slug_pattern):
    out_path = os.path.join(master_dir, f"{tag}.jpg")
    if os.path.exists(out_path) and os.path.getsize(out_path) > 5000:
        return True
    
    # Find matching in chaldal_db
    matched = None
    if slug_pattern in chaldal_db:
        matched = chaldal_db[slug_pattern]
    else:
        for k in chaldal_db:
            if all(w in k for w in slug_pattern.split('*')):
                matched = chaldal_db[k]
                break
    
    if not matched:
        print(f"[{tag}] No match for pattern '{slug_pattern}'")
        return False
        
    url = matched['url']
    m = re.search(r'pictureId(?:%3D|=)(\d+)', url)
    if not m:
        print(f"[{tag}] No pictureId in {url}")
        return False
        
    pic_id = m.group(1)
    direct_url = f"https://eggyolk.chaldal.com/api/Picture/Raw?pictureId={pic_id}"
    try:
        res = subprocess.run(['curl.exe', '-s', '--max-time', '10', direct_url, '-o', out_path], check=True)
        if os.path.exists(out_path) and os.path.getsize(out_path) > 2000:
            print(f"[{tag}] Downloaded {os.path.getsize(out_path)} bytes from pictureId {pic_id}")
            return True
        else:
            print(f"[{tag}] Downloaded file too small: {out_path}")
            return False
    except Exception as e:
        print(f"[{tag}] Error: {e}")
        return False

# Download all grocery packet masters
grocery_targets = {
    # Rice
    'pran_rice_packet': 'pran-chinigura-aromatic-rice-1-kg',
    'chashi_rice_packet': 'chashi-aromatic-chinigura-rice-1-kg',
    'fresh_rice_packet': 'fresh-chinigura-rice-1-kg',
    'aci_miniket_packet': 'aci-pure-miniket-rice-premium-10-kg',
    'aci_nazirshail_packet': 'aci-pure-nazirshail-rice-5-kg',
    'rupchanda_rice_packet': 'rupchanda-chinigura-premium-aromatic-rice-1-kg',
    'katarivog_rice_packet': 'katarivog-rice-1-kg',
    'basmati_rice_packet': 'fortune-biryani-special-basmati-rice-1-kg',
    'puffed_rice_packet': 'pran-puffed-rice-muri-500-gm',
    
    # Oils
    'fresh_soybean_packet': 'fresh-fortified-soyabean-oil-5-ltr',
    'teer_soybean_packet': 'teer-fortified-soyabean-oil-1-ltr',
    'rupchanda_soybean_packet': 'fortune-fortified-rice-bran-oil-5-ltr',
    'radhuni_mustard_packet': 'radhuni-pure-mustard-oil-1-ltr',
    'fresh_mustard_packet': 'fresh-mustard-oil-500-ml',
    'olive_oil_packet': 'la-espanola-extra-virgin-olive-oil-500-ml',
    'sunflower_oil_packet': 'kings-sunflower-oil-pet-5-ltr',
    'rice_bran_oil_packet': 'fresh-rice-bran-oil-5-ltr',
    
    # Spices
    'radhuni_turmeric_packet': 'turmeric*powder',
    'radhuni_chilli_packet': 'chilli*powder',
    'radhuni_coriander_packet': 'coriander*powder',
    'radhuni_cumin_packet': 'cumin*powder',
    'radhuni_meat_masala_packet': 'meat*curry',
    'radhuni_biryani_packet': 'biryani*masala',
    'radhuni_garam_masala_packet': 'garam*masala',
    
    # Dairy & Ghee
    'aarong_yogurt_packet': 'sweet-curd*doi',
    'aarong_sour_yogurt_packet': 'sour-curd*tok',
    'aarong_ghee_packet': 'pure-ghee*aarong',
    'milk_vita_milk_packet': 'pasteurised*liquid*milk',
    'dano_milk_packet': 'powder-milk*dano',
    
    # Tea & Beverages
    'ispahani_tea_packet': 'ispahani*mirzapore',
    'taaza_tea_packet': 'taaza*black-tea',
    'pran_mango_packet': 'pran*frooto*mango',
    'pran_litchi_packet': 'pran-litchi*drink',
    'mojo_packet': 'mojo*cola',
    
    # Snacks & Noodles
    'bombay_chanachur_packet': 'bombay*chanachur',
    'bombay_potato_packet': 'potato-crackers',
    'olympic_energy_packet': 'olympic*energy',
    'maggi_noodles_packet': 'maggi*noodles',
    
    # Staples
    'atta_packet': 'atta*2-kg',
    'maida_packet': 'maida*2-kg',
    'dal_packet': 'red-lentil*dal',
    
    # Personal care
    'sandalina_soap_packet': 'sandalina',
    'meril_jelly_packet': 'meril*jelly',
    'savlon_soap_packet': 'savlon*soap',
    'closeup_toothpaste_packet': 'close-up*toothpaste'
}

success = 0
for tag, pattern in grocery_targets.items():
    if download_chaldal_raw(tag, pattern):
        success += 1

print(f"\nSuccessfully downloaded {success}/{len(grocery_targets)} grocery packets!")
