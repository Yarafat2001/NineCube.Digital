import json
import os
import shutil
import sys

sys.stdout.reconfigure(line_buffering=True)
print("=== Starting Fast Authentic BD Catalog Deployment ===", flush=True)

catalog_path = r'C:\Users\yeasi\source\repos\NineCube.Digital\data\bd-catalog\bd-catalog.json'
prod_catalogue_path = r'C:\Users\yeasi\source\repos\NineCube.Digital\src\NineCube.Infrastructure\Persistence\production-catalogue.json'
output_dir = r'C:\Users\yeasi\source\repos\NineCube.Digital\web\public\products\bd'
os.makedirs(output_dir, exist_ok=True)

# Helper to resolve best canonical pair for each product
def resolve_product_pair(p):
    brand = p.get('brand', '').lower()
    cat = p.get('category', '').lower()
    name = p.get('name', '').lower()
    
    # 1. 10MS Course
    if '10 minute school' in brand or 'shikho' in brand or 'learning' in cat or 'course' in name or 'certificate' in name:
        if 'freelancing' in name:
            return ('canonical_10ms_freelancing_packet.jpg', 'canonical_10ms_freelancing_open.jpg')
        elif 'ielts' in name:
            return ('canonical_10ms_ielts_packet.jpg', 'canonical_10ms_ielts_open.jpg')
        elif 'python' in name:
            return ('canonical_10ms_python_packet.jpg', 'canonical_10ms_python_open.jpg')
        else:
            return ('canonical_10ms_general_packet.jpg', 'canonical_10ms_general_open.jpg')
            
    # 2. Rice
    if 'rice' in cat or 'rice' in name or 'chinigura' in name or 'chal' in name:
        open_img = 'canonical_chinigura_rice_open.jpg'
        if 'bashundhara' in brand or 'bashundhara' in name:
            wt = '10kg' if '10kg' in name else '5kg' if '5kg' in name else '2kg' if '2kg' in name else '1kg'
            return (f'canonical_bashundhara_rice_packet_{wt}.jpg', open_img)
        elif 'pran' in brand or 'pran' in name:
            return ('canonical_pran_rice_packet.jpg', open_img)
        elif 'chashi' in brand or 'chashi' in name:
            return ('canonical_chashi_rice_packet.jpg', open_img)
        elif 'fresh' in brand or 'fresh' in name:
            return ('canonical_fresh_rice_packet.jpg', open_img)
        elif 'aci' in brand or 'aci' in name:
            p_img = 'canonical_aci_miniket_packet.jpg' if 'miniket' in name else 'canonical_aci_nazirshail_packet.jpg'
            return (p_img, open_img)
        elif 'rupchanda' in brand or 'rupchanda' in name:
            return ('canonical_rupchanda_rice_packet.jpg', open_img)
        else:
            return ('canonical_chashi_rice_packet.jpg', open_img)
            
    # 3. Cooking Oil
    if 'oil' in cat or 'oil' in name:
        if 'olive' in name:
            return ('canonical_olive_oil_packet.jpg', 'canonical_olive_oil_open.jpg')
        elif 'mustard' in name or 'sarisha' in name:
            p_img = 'canonical_radhuni_mustard_packet.jpg' if 'radhuni' in brand else 'canonical_fresh_mustard_packet.jpg'
            return (p_img, 'canonical_mustard_oil_open.jpg')
        elif 'soybean' in name or 'soyabean' in name:
            p_img = 'canonical_teer_soybean_packet.jpg' if 'teer' in brand else 'canonical_rupchanda_soybean_packet.jpg' if 'rupchanda' in brand else 'canonical_fresh_soybean_packet.jpg'
            return (p_img, 'canonical_mustard_oil_open.jpg')
        else:
            return ('canonical_fresh_soybean_packet.jpg', 'canonical_mustard_oil_open.jpg')
            
    # 4. Spices & Masala
    if 'spice' in cat or 'masala' in cat or any(k in name for k in ['turmeric', 'chili', 'chilli', 'cumin', 'coriander', 'biryani', 'garam']):
        if 'turmeric' in name or 'haldi' in name:
            return ('canonical_radhuni_turmeric_packet.jpg', 'canonical_turmeric_open.jpg')
        elif 'chili' in name or 'chilli' in name or 'morich' in name:
            return ('canonical_radhuni_chilli_packet.jpg', 'canonical_radhuni_chilli_packet.jpg')
        elif 'coriander' in name or 'dhania' in name:
            return ('canonical_radhuni_coriander_packet.jpg', 'canonical_radhuni_coriander_packet.jpg')
        elif 'cumin' in name or 'jeera' in name:
            return ('canonical_radhuni_cumin_packet.jpg', 'canonical_radhuni_cumin_packet.jpg')
        elif 'biryani' in name:
            return ('canonical_radhuni_biryani_packet.jpg', 'canonical_radhuni_biryani_packet.jpg')
        else:
            return ('canonical_radhuni_garam_masala_packet.jpg', 'canonical_radhuni_garam_masala_packet.jpg')
            
    # 5. Jewelry & Anklets
    if 'jewelry' in cat or any(k in name for k in ['anklet', 'payel', 'nupur', 'bangle']):
        if 'anklet' in name or 'payel' in name or 'nupur' in name:
            if 'silver' in name or 'oxidized' in name:
                return ('canonical_anklet_silver_packet.jpg', 'canonical_anklet_silver_open.jpg')
            else:
                return ('canonical_anklet_gold_packet.jpg', 'canonical_anklet_gold_open.jpg')
                
    # 6. Kids & Baby clothes
    if 'kids' in cat or 'baby' in cat or ('winter' in name and 'set' in name):
        return ('canonical_baby_winter_packet.jpg', 'canonical_baby_winter_open.jpg')
        
    # 7. Dairy
    if 'dairy' in cat or any(k in name for k in ['yogurt', 'curd', 'ghee', 'milk', 'doi']):
        if 'sweet' in name or 'mishti' in name or 'doi' in name:
            return ('canonical_aarong_sweet_yogurt_packet.jpg', 'canonical_aarong_sweet_yogurt_packet.jpg')
        elif 'sour' in name or 'tok' in name:
            return ('canonical_aarong_sour_yogurt_packet.jpg', 'canonical_aarong_sour_yogurt_packet.jpg')
        elif 'ghee' in name:
            return ('canonical_aarong_ghee_packet.jpg', 'canonical_aarong_ghee_packet.jpg')
        elif 'powder' in name:
            p_img = 'canonical_dano_powder_milk_packet.jpg' if 'dano' in brand else 'canonical_marks_milk_powder_packet.jpg'
            return (p_img, p_img)
        else:
            return ('canonical_aarong_liquid_milk_packet.jpg', 'canonical_aarong_liquid_milk_packet.jpg')
            
    # 8. Tea & Beverages
    if 'beverage' in cat or any(k in name for k in ['tea', 'juice', 'cola']):
        if 'tea' in name:
            p_img = 'canonical_ispahani_tea_packet.jpg' if 'ispahani' in brand else 'canonical_taaza_tea_packet.jpg'
            return (p_img, p_img)
        elif 'mango' in name:
            return ('canonical_pran_mango_packet.jpg', 'canonical_pran_mango_packet.jpg')
        elif 'litchi' in name:
            return ('canonical_pran_litchi_packet.jpg', 'canonical_pran_litchi_packet.jpg')
        elif 'cola' in name or 'mojo' in name:
            return ('canonical_mojo_cola_packet.jpg', 'canonical_mojo_cola_packet.jpg')
            
    # 9. Snacks & Staples
    if 'chanachur' in name or 'snack' in cat:
        return ('canonical_bombay_chanachur_packet.jpg', 'canonical_bombay_chanachur_packet.jpg')
    if 'biscuit' in name or 'energy' in name:
        return ('canonical_olympic_energy_packet.jpg', 'canonical_olympic_energy_packet.jpg')
    if 'noodles' in name:
        return ('canonical_maggi_noodles_packet.jpg', 'canonical_maggi_noodles_packet.jpg')
    if 'dal' in name or 'lentil' in name:
        return ('canonical_dal_packet.jpg', 'canonical_dal_packet.jpg')
    if 'atta' in name or 'flour' in name:
        return ('canonical_atta_packet.jpg', 'canonical_atta_packet.jpg')
    if 'saree' in name or 'saree' in cat:
        return ('canonical_saree_jamdani.jpg', 'canonical_saree_jamdani.jpg')
    if 'panjabi' in name or 'panjabi' in cat:
        return ('canonical_panjabi_embroidered.jpg', 'canonical_panjabi_embroidered.jpg')
    if 'smartphone' in cat or 'phone' in cat:
        return ('canonical_smartphone.jpg', 'canonical_smartphone.jpg')
        
    return ('canonical_chashi_rice_packet.jpg', 'canonical_chinigura_rice_open.jpg')

# Process all catalog products
print("Reading bd-catalog.json...", flush=True)
with open(catalog_path, encoding='utf-8') as f:
    catalog_data = json.load(f)

products = catalog_data['products']
print(f"Updating metadata for {len(products)} products...", flush=True)

for p in products:
    slug = p['slug']
    p_file, o_file = resolve_product_pair(p)
    
    p_url = f"/products/bd/{p_file}"
    o_url = f"/products/bd/{o_file}"
    
    p['imageUrl'] = p_url
    p['images'] = [
        {
            'url': p_url,
            'altText': f"{p['name']} (Packet View)",
            'isPrimary': True
        },
        {
            'url': o_url,
            'altText': f"{p['name']} (Open View)",
            'isPrimary': False
        }
    ]

# Save bd-catalog.json
print("Writing updated bd-catalog.json...", flush=True)
with open(catalog_path, 'w', encoding='utf-8') as f:
    json.dump(catalog_data, f, indent=2, ensure_ascii=False)
print(f"Saved {catalog_path} with {len(products)} products!", flush=True)

# Save production-catalogue.json
print("Reading production-catalogue.json...", flush=True)
with open(prod_catalogue_path, encoding='utf-8') as f:
    prod_data = json.load(f)

slug_map = {p['slug']: p for p in products}
updated_prod = 0
prod_list = prod_data.get('products', prod_data if isinstance(prod_data, list) else [])
for item in prod_list:
    islug = item.get('slug')
    if islug in slug_map:
        source = slug_map[islug]
        item['imageUrl'] = source['imageUrl']
        item['images'] = source['images']
        updated_prod += 1

print(f"Writing updated production-catalogue.json ({updated_prod} matched)...", flush=True)
with open(prod_catalogue_path, 'w', encoding='utf-8') as f:
    json.dump(prod_data, f, indent=2, ensure_ascii=False)
print(f"Saved {prod_catalogue_path}!", flush=True)

print("=== FAST DEPLOYMENT FINISHED SUCCESSFULLY ===", flush=True)
