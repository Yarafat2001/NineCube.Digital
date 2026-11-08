import json
import os
import shutil
import re
from pathlib import Path

print("=== Starting Full Distinct Catalog & Slug Sync Pipeline ===")

REPO = Path('C:/Users/yeasi/source/repos/NineCube.Digital')
PROD_JSON = REPO / 'src/NineCube.Infrastructure/Persistence/production-catalogue.json'
PUBLIC_BD = REPO / 'web/public/products/bd'

with open(PROD_JSON, encoding='utf-8') as f:
    catalogue = json.load(f)

products = catalogue['products']
print(f"Loaded {len(products)} products from {PROD_JSON}")

def resolve_product_dual_images(p):
    slug = (p.get('slug') or '').lower()
    name = (p.get('name') or '').lower()
    cat = (p.get('category') or '').lower()

    # Safety: Exclude appliances & toys from rice
    is_appliance_or_toy = (
        cat in ('kitchenware', 'toys-kids-baby', 'baby-gear') or
        'cooker' in slug or 'fisher-price' in slug or 'cooker' in name
    )

    is_rice = not is_appliance_or_toy and (
        cat == 'rice' or
        bool(re.search(r'\b(?:rice|chal|chinigura|miniket|najirshail|nazirshail|kalijeera|kalijira|atap|basmati)\b', f"{slug} {name}"))
    )

    # 1. RICE VARIETIES
    if is_rice:
        is_miniket = bool(re.search(r'\bminiket\b', f"{slug} {name}"))
        is_najirshail = bool(re.search(r'\b(?:najirshail|nazirshail)\b', f"{slug} {name}"))
        is_kalijeera = bool(re.search(r'\b(?:kalijeera|kalijira)\b', f"{slug} {name}"))
        is_atap = bool(re.search(r'\b(?:atap|atop)\b', f"{slug} {name}"))
        is_basmati = bool(re.search(r'\bbasmati\b', f"{slug} {name}"))

        is_10kg = '10kg' in slug or '10kg' in name
        is_5kg = '5kg' in slug or '5kg' in name
        is_2kg = '2kg' in slug or '2kg' in name
        is_1kg = '1kg' in slug or '1kg' in name
        is_export = 'export' in slug or 'export' in name
        is_value = 'value' in slug or 'value' in name
        is_combo = 'combo' in slug or 'combo' in name or 'twin' in slug

        sz = '10kg' if is_10kg else '5kg' if is_5kg else '2kg' if is_2kg else '1kg' if is_1kg else '10kg'

        if 'bashundhara' in slug or 'bashundhara' in name:
            if is_miniket:
                tag = 'export' if is_export else 'value' if is_value else sz
                return f'/products/bd/canonical_bashundhara_miniket_packet_{tag}.jpg', '/products/bd/canonical_miniket_rice_open.jpg', f"{p['name']} (Packet View)", f"{p['name']} (Slender Polished Miniket Grains)"
            elif is_najirshail:
                tag = 'export' if is_export else 'value' if is_value else sz
                return f'/products/bd/canonical_bashundhara_najirshail_packet_{tag}.jpg', '/products/bd/canonical_najirshail_rice_open.jpg', f"{p['name']} (Packet View)", f"{p['name']} (Pointed Translucent Najirshail Grains)"
            elif is_kalijeera:
                tag = 'export' if is_export else 'value' if is_value else sz
                return f'/products/bd/canonical_bashundhara_kalijeera_packet_{tag}.jpg', '/products/bd/canonical_kalijeera_rice_open.jpg', f"{p['name']} (Packet View)", f"{p['name']} (Tiny Aromatic Kalijeera Polao Grains)"
            elif is_atap:
                tag = 'value' if is_value else sz
                return f'/products/bd/canonical_bashundhara_atap_packet_{tag}.jpg', '/products/bd/canonical_atap_rice_open.jpg', f"{p['name']} (Packet View)", f"{p['name']} (Sun-Dried Pure White Atap Grains)"
            else:
                tag = 'export' if is_export else 'value' if is_value else sz
                return f'/products/bd/canonical_bashundhara_chinigura_packet_{tag}.jpg', '/products/bd/canonical_chinigura_rice_open.jpg', f"{p['name']} (Packet View)", f"{p['name']} (Aromatic Chinigura Grains)"

        elif 'pran' in slug or 'pran' in name:
            if is_atap:
                tag = 'combo' if is_combo else sz
                return f'/products/bd/canonical_pran_atap_packet_{tag}.jpg', '/products/bd/canonical_atap_rice_open.jpg', f"{p['name']} (Packet View)", f"{p['name']} (Pure White Sun-Dried Atap Grains)"
            elif is_miniket:
                tag = 'combo' if is_combo else sz
                return f'/products/bd/canonical_pran_miniket_packet_{tag}.jpg', '/products/bd/canonical_miniket_rice_open.jpg', f"{p['name']} (Packet View)", f"{p['name']} (Long Slender Polished Miniket Grains)"
            elif is_najirshail:
                tag = 'combo' if is_combo else sz
                return f'/products/bd/canonical_pran_najirshail_packet_{tag}.jpg', '/products/bd/canonical_najirshail_rice_open.jpg', f"{p['name']} (Packet View)", f"{p['name']} (Firm Pointed Najirshail Grains)"
            elif is_kalijeera:
                tag = 'combo' if is_combo else sz
                return f'/products/bd/canonical_pran_kalijeera_packet_{tag}.jpg', '/products/bd/canonical_kalijeera_rice_open.jpg', f"{p['name']} (Packet View)", f"{p['name']} (Tiny Aromatic Polao Rice Grains)"
            else:
                prim = '/products/bd/canonical_pran_chinigura_packet_2kg.jpg' if is_2kg else '/products/bd/canonical_pran_rice_packet.jpg'
                return prim, '/products/bd/canonical_chinigura_rice_open.jpg', f"{p['name']} (Packet View)", f"{p['name']} (Aromatic Chinigura Grains)"

        elif 'aci' in slug or 'aci' in name:
            prim = '/products/bd/canonical_aci_miniket_packet.jpg' if is_miniket else '/products/bd/canonical_aci_nazirshail_packet.jpg'
            sec = '/products/bd/canonical_miniket_rice_open.jpg' if is_miniket else '/products/bd/canonical_najirshail_rice_open.jpg'
            return prim, sec, f"{p['name']} (Packet View)", f"{p['name']} (Grain Quality View)"

        elif 'chashi' in slug or 'chashi' in name:
            return '/products/bd/canonical_chashi_rice_packet.jpg', '/products/bd/canonical_chinigura_rice_open.jpg', f"{p['name']} (Packet View)", f"{p['name']} (Aromatic Grains View)"

        elif 'fresh' in slug or 'fresh' in name:
            sec = '/products/bd/canonical_atap_rice_open.jpg' if is_atap else '/products/bd/canonical_chinigura_rice_open.jpg'
            return '/products/bd/canonical_fresh_rice_packet.jpg', sec, f"{p['name']} (Packet View)", f"{p['name']} (Aromatic Grains View)"

        elif is_basmati:
            return '/products/bd/canonical_basmati_rice_packet.jpg', '/products/bd/canonical_miniket_rice_open.jpg', f"{p['name']} (Packet View)", f"{p['name']} (Long Slender Basmati Grains)"

        else:
            return '/products/bd/canonical_rupchanda_rice_packet.jpg', '/products/bd/canonical_chinigura_rice_open.jpg', f"{p['name']} (Packet View)", f"{p['name']} (Aromatic Grains View)"

    # 2. COOKING OILS
    is_auto = 'engine' in slug or 'gear' in slug or 'engine' in name or 'gear' in name
    is_personal = 'hair-oil' in slug or 'beard' in slug or 'fish-oil' in slug or 'hair' in name
    if not is_auto and not is_personal:
        if 'mustard-oil' in slug or 'mustard oil' in name:
            if 'fresh' in slug or 'fresh' in name:
                prim = '/products/bd/canonical_fresh_mustard_packet.jpg'
            elif 'pran' in slug or 'pran' in name:
                prim = '/products/bd/canonical_pran_mustard_packet.jpg'
            else:
                prim = '/products/bd/canonical_radhuni_mustard_packet.jpg'
            return prim, '/products/bd/canonical_mustard_oil_open.jpg', f"{p['name']} (Bottle View)", f"{p['name']} (Pure Golden Mustard Seeds)"

        if 'olive-oil' in slug or 'olive oil' in name:
            prim = '/products/bd/canonical_olive_oil_5l_packet.jpg' if '5l' in slug else '/products/bd/canonical_olive_oil_packet.jpg'
            return prim, '/products/bd/canonical_olive_oil_open.jpg', f"{p['name']} (Bottle View)", f"{p['name']} (Pure Extra Virgin Olive Oil & Whole Olives)"

        if 'soybean' in slug or 'soybean' in name or 'palm-oil' in slug or cat == 'cooking-oil':
            if 'fresh' in slug or 'fresh' in name:
                prim = '/products/bd/canonical_fresh_soybean_packet.jpg'
            elif 'rupchanda' in slug or 'rupchanda' in name:
                prim = '/products/bd/canonical_rupchanda_soybean_packet.jpg'
            else:
                prim = '/products/bd/canonical_teer_soybean_packet.jpg'
            return prim, prim, f"{p['name']} (Bottle View)", f"{p['name']} (Detail View)"

    # 3. SPICES
    if 'turmeric' in slug or 'turmeric' in name:
        return '/products/bd/canonical_radhuni_turmeric_packet.jpg', '/products/bd/canonical_turmeric_open.jpg', f"{p['name']} (Retail Pack)", f"{p['name']} (Pure Ground Turmeric Powder)"
    if 'chilli' in slug or 'chilli' in name:
        return '/products/bd/canonical_radhuni_chilli_packet.jpg', '/products/bd/canonical_radhuni_chilli_packet.jpg', f"{p['name']} (Retail Pack)", f"{p['name']} (Detail View)"
    if 'coriander' in slug or 'coriander' in name:
        return '/products/bd/canonical_radhuni_coriander_packet.jpg', '/products/bd/canonical_radhuni_coriander_packet.jpg', f"{p['name']} (Retail Pack)", f"{p['name']} (Detail View)"
    if 'cumin' in slug or 'cumin' in name:
        return '/products/bd/canonical_radhuni_cumin_packet.jpg', '/products/bd/canonical_radhuni_cumin_packet.jpg', f"{p['name']} (Retail Pack)", f"{p['name']} (Detail View)"
    if 'biryani' in slug or 'biryani' in name:
        return '/products/bd/canonical_radhuni_biryani_packet.jpg', '/products/bd/canonical_radhuni_biryani_packet.jpg', f"{p['name']} (Retail Pack)", f"{p['name']} (Detail View)"
    if 'garam-masala' in slug or 'garam masala' in name:
        return '/products/bd/canonical_radhuni_garam_masala_packet.jpg', '/products/bd/canonical_radhuni_garam_masala_packet.jpg', f"{p['name']} (Retail Pack)", f"{p['name']} (Detail View)"

    # 4. DAIRY
    if 'sweet-yogurt' in slug or 'sweet yogurt' in name:
        return '/products/bd/canonical_aarong_sweet_yogurt_packet.jpg', '/products/bd/canonical_aarong_sweet_yogurt_packet.jpg', f"{p['name']} (Clay Pot)", f"{p['name']} (Sweet Mishti Doi View)"
    if 'sour-yogurt' in slug or 'sour yogurt' in name:
        return '/products/bd/canonical_aarong_sour_yogurt_packet.jpg', '/products/bd/canonical_aarong_sour_yogurt_packet.jpg', f"{p['name']} (Pot View)", f"{p['name']} (Detail View)"
    if 'liquid-milk' in slug or 'liquid milk' in name or 'uht-milk' in slug:
        return '/products/bd/canonical_aarong_liquid_milk_packet.jpg', '/products/bd/canonical_aarong_liquid_milk_packet.jpg', f"{p['name']} (Carton View)", f"{p['name']} (Detail View)"
    if 'ghee' in slug or 'ghee' in name:
        return '/products/bd/canonical_aarong_ghee_packet.jpg', '/products/bd/canonical_aarong_ghee_packet.jpg', f"{p['name']} (Jar View)", f"{p['name']} (Detail View)"
    if 'roshogolla' in slug or 'roshogolla' in name:
        return '/products/bd/canonical_aarong_roshogolla_packet.jpg', '/products/bd/canonical_aarong_roshogolla_packet.jpg', f"{p['name']} (Can View)", f"{p['name']} (Detail View)"
    if 'powder-milk' in slug or 'milk-powder' in slug:
        prim = '/products/bd/canonical_marks_milk_powder_packet.jpg' if 'marks' in slug else '/products/bd/canonical_dano_powder_milk_packet.jpg'
        return prim, prim, f"{p['name']} (Pack View)", f"{p['name']} (Detail View)"

    # 5. JEWELRY
    if 'anklet' in slug or 'anklet' in name or 'payel' in slug or 'payel' in name:
        if 'silver' in slug or 'silver' in name or 'oxidized' in slug or 'oxidized' in name:
            return '/products/bd/canonical_anklet_silver_packet.jpg', '/products/bd/canonical_anklet_silver_open.jpg', f"{p['name']} (Jewelry Gift Box)", f"{p['name']} (Handcrafted Traditional Oxidized Silver Payel with Bells)"
        else:
            return '/products/bd/canonical_anklet_gold_packet.jpg', '/products/bd/canonical_anklet_gold_open.jpg', f"{p['name']} (Luxury Gift Box)", f"{p['name']} (Traditional Gold Plated Payel on Ankle with Ghungroo)"

    # 6. BABY WINTER SETS
    if 'baby-winter' in slug or 'baby winter' in name or ('winter-set' in slug and 'baby' in slug):
        sec = '/products/bd/canonical_baby_winter_new_open.jpg' if ('new-edition' in slug or 'new edition' in name) else '/products/bd/canonical_baby_winter_open.jpg'
        return '/products/bd/canonical_baby_winter_packet.jpg', sec, f"{p['name']} (Packaging Box)", f"{p['name']} (Hand-Knitted Woolen Baby Winter Sweater & Set)"

    # 7. 10 MINUTE SCHOOL
    if '10-minute-school' in slug or '10 minute school' in name or cat == 'online-learning':
        if 'freelancing-masterclass-certificate-plus' in slug or ('freelancing' in slug and 'plus' in slug):
            return '/products/bd/canonical_10ms_freelancing_plus_packet.jpg', '/products/bd/canonical_10ms_freelancing_plus_open.jpg', f"{p['name']} (VIP Cohort Certification Card)", f"{p['name']} (VIP Agency Incubator Portal)"
        elif 'freelancing' in slug or 'freelancing' in name:
            return '/products/bd/canonical_10ms_freelancing_packet.jpg', '/products/bd/canonical_10ms_freelancing_open.jpg', f"{p['name']} (Course Certification Card)", f"{p['name']} (Student Learning & Proposal Dashboard)"
        elif 'ielts' in slug or 'ielts' in name:
            return '/products/bd/canonical_10ms_ielts_packet.jpg', '/products/bd/canonical_10ms_ielts_open.jpg', f"{p['name']} (IELTS Band 8.0+ Mastery Card)", f"{p['name']} (Full Mock Diagnostic Dashboard)"
        elif 'python' in slug or 'python' in name:
            return '/products/bd/canonical_10ms_python_packet.jpg', '/products/bd/canonical_10ms_python_open.jpg', f"{p['name']} (Python Live Batch Card)", f"{p['name']} (Interactive Cloud IDE & Terminal)"
        else:
            return '/products/bd/canonical_10ms_general_packet.jpg', '/products/bd/canonical_10ms_general_open.jpg', f"{p['name']} (Official Course Card)", f"{p['name']} (Interactive Learning Dashboard)"

    # 8. LAPTOPS
    if cat in ('laptops-computers', 'laptops') or 'laptop' in slug:
        return '/products/laptops/acer-aspire-lite-al15-41-16gb-512gb-0-9259d53635.webp', '/products/laptops/acer-aspire-lite-al15-41-16gb-512gb-1-b75f08eb4a.webp', f"{p['name']} (Closed Lid)", f"{p['name']} (Open Display & Keyboard)"

    # 9. APPAREL
    if 'panjabi' in slug or 'panjabi' in name:
        return '/products/bd/canonical_panjabi_embroidered.jpg', '/products/bd/canonical_panjabi_embroidered.jpg', f"{p['name']} (Front View)", f"{p['name']} (Embroidery Detail)"
    if 'saree' in slug or 'saree' in name or 'kurti' in slug or 'three-piece' in slug:
        return '/products/bd/canonical_saree_jamdani.jpg', '/products/bd/canonical_saree_jamdani.jpg', f"{p['name']} (Full Saree Draping)", f"{p['name']} (Weave Detail)"

    # 10. SNACKS & BEVERAGES
    if 'chanachur' in slug or 'chanachur' in name:
        return '/products/bd/canonical_bombay_chanachur_packet.jpg', '/products/bd/canonical_bombay_chanachur_packet.jpg', f"{p['name']} (Snack Pack)", f"{p['name']} (Detail View)"
    if 'biscuit' in slug or 'energy' in slug or 'biscuit' in name:
        return '/products/bd/canonical_olympic_energy_packet.jpg', '/products/bd/canonical_olympic_energy_packet.jpg', f"{p['name']} (Biscuit Pack)", f"{p['name']} (Detail View)"
    if 'noodles' in slug or 'noodles' in name:
        return '/products/bd/canonical_maggi_noodles_packet.jpg', '/products/bd/canonical_maggi_noodles_packet.jpg', f"{p['name']} (Noodles Pack)", f"{p['name']} (Detail View)"
    if 'tea' in slug or 'tea' in name:
        prim = '/products/bd/canonical_taaza_tea_packet.jpg' if 'taaza' in slug else '/products/bd/canonical_ispahani_tea_packet.jpg'
        return prim, prim, f"{p['name']} (Tea Pack)", f"{p['name']} (Detail View)"
    if 'mojo' in slug or 'cola' in slug:
        return '/products/bd/canonical_mojo_cola_packet.jpg', '/products/bd/canonical_mojo_cola_packet.jpg', f"{p['name']} (Bottle View)", f"{p['name']} (Detail View)"
    if 'mango' in slug or 'litchi' in slug:
        prim = '/products/bd/canonical_pran_mango_packet.jpg' if 'mango' in slug else '/products/bd/canonical_pran_litchi_packet.jpg'
        return prim, prim, f"{p['name']} (Juice Pack)", f"{p['name']} (Detail View)"

    # 11. STAPLES
    if 'atta' in slug or 'atta' in name:
        return '/products/bd/canonical_atta_packet.jpg', '/products/bd/canonical_atta_packet.jpg', f"{p['name']} (Flour Pack)", f"{p['name']} (Detail View)"
    if 'maida' in slug or 'maida' in name:
        return '/products/bd/canonical_maida_packet.jpg', '/products/bd/canonical_maida_packet.jpg', f"{p['name']} (Maida Pack)", f"{p['name']} (Detail View)"
    if 'dal' in slug or 'dal' in name or 'lentil' in slug:
        return '/products/bd/canonical_dal_packet.jpg', '/products/bd/canonical_dal_packet.jpg', f"{p['name']} (Lentil Pack)", f"{p['name']} (Detail View)"

    # Preserve custom or existing if already valid
    cur_img = p.get('imageUrl') or ''
    if cur_img.startswith('/products/sourced/') or cur_img.startswith('/uploads/') or cur_img.startswith('/products/nc-'):
        return cur_img, cur_img, p['name'], p['name']

    # Default slug fallback
    return f'/products/bd/{slug}.jpg', f'/products/bd/{slug}-open.jpg', p['name'], f"{p['name']} (Detail)"

updated = 0
slug_copies = 0

for i, p in enumerate(products):
    slug = p.get('slug')
    sku = p.get('sku')
    if not slug: continue
    
    # Do not overwrite sourced products
    cur_img = p.get('imageUrl') or ''
    if cur_img.startswith('/products/sourced/') or cur_img.startswith('/uploads/') or cur_img.startswith('/products/nc-'):
        continue

    prim, sec, p_alt, s_alt = resolve_product_dual_images(p)
    p['imageUrl'] = prim
    p['images'] = [
        {"url": prim, "altText": p_alt, "isPrimary": True},
        {"url": sec, "altText": s_alt, "isPrimary": False}
    ]
    updated += 1

    cat = (p.get('category') or '').lower()
    is_rice = (cat == 'rice') or ('rice' in slug) or ('chinigura' in slug) or ('chal' in slug) or ('atap' in slug) or ('miniket' in slug) or ('najirshail' in slug) or ('kalijeera' in slug)
    needs_slug_copy = (
        is_rice or
        ('mustard-oil' in slug) or ('olive-oil' in slug) or ('soybean' in slug) or
        ('anklet' in slug) or ('baby-winter' in slug) or ('10-minute-school' in slug) or
        (cat == 'online-learning')
    )

    if needs_slug_copy:
        if prim.startswith('/products/bd/') and not prim.endswith(f"/{slug}.jpg"):
            src_prim = REPO / 'web/public' / prim.lstrip('/')
            dst_prim = PUBLIC_BD / f"{slug}.jpg"
            if src_prim.exists() and src_prim != dst_prim:
                try:
                    shutil.copyfile(src_prim, dst_prim)
                    slug_copies += 1
                except Exception:
                    pass

        if sec.startswith('/products/bd/') and not sec.endswith(f"/{slug}-open.jpg"):
            src_sec = REPO / 'web/public' / sec.lstrip('/')
            dst_sec = PUBLIC_BD / f"{slug}-open.jpg"
            if src_sec.exists() and src_sec != dst_sec:
                try:
                    shutil.copyfile(src_sec, dst_sec)
                    slug_copies += 1
                except Exception:
                    pass

    if (i + 1) % 1000 == 0:
        print(f"Processed {i + 1}/{len(products)} products...")

with open(PROD_JSON, 'w', encoding='utf-8') as f:
    json.dump(catalogue, f, indent=2, ensure_ascii=False)

print(f"Updated {updated} products in production-catalogue.json")
print(f"Copied {slug_copies} direct slug image assets")
