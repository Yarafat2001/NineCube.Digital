import os
import shutil

repo_root = r"C:\Users\yeasi\source\repos\NineCube.Digital"
bd_dir = os.path.join(repo_root, "web", "public", "products", "bd")

# Define canonical source files
canonical_map = {
    'bashundhara_10kg': os.path.join(bd_dir, 'canonical_bashundhara_rice_packet_10kg.jpg'),
    'bashundhara_5kg': os.path.join(bd_dir, 'canonical_bashundhara_rice_packet_5kg.jpg'),
    'bashundhara_2kg': os.path.join(bd_dir, 'canonical_bashundhara_rice_packet_2kg.jpg'),
    'bashundhara_1kg': os.path.join(bd_dir, 'canonical_bashundhara_rice_packet_1kg.jpg'),
    'pran_rice': os.path.join(bd_dir, 'canonical_pran_rice_packet.jpg'),
    'chashi_rice': os.path.join(bd_dir, 'canonical_chashi_rice_packet.jpg'),
    'fresh_rice': os.path.join(bd_dir, 'canonical_fresh_rice_packet.jpg'),
    'rupchanda_rice': os.path.join(bd_dir, 'canonical_rupchanda_rice_packet.jpg'),
    'aci_miniket': os.path.join(bd_dir, 'canonical_aci_miniket_packet.jpg'),
    'aci_nazirshail': os.path.join(bd_dir, 'canonical_aci_nazirshail_packet.jpg'),
    'rice_open': os.path.join(bd_dir, 'canonical_chinigura_rice_open.jpg'),

    'fresh_mustard': os.path.join(bd_dir, 'canonical_fresh_mustard_packet.jpg'),
    'radhuni_mustard': os.path.join(bd_dir, 'canonical_radhuni_mustard_packet.jpg'),
    'mustard_open': os.path.join(bd_dir, 'canonical_mustard_oil_open.jpg'),

    'olive_packet': os.path.join(bd_dir, 'canonical_olive_oil_packet.jpg'),
    'olive_open': os.path.join(bd_dir, 'canonical_olive_oil_open.jpg'),

    'anklet_gold_packet': os.path.join(bd_dir, 'canonical_anklet_gold_packet.jpg'),
    'anklet_gold_open': os.path.join(bd_dir, 'canonical_anklet_gold_open.jpg'),
    'anklet_silver_packet': os.path.join(bd_dir, 'canonical_anklet_silver_packet.jpg'),
    'anklet_silver_open': os.path.join(bd_dir, 'canonical_anklet_silver_open.jpg'),

    'baby_winter_packet': os.path.join(bd_dir, 'canonical_baby_winter_packet.jpg'),
    'baby_winter_open': os.path.join(bd_dir, 'canonical_baby_winter_open.jpg'),

    '10ms_freelancing_packet': os.path.join(bd_dir, 'canonical_10ms_freelancing_packet.jpg'),
    '10ms_freelancing_open': os.path.join(bd_dir, 'canonical_10ms_freelancing_open.jpg'),
    '10ms_ielts_packet': os.path.join(bd_dir, 'canonical_10ms_ielts_packet.jpg'),
    '10ms_ielts_open': os.path.join(bd_dir, 'canonical_10ms_ielts_open.jpg'),
    '10ms_python_packet': os.path.join(bd_dir, 'canonical_10ms_python_packet.jpg'),
    '10ms_python_open': os.path.join(bd_dir, 'canonical_10ms_python_open.jpg'),
    '10ms_general_packet': os.path.join(bd_dir, 'canonical_10ms_general_packet.jpg'),
    '10ms_general_open': os.path.join(bd_dir, 'canonical_10ms_general_open.jpg'),
}

# Verify all canonical sources exist and are valid (> 1000 bytes)
for k, path in canonical_map.items():
    if not os.path.exists(path) or os.path.getsize(path) < 1000:
        raise ValueError(f"Canonical file missing or invalid: {k} at {path}")

updated_count = 0

for filename in os.listdir(bd_dir):
    f_lower = filename.lower()
    dest = os.path.join(bd_dir, filename)

    # Skip the canonical files themselves
    if f_lower.startswith('canonical_'):
        continue

    source_key = None

    # 1. 10 Minute School / Online courses
    if '10-minute-school' in f_lower or 'interactive-cares' in f_lower or 'bohubrihi' in f_lower:
        is_open = '-open' in f_lower
        if 'freelancing' in f_lower:
            source_key = '10ms_freelancing_open' if is_open else '10ms_freelancing_packet'
        elif 'ielts' in f_lower:
            source_key = '10ms_ielts_open' if is_open else '10ms_ielts_packet'
        elif 'python' in f_lower:
            source_key = '10ms_python_open' if is_open else '10ms_python_packet'
        else:
            source_key = '10ms_general_open' if is_open else '10ms_general_packet'

    # 2. Anklets
    elif 'anklet' in f_lower or 'nupur' in f_lower or 'payel' in f_lower:
        is_open = '-open' in f_lower
        is_silver = 'silver' in f_lower
        if is_silver:
            source_key = 'anklet_silver_open' if is_open else 'anklet_silver_packet'
        else:
            source_key = 'anklet_gold_open' if is_open else 'anklet_gold_packet'

    # 3. Baby winter sets
    elif 'baby-winter' in f_lower or ('winter-set' in f_lower and 'baby' in f_lower):
        is_open = '-open' in f_lower
        source_key = 'baby_winter_open' if is_open else 'baby_winter_packet'

    # 4. Mustard oil
    elif 'mustard-oil' in f_lower:
        is_open = '-open' in f_lower
        if is_open:
            source_key = 'mustard_open'
        elif 'fresh' in f_lower:
            source_key = 'fresh_mustard'
        else:
            source_key = 'radhuni_mustard'

    # 5. Olive oil
    elif 'olive-oil' in f_lower:
        is_open = '-open' in f_lower
        source_key = 'olive_open' if is_open else 'olive_packet'

    # 6. Rice staples
    elif 'chinigura' in f_lower or 'kalijeera' in f_lower or 'najirshail' in f_lower or 'miniket' in f_lower or 'atap' in f_lower or ('rice' in f_lower and any(b in f_lower for b in ['bashundhara', 'pran', 'chashi', 'fresh', 'rupchanda', 'aci'])):
        is_open = '-open' in f_lower
        if is_open:
            source_key = 'rice_open'
        elif 'bashundhara' in f_lower:
            if '10kg' in f_lower:
                source_key = 'bashundhara_10kg'
            elif '5kg' in f_lower:
                source_key = 'bashundhara_5kg'
            elif '2kg' in f_lower:
                source_key = 'bashundhara_2kg'
            else:
                source_key = 'bashundhara_1kg'
        elif 'pran' in f_lower:
            source_key = 'pran_rice'
        elif 'chashi' in f_lower:
            source_key = 'chashi_rice'
        elif 'fresh' in f_lower:
            source_key = 'fresh_rice'
        elif 'miniket' in f_lower:
            source_key = 'aci_miniket'
        elif 'nazirshail' in f_lower or 'najirshail' in f_lower:
            source_key = 'aci_nazirshail'
        else:
            source_key = 'rupchanda_rice'

    if source_key:
        src = canonical_map[source_key]
        shutil.copyfile(src, dest)
        updated_count += 1

print(f"Updated {updated_count} slug image files in {bd_dir} with authentic canonical assets.")
