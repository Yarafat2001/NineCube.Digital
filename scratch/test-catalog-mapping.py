import json, os

path = 'C:/Users/yeasi/source/repos/NineCube.Digital/data/bd-catalog/bd-catalog.json'
with open(path, encoding='utf-8') as f:
    bundle = json.load(f)

products = bundle['products']
bd_dir = 'C:/Users/yeasi/source/repos/NineCube.Digital/web/public/products/bd'
existing_files = set(os.listdir(bd_dir))

def get_product_images(p):
    slug = (p.get('slug') or '').lower()
    name = (p.get('name') or '').lower()
    cat = (p.get('category') or '').lower()
    
    # Defaults
    primary = f'/products/bd/{slug}.jpg' if f'{slug}.jpg' in existing_files else '/products/bd/canonical_chashi_rice_packet.jpg'
    secondary = f'/products/bd/{slug}-open.jpg' if f'{slug}-open.jpg' in existing_files else None
    
    # 1. Chinigura & Rice
    if 'chinigura' in slug or 'chinigura' in name or cat == 'rice' or 'rice' in slug:
        if 'bashundhara' in slug or 'bashundhara' in name:
            if '10kg' in slug: primary = '/products/bd/canonical_bashundhara_rice_packet_10kg.jpg'
            elif '5kg' in slug: primary = '/products/bd/canonical_bashundhara_rice_packet_5kg.jpg'
            elif '2kg' in slug: primary = '/products/bd/canonical_bashundhara_rice_packet_2kg.jpg'
            else: primary = '/products/bd/canonical_bashundhara_rice_packet_1kg.jpg'
        elif 'pran' in slug or 'pran' in name:
            primary = '/products/bd/canonical_pran_rice_packet.jpg'
        elif 'chashi' in slug or 'chashi' in name:
            primary = '/products/bd/canonical_chashi_rice_packet.jpg'
        elif 'aci' in slug:
            primary = '/products/bd/canonical_aci_miniket_packet.jpg' if 'miniket' in slug else '/products/bd/canonical_aci_nazirshail_packet.jpg'
        elif 'fresh' in slug:
            primary = '/products/bd/canonical_fresh_rice_packet.jpg'
        elif 'rupchanda' in slug:
            primary = '/products/bd/canonical_rupchanda_rice_packet.jpg'
        secondary = '/products/bd/canonical_chinigura_rice_open.jpg'
    
    # 2. Cooking Oil
    elif 'mustard-oil' in slug or 'mustard oil' in name:
        primary = '/products/bd/canonical_fresh_mustard_packet.jpg' if 'fresh' in slug else '/products/bd/canonical_radhuni_mustard_packet.jpg'
        secondary = '/products/bd/canonical_mustard_oil_open.jpg'
    elif 'olive-oil' in slug or 'olive oil' in name:
        primary = '/products/bd/canonical_olive_oil_packet.jpg'
        secondary = '/products/bd/canonical_olive_oil_open.jpg'
    elif 'soybean' in slug or 'soybean' in name:
        primary = '/products/bd/canonical_rupchanda_soybean_packet.jpg' if 'rupchanda' in slug else '/products/bd/canonical_teer_soybean_packet.jpg'
        secondary = primary
    
    # 3. Spices
    elif 'turmeric' in slug or 'turmeric' in name:
        primary = '/products/bd/canonical_radhuni_turmeric_packet.jpg'
        secondary = '/products/bd/canonical_turmeric_open.jpg'
    elif 'chilli' in slug or 'chilli' in name:
        primary = '/products/bd/canonical_radhuni_chilli_packet.jpg'
        secondary = primary
    elif 'coriander' in slug or 'coriander' in name:
        primary = '/products/bd/canonical_radhuni_coriander_packet.jpg'
        secondary = primary
    elif 'cumin' in slug or 'cumin' in name:
        primary = '/products/bd/canonical_radhuni_cumin_packet.jpg'
        secondary = primary
    elif 'biryani' in slug or 'biryani' in name:
        primary = '/products/bd/canonical_radhuni_biryani_packet.jpg'
        secondary = primary
    elif 'garam-masala' in slug or 'garam masala' in name:
        primary = '/products/bd/canonical_radhuni_garam_masala_packet.jpg'
        secondary = primary
    
    # 4. Dairy
    elif 'sweet-yogurt' in slug or 'sweet yogurt' in name or 'mishti-doi' in slug:
        primary = '/products/bd/canonical_aarong_sweet_yogurt_packet.jpg'
        secondary = primary
    elif 'liquid-milk' in slug or 'liquid milk' in name or 'uht-milk' in slug:
        primary = '/products/bd/canonical_aarong_liquid_milk_packet.jpg'
        secondary = primary
    elif 'ghee' in slug or 'ghee' in name:
        primary = '/products/bd/canonical_aarong_ghee_packet.jpg'
        secondary = primary
    elif 'powder-milk' in slug or 'milk-powder' in slug:
        primary = '/products/bd/canonical_marks_milk_powder_packet.jpg' if 'marks' in slug else '/products/bd/canonical_dano_powder_milk_packet.jpg'
        secondary = primary
    elif 'roshogolla' in slug or 'roshogolla' in name:
        primary = '/products/bd/canonical_aarong_roshogolla_packet.jpg'
        secondary = primary
        
    # 5. Jewelry
    elif 'anklet' in slug or 'anklet' in name or 'payel' in slug or 'payel' in name:
        if 'silver' in slug or 'silver' in name:
            primary = '/products/bd/canonical_anklet_silver_packet.jpg'
            secondary = '/products/bd/canonical_anklet_silver_open.jpg'
        else:
            primary = '/products/bd/canonical_anklet_gold_packet.jpg'
            secondary = '/products/bd/canonical_anklet_gold_open.jpg'
            
    # 6. Baby Care
    elif 'baby-winter' in slug or 'baby winter' in name or ('winter-set' in slug and 'baby' in slug):
        primary = '/products/bd/canonical_baby_winter_packet.jpg'
        secondary = '/products/bd/canonical_baby_winter_open.jpg'
        
    # 7. 10 Minute School Courses
    elif '10-minute-school' in slug or '10 minute school' in name or cat == 'online-learning':
        if 'freelancing' in slug:
            primary = '/products/bd/canonical_10ms_freelancing_packet.jpg'
            secondary = '/products/bd/canonical_10ms_freelancing_open.jpg'
        elif 'ielts' in slug:
            primary = '/products/bd/canonical_10ms_ielts_packet.jpg'
            secondary = '/products/bd/canonical_10ms_ielts_open.jpg'
        elif 'python' in slug:
            primary = '/products/bd/canonical_10ms_python_packet.jpg'
            secondary = '/products/bd/canonical_10ms_python_open.jpg'
        else:
            primary = '/products/bd/canonical_10ms_general_packet.jpg'
            secondary = '/products/bd/canonical_10ms_general_open.jpg'
            
    # 8. Laptops
    elif cat in ('laptops-computers', 'laptops') or 'laptop' in slug:
        primary = '/products/laptops/acer-aspire-lite-al15-41-16gb-512gb-0-9259d53635.webp'
        secondary = '/products/laptops/acer-aspire-lite-al15-41-16gb-512gb-1-b75f08eb4a.webp'
        
    # 9. Apparel
    elif 'panjabi' in slug or 'panjabi' in name:
        primary = '/products/bd/canonical_panjabi_embroidered.jpg'
        secondary = primary
    elif 'saree' in slug or 'saree' in name:
        primary = '/products/bd/canonical_saree_jamdani.jpg'
        secondary = primary
        
    # 10. Beverages
    elif 'tea' in slug or 'tea' in name:
        primary = '/products/bd/canonical_taaza_tea_packet.jpg' if 'taaza' in slug else '/products/bd/canonical_ispahani_tea_packet.jpg'
        secondary = primary
    elif 'mojo' in slug or 'cola' in slug:
        primary = '/products/bd/canonical_mojo_cola_packet.jpg'
        secondary = primary
    elif 'mango' in slug:
        primary = '/products/bd/canonical_pran_mango_packet.jpg'
        secondary = primary
    elif 'litchi' in slug:
        primary = '/products/bd/canonical_pran_litchi_packet.jpg'
        secondary = primary
        
    # 11. Snacks
    elif 'chanachur' in slug:
        primary = '/products/bd/canonical_bombay_chanachur_packet.jpg'
        secondary = primary
    elif 'noodles' in slug:
        primary = '/products/bd/canonical_maggi_noodles_packet.jpg'
        secondary = primary
    elif 'biscuit' in slug or 'energy' in slug:
        primary = '/products/bd/canonical_olympic_energy_packet.jpg'
        secondary = primary
        
    # 12. Staples
    elif 'atta' in slug:
        primary = '/products/bd/canonical_atta_packet.jpg'
        secondary = primary
    elif 'maida' in slug:
        primary = '/products/bd/canonical_maida_packet.jpg'
        secondary = primary
    elif 'dal' in slug or 'lentil' in slug:
        primary = '/products/bd/canonical_dal_packet.jpg'
        secondary = primary
        
    # 13. Smartphones
    elif cat in ('smartphones', 'mobile-phones') or 'smartphone' in slug:
        primary = '/products/bd/canonical_smartphone.jpg'
        secondary = primary
        
    if not secondary:
        secondary = primary
        
    return primary, secondary

# Test on 20 sample products from varied categories
samples = [
    'bashundhara-aromatic-chinigura-rice-10kg',
    'pran-kalijeera-rice-1kg',
    'fresh-mustard-oil-1l',
    'radhuni-mustard-oil-1l',
    'fresh-extra-virgin-olive-oil-1l',
    'aarong-anklet-gold-plated-premium-line',
    'aarong-anklet-oxidized-silver',
    'aarong-baby-winter-set-size-m',
    '10-minute-school-freelancing-masterclass-certificate',
    '10-minute-school-ielts-preparation-course-certificate',
    'acer-aspire-5-core-i7-16gb-512gb',
    'aarong-leather-formal-shoe-size-40-new-arrival',
    'amazfit-gps-sports-watch-amoled',
    'haier-frost-free-refrigerator-118l',
    'radhuni-turmeric-powder-100g',
    'bombay-sweets-bombay-chanachur-300g',
    'ispahani-mirzapore-tea-bag-pack-of-50',
    'aarong-dairy-sweet-yogurt-500g'
]

print("--- Sample Mapping Verification ---")
for s in samples:
    p = next((x for x in products if x.get('slug') == s), None)
    if p:
        prim, sec = get_product_images(p)
        print(f"[{p.get('name')}]")
        print(f"   Primary  (Packet): {prim}")
        print(f"   Secondary (Open) : {sec}")
    else:
        print(f"SLUG NOT FOUND: {s}")
