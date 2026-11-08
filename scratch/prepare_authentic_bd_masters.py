import json
import os
import subprocess
import sys

sys.stdout.reconfigure(line_buffering=True)
print("Building master authentic Bangladeshi product library...")

with open('scratch/chaldal_scraped_products.json', encoding='utf-8') as f:
    chaldal_db = json.load(f)

print(f"Loaded {len(chaldal_db)} scraped Chaldal products.")

out_dir = r'C:\Users\yeasi\source\repos\NineCube.Digital\scratch\bd_master_photos'
os.makedirs(out_dir, exist_ok=True)

selected_chaldal = {
    # Rice
    'pran_rice_packet': 'pran-chinigura-aromatic-rice-1-kg',
    'chashi_rice_packet': 'chashi-aromatic-chinigura-rice-1-kg',
    'fresh_rice_packet': 'fresh-chinigura-rice-1-kg',
    'aci_miniket_packet': 'aci-pure-miniket-rice-premium-10-kg',
    'aci_nazirshail_packet': 'aci-pure-nazirshail-rice-5-kg',
    'rupchanda_rice_packet': 'rupchanda-chinigura-premium-aromatic-rice-1-kg',
    
    # Oils
    'fresh_soybean_packet': 'fresh-fortified-soyabean-oil-5-ltr',
    'teer_soybean_packet': 'teer-fortified-soyabean-oil-1-ltr',
    'rupchanda_soybean_packet': 'rupchanda-fortified-soyabean-oil-5-ltr',
    'radhuni_mustard_packet': 'radhuni-pure-mustard-oil-1-ltr',
    'fresh_mustard_packet': 'fresh-mustard-oil-500-ml',
    'olive_oil_packet': 'la-espanola-extra-virgin-olive-oil-500-ml',
    'rice_bran_oil_packet': 'aci-nutrilife-rice-bran-oil-5-ltr',
    
    # Spices
    'radhuni_turmeric_packet': 'radhuni-turmeric-powder-200-gm',
    'radhuni_chilli_packet': 'radhuni-chilli-powder-200-gm',
    'radhuni_coriander_packet': 'radhuni-coriander-powder-200-gm',
    'radhuni_cumin_packet': 'radhuni-cumin-powder-100-gm',
    'radhuni_meat_masala_packet': 'radhuni-meat-curry-masala-100-gm',
    'radhuni_biryani_packet': 'radhuni-biryani-masala-40-gm',
    
    # Dairy & Ghee
    'aarong_yogurt_packet': 'aarong-dairy-sweet-curd-mishti-doi-500-gm',
    'aarong_sour_yogurt_packet': 'aarong-dairy-sour-curd-tok-doi-500-gm',
    'aarong_ghee_packet': 'aarong-dairy-pure-ghee-400-gm',
    'milk_vita_milk_packet': 'milk-vita-pasteurised-liquid-milk-1-ltr',
    'dano_milk_packet': 'dano-daily-pushti-powder-milk-1-kg',
    
    # Tea & Beverages
    'ispahani_tea_packet': 'ispahani-mirzapore-best-leaf-tea-400-gm',
    'taaza_tea_packet': 'brooke-bond-taaza-black-tea-400-gm',
    'pran_mango_packet': 'pran-frooto-mango-fruit-drink-1-ltr',
    'pran_litchi_packet': 'pran-litchi-drink-170-ml',
    'mojo_packet': 'mojo-cola-2-ltr',
    
    # Snacks & Biscuits
    'bombay_chanachur_packet': 'bombay-sweets-bombay-mix-chanachur-300-gm',
    'bombay_potato_packet': 'bombay-sweets-potato-crackers-18-gm',
    'olympic_energy_packet': 'olympic-energy-plus-biscuit-300-gm',
    'maggi_noodles_packet': 'maggi-2-minute-noodles-masala-8-pack-496-gm',
    
    # Staples
    'bashundhara_atta_packet': 'bashundhara-atta-2-kg',
    'teer_maida_packet': 'teer-maida-2-kg',
    'aci_dal_packet': 'aci-pure-premium-red-lentil-moshur-dal-1-kg',
    
    # Personal care
    'sandalina_soap_packet': 'sandalina-sandal-soap-125-gm',
    'meril_jelly_packet': 'meril-petroleum-jelly-50-ml',
    'savlon_soap_packet': 'savlon-antiseptic-soap-active-100-gm',
    'closeup_toothpaste_packet': 'close-up-ever-fresh-red-hot-gel-toothpaste-100-gm'
}

downloaded = 0
for tag, slug in selected_chaldal.items():
    out_file = os.path.join(out_dir, f"{tag}.jpg")
    if os.path.exists(out_file) and os.path.getsize(out_file) > 5000:
        downloaded += 1
        print(f"[{tag}] Already cached ({os.path.getsize(out_file)} bytes)")
        continue
    
    matched_slug = slug
    if matched_slug not in chaldal_db:
        # find matching
        tokens = [t for t in slug.split('-') if len(t) > 2 and not t.isdigit() and t not in ('gm', 'kg', 'ltr', 'ml')]
        candidates = [s for s in chaldal_db.keys() if sum(1 for tok in tokens if tok in s) >= 2]
        if candidates:
            matched_slug = candidates[0]
            print(f"[{tag}] Mapped {slug} -> {matched_slug}")
        else:
            print(f"[{tag}] No match for {slug}")
            continue

    url = chaldal_db[matched_slug]['url'].replace('&amp;', '&')
    try:
        print(f"Downloading {tag}...")
        subprocess.run(['curl.exe', '-s', url, '-o', out_file], check=True)
        if os.path.exists(out_file) and os.path.getsize(out_file) > 1000:
            downloaded += 1
            print(f"  OK: {os.path.getsize(out_file)} bytes")
        else:
            print(f"  Warning: small file ({os.path.getsize(out_file) if os.path.exists(out_file) else 0} bytes)")
    except Exception as e:
        print(f"  Error downloading {tag}: {e}")

print(f"\nFinished: {downloaded}/{len(selected_chaldal)} master Chaldal packets ready!")
