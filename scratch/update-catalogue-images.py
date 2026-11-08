import json
import os
from pathlib import Path

REPO = Path('C:/Users/yeasi/source/repos/NineCube.Digital')
PUBLIC = REPO / 'web' / 'public'
BD_DIR = PUBLIC / 'products' / 'bd'

existing_public_files = set()
for r, d, fs in os.walk(PUBLIC):
    for f in fs:
        rel = Path(r, f).relative_to(PUBLIC).as_posix()
        existing_public_files.add('/' + rel)

print(f"Total existing public files: {len(existing_public_files)}")

def resolve_product_dual_images(p):
    slug = (p.get('slug') or '').lower()
    name = (p.get('name') or '').lower()
    cat = (p.get('category') or '').lower()
    
    # 1. Chinigura & Rice Staples
    is_rice = 'rice' in cat or 'rice' in slug or 'rice' in name or 'chinigura' in slug or 'chinigura' in name or 'chal' in slug or 'chal' in name or 'atap' in slug or 'najirshail' in slug or 'miniket' in slug or 'kalijeera' in slug
    if is_rice:
        if 'bashundhara' in slug or 'bashundhara' in name:
            if '10kg' in slug: prim = '/products/bd/canonical_bashundhara_rice_packet_10kg.jpg'
            elif '5kg' in slug: prim = '/products/bd/canonical_bashundhara_rice_packet_5kg.jpg'
            elif '2kg' in slug: prim = '/products/bd/canonical_bashundhara_rice_packet_2kg.jpg'
            else: prim = '/products/bd/canonical_bashundhara_rice_packet_1kg.jpg'
        elif 'pran' in slug or 'pran' in name:
            prim = '/products/bd/canonical_pran_rice_packet.jpg'
        elif 'chashi' in slug or 'chashi' in name:
            prim = '/products/bd/canonical_chashi_rice_packet.jpg'
        elif 'aci' in slug or 'aci' in name:
            prim = '/products/bd/canonical_aci_miniket_packet.jpg' if 'miniket' in slug else '/products/bd/canonical_aci_nazirshail_packet.jpg'
        elif 'fresh' in slug or 'fresh' in name:
            prim = '/products/bd/canonical_fresh_rice_packet.jpg'
        elif 'rupchanda' in slug:
            prim = '/products/bd/canonical_rupchanda_rice_packet.jpg'
        else:
            prim = '/products/bd/canonical_chashi_rice_packet.jpg'
        sec = '/products/bd/canonical_chinigura_rice_open.jpg'
        return prim, sec, f"{p.get('name')} (Packet View)", f"{p.get('name')} (Aromatic Grains View)"

    # 2. Cooking Oil
    if 'mustard-oil' in slug or 'mustard oil' in name:
        prim = '/products/bd/canonical_fresh_mustard_packet.jpg' if 'fresh' in slug else '/products/bd/canonical_radhuni_mustard_packet.jpg'
        sec = '/products/bd/canonical_mustard_oil_open.jpg'
        return prim, sec, f"{p.get('name')} (Bottle View)", f"{p.get('name')} (Pure Golden Mustard Oil with Seeds)"

    if 'olive-oil' in slug or 'olive oil' in name:
        prim = '/products/bd/canonical_olive_oil_packet.jpg'
        sec = '/products/bd/canonical_olive_oil_open.jpg'
        return prim, sec, f"{p.get('name')} (Bottle View)", f"{p.get('name')} (Pure Extra Virgin Olive Oil & Olives)"

    if 'soybean' in slug or 'soybean' in name or 'palm-oil' in slug:
        prim = '/products/bd/canonical_rupchanda_soybean_packet.jpg' if 'rupchanda' in slug else '/products/bd/canonical_teer_soybean_packet.jpg'
        return prim, prim, f"{p.get('name')} (Bottle View)", f"{p.get('name')} (Detail View)"

    # 3. Spices
    if 'turmeric' in slug or 'turmeric' in name:
        return '/products/bd/canonical_radhuni_turmeric_packet.jpg', '/products/bd/canonical_turmeric_open.jpg', f"{p.get('name')} (Retail Pack)", f"{p.get('name')} (Pure Ground Turmeric Powder)"
    if 'chilli' in slug or 'chilli' in name:
        return '/products/bd/canonical_radhuni_chilli_packet.jpg', '/products/bd/canonical_radhuni_chilli_packet.jpg', f"{p.get('name')} (Retail Pack)", f"{p.get('name')} (Detail View)"
    if 'coriander' in slug or 'coriander' in name:
        return '/products/bd/canonical_radhuni_coriander_packet.jpg', '/products/bd/canonical_radhuni_coriander_packet.jpg', f"{p.get('name')} (Retail Pack)", f"{p.get('name')} (Detail View)"
    if 'cumin' in slug or 'cumin' in name:
        return '/products/bd/canonical_radhuni_cumin_packet.jpg', '/products/bd/canonical_radhuni_cumin_packet.jpg', f"{p.get('name')} (Retail Pack)", f"{p.get('name')} (Detail View)"
    if 'biryani' in slug or 'biryani' in name:
        return '/products/bd/canonical_radhuni_biryani_packet.jpg', '/products/bd/canonical_radhuni_biryani_packet.jpg', f"{p.get('name')} (Retail Pack)", f"{p.get('name')} (Detail View)"
    if 'garam-masala' in slug or 'garam masala' in name:
        return '/products/bd/canonical_radhuni_garam_masala_packet.jpg', '/products/bd/canonical_radhuni_garam_masala_packet.jpg', f"{p.get('name')} (Retail Pack)", f"{p.get('name')} (Detail View)"

    # 4. Dairy
    if 'sweet-yogurt' in slug or 'sweet yogurt' in name:
        return '/products/bd/canonical_aarong_sweet_yogurt_packet.jpg', '/products/bd/canonical_aarong_sweet_yogurt_packet.jpg', f"{p.get('name')} (Clay Pot)", f"{p.get('name')} (Sweet Mishti Doi View)"
    if 'sour-yogurt' in slug or 'sour yogurt' in name:
        return '/products/bd/canonical_aarong_sour_yogurt_packet.jpg', '/products/bd/canonical_aarong_sour_yogurt_packet.jpg', f"{p.get('name')} (Pot View)", f"{p.get('name')} (Detail View)"
    if 'liquid-milk' in slug or 'liquid milk' in name or 'uht-milk' in slug:
        return '/products/bd/canonical_aarong_liquid_milk_packet.jpg', '/products/bd/canonical_aarong_liquid_milk_packet.jpg', f"{p.get('name')} (Carton View)", f"{p.get('name')} (Detail View)"
    if 'ghee' in slug or 'ghee' in name:
        return '/products/bd/canonical_aarong_ghee_packet.jpg', '/products/bd/canonical_aarong_ghee_packet.jpg', f"{p.get('name')} (Jar View)", f"{p.get('name')} (Detail View)"
    if 'roshogolla' in slug or 'roshogolla' in name:
        return '/products/bd/canonical_aarong_roshogolla_packet.jpg', '/products/bd/canonical_aarong_roshogolla_packet.jpg', f"{p.get('name')} (Can View)", f"{p.get('name')} (Detail View)"
    if 'powder-milk' in slug or 'milk-powder' in slug:
        prim = '/products/bd/canonical_marks_milk_powder_packet.jpg' if 'marks' in slug else '/products/bd/canonical_dano_powder_milk_packet.jpg'
        return prim, prim, f"{p.get('name')} (Pack View)", f"{p.get('name')} (Detail View)"

    # 5. Jewelry
    if 'anklet' in slug or 'anklet' in name or 'payel' in slug or 'payel' in name:
        if 'silver' in slug or 'silver' in name:
            return '/products/bd/canonical_anklet_silver_packet.jpg', '/products/bd/canonical_anklet_silver_open.jpg', f"{p.get('name')} (Jewelry Box)", f"{p.get('name')} (Silver Payel with Bells)"
        else:
            return '/products/bd/canonical_anklet_gold_packet.jpg', '/products/bd/canonical_anklet_gold_open.jpg', f"{p.get('name')} (Luxury Gift Box)", f"{p.get('name')} (Gold Plated Payel on Ankle)"

    # 6. Baby Winter Set
    if 'baby-winter' in slug or 'baby winter' in name or ('winter-set' in slug and 'baby' in slug):
        return '/products/bd/canonical_baby_winter_packet.jpg', '/products/bd/canonical_baby_winter_open.jpg', f"{p.get('name')} (Folded Set)", f"{p.get('name')} (Hand-Knitted Sweater with Buttons)"

    # 7. 10 Minute School Courses
    if '10-minute-school' in slug or '10 minute school' in name or cat == 'online-learning':
        if 'freelancing' in slug:
            return '/products/bd/canonical_10ms_freelancing_packet.jpg', '/products/bd/canonical_10ms_freelancing_open.jpg', f"{p.get('name')} (Course Card)", f"{p.get('name')} (Student Learning Dashboard)"
        if 'ielts' in slug:
            return '/products/bd/canonical_10ms_ielts_packet.jpg', '/products/bd/canonical_10ms_ielts_open.jpg', f"{p.get('name')} (Course Card)", f"{p.get('name')} (Exam Practice Dashboard)"
        if 'python' in slug:
            return '/products/bd/canonical_10ms_python_packet.jpg', '/products/bd/canonical_10ms_python_open.jpg', f"{p.get('name')} (Course Card)", f"{p.get('name')} (Live Code IDE Dashboard)"
        return '/products/bd/canonical_10ms_general_packet.jpg', '/products/bd/canonical_10ms_general_open.jpg', f"{p.get('name')} (Course Card)", f"{p.get('name')} (LMS Dashboard)"

    # 8. Laptops
    if cat in ('laptops-computers', 'laptops') or 'laptop' in slug:
        return '/products/laptops/acer-aspire-lite-al15-41-16gb-512gb-0-9259d53635.webp', '/products/laptops/acer-aspire-lite-al15-41-16gb-512gb-1-b75f08eb4a.webp', f"{p.get('name')} (Closed Lid)", f"{p.get('name')} (Open Display & Keyboard)"

    # 9. Apparel
    if 'panjabi' in slug or 'panjabi' in name:
        return '/products/bd/canonical_panjabi_embroidered.jpg', '/products/bd/canonical_panjabi_embroidered.jpg', f"{p.get('name')} (Front View)", f"{p.get('name')} (Embroidery Detail)"
    if 'saree' in slug or 'saree' in name or 'kurti' in slug or 'three-piece' in slug:
        return '/products/bd/canonical_saree_jamdani.jpg', '/products/bd/canonical_saree_jamdani.jpg', f"{p.get('name')} (Full Saree Draping)", f"{p.get('name')} (Weave Detail)"

    # 10. Beverages
    if 'tea' in slug or 'tea' in name:
        prim = '/products/bd/canonical_taaza_tea_packet.jpg' if 'taaza' in slug else '/products/bd/canonical_ispahani_tea_packet.jpg'
        return prim, prim, f"{p.get('name')} (Packet View)", f"{p.get('name')} (Detail View)"
    if 'mojo' in slug or 'cola' in slug:
        return '/products/bd/canonical_mojo_cola_packet.jpg', '/products/bd/canonical_mojo_cola_packet.jpg', f"{p.get('name')} (Bottle View)", f"{p.get('name')} (Detail View)"
    if 'mango' in slug:
        return '/products/bd/canonical_pran_mango_packet.jpg', '/products/bd/canonical_pran_mango_packet.jpg', f"{p.get('name')} (Bottle View)", f"{p.get('name')} (Detail View)"
    if 'litchi' in slug:
        return '/products/bd/canonical_pran_litchi_packet.jpg', '/products/bd/canonical_pran_litchi_packet.jpg', f"{p.get('name')} (Pack View)", f"{p.get('name')} (Detail View)"

    # 11. Snacks
    if 'chanachur' in slug:
        return '/products/bd/canonical_bombay_chanachur_packet.jpg', '/products/bd/canonical_bombay_chanachur_packet.jpg', f"{p.get('name')} (Pack View)", f"{p.get('name')} (Detail View)"
    if 'noodles' in slug:
        return '/products/bd/canonical_maggi_noodles_packet.jpg', '/products/bd/canonical_maggi_noodles_packet.jpg', f"{p.get('name')} (Pack View)", f"{p.get('name')} (Detail View)"
    if 'biscuit' in slug or 'energy' in slug:
        return '/products/bd/canonical_olympic_energy_packet.jpg', '/products/bd/canonical_olympic_energy_packet.jpg', f"{p.get('name')} (Pack View)", f"{p.get('name')} (Detail View)"

    # 12. Staples
    if 'atta' in slug:
        return '/products/bd/canonical_atta_packet.jpg', '/products/bd/canonical_atta_packet.jpg', f"{p.get('name')} (Pack View)", f"{p.get('name')} (Detail View)"
    if 'maida' in slug:
        return '/products/bd/canonical_maida_packet.jpg', '/products/bd/canonical_maida_packet.jpg', f"{p.get('name')} (Pack View)", f"{p.get('name')} (Detail View)"
    if 'dal' in slug or 'lentil' in slug:
        return '/products/bd/canonical_dal_packet.jpg', '/products/bd/canonical_dal_packet.jpg', f"{p.get('name')} (Pack View)", f"{p.get('name')} (Detail View)"

    # 13. Smartphones
    if cat in ('smartphones', 'mobile-phones') or 'smartphone' in slug:
        return '/products/bd/canonical_smartphone.jpg', '/products/bd/canonical_smartphone.jpg', f"{p.get('name')} (Phone View)", f"{p.get('name')} (Display View)"

    # 14. Exact slug image if available on disk!
    slug_file = f'/products/bd/{slug}.jpg'
    if slug_file in existing_public_files:
        open_file = f'/products/bd/{slug}-open.jpg'
        sec = open_file if open_file in existing_public_files else slug_file
        return slug_file, sec, f"{p.get('name')} (Retail View)", f"{p.get('name')} (Detail View)"

    # 15. Category fallback - NEVER RICE for non-rice!
    if 'clothing' in cat or 'mens' in cat:
        return '/products/bd/canonical_panjabi_embroidered.jpg', '/products/bd/canonical_panjabi_embroidered.jpg', p.get('name'), p.get('name')
    if 'saree' in cat or 'womens' in cat:
        return '/products/bd/canonical_saree_jamdani.jpg', '/products/bd/canonical_saree_jamdani.jpg', p.get('name'), p.get('name')
    if 'beauty' in cat or 'personal-care' in cat or 'skincare' in cat or 'makeup' in cat:
        return '/products/bd/cetaphil-body-lotion-30ml.jpg', '/products/bd/cetaphil-body-lotion-30ml.jpg', p.get('name'), p.get('name')
    if 'footwear' in cat:
        return '/products/bd/aarong-leather-formal-shoe-size-40-new-arrival.jpg', '/products/bd/aarong-leather-formal-shoe-size-40-new-arrival.jpg', p.get('name'), p.get('name')
    if 'watches' in cat:
        return '/products/bd/amazfit-gps-sports-watch-amoled.jpg', '/products/bd/amazfit-gps-sports-watch-amoled.jpg', p.get('name'), p.get('name')
    if 'home-appliances' in cat or 'refrigerator' in cat:
        return '/products/bd/haier-frost-free-refrigerator-118l.jpg', '/products/bd/haier-frost-free-refrigerator-118l.jpg', p.get('name'), p.get('name')
    if 'electronics' in cat or 'audio' in cat or 'tv' in cat:
        return '/products/bd/canonical_smartphone.jpg', '/products/bd/canonical_smartphone.jpg', p.get('name'), p.get('name')

    # Safe default
    return '/products/bd/canonical_atta_packet.jpg', '/products/bd/canonical_atta_packet.jpg', p.get('name'), p.get('name')

# Process both JSON files
for target_path in [
    REPO / 'src' / 'NineCube.Infrastructure' / 'Persistence' / 'production-catalogue.json',
    REPO / 'data' / 'bd-catalog' / 'bd-catalog.json'
]:
    print(f"\nProcessing {target_path} ...")
    bundle = json.loads(target_path.read_text(encoding='utf-8'))
    products = bundle['products']
    updated = 0
    missing_assets = set()
    
    for p in products:
        prim, sec, prim_alt, sec_alt = resolve_product_dual_images(p)
        if prim not in existing_public_files: missing_assets.add(prim)
        if sec not in existing_public_files: missing_assets.add(sec)
        
        p['images'] = [
            {'url': prim, 'altText': prim_alt, 'isPrimary': True},
            {'url': sec, 'altText': sec_alt, 'isPrimary': False}
        ]
        p['imageUrl'] = prim
        updated += 1
        
    assert len(missing_assets) == 0, f"Missing assets: {missing_assets}"
    
    target_path.write_text(json.dumps(bundle, ensure_ascii=False, indent=2) + "\n", encoding='utf-8')
    print(f"Updated {updated} products in {target_path}. 0 missing assets!")
