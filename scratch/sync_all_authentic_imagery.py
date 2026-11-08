import json
import os
import re
import sys
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

sys.stdout.reconfigure(line_buffering=True)
print("=== Starting Full Authentic BD Catalog & Imagery Pipeline ===")

catalog_path = r'C:\Users\yeasi\source\repos\NineCube.Digital\data\bd-catalog\bd-catalog.json'
prod_catalogue_path = r'C:\Users\yeasi\source\repos\NineCube.Digital\src\NineCube.Infrastructure\Persistence\production-catalogue.json'
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
        if 0.8 <= w / h <= 1.25:
            side = min(w, h)
            left = (w - side) // 2
            top = (h - side) // 2
            im = im.crop((left, top, left + side, top + side))
        else:
            side = max(w, h)
            square = Image.new('RGB', (side, side), bg_color)
            square.paste(im, ((side - w) // 2, (side - h) // 2))
            im = square
            
        return im.resize((800, 800), Image.Resampling.LANCZOS)
    except Exception as e:
        print(f"Error preparing {im_path}: {e}")
        return None

# Load master images into memory
masters = {}
for fname in os.listdir(master_dir):
    if fname.endswith(('.jpg', '.png')):
        key = os.path.splitext(fname)[0]
        full_path = os.path.join(master_dir, fname)
        sq = prepare_square(full_path)
        if sq:
            masters[key] = sq

# Fallback open textures from photo_cache
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

print(f"Loaded {len(masters)} master textures into memory.")

# Helper to generate branded sack / packet packaging for Bashundhara & others if needed
def create_branded_sack(brand_name, product_name, weight_text, main_color="#15803d", bg_color="#f8fafc"):
    im = Image.new('RGB', (800, 800), bg_color)
    draw = ImageDraw.Draw(im)
    
    # Outer sack / pouch shape
    draw.rounded_rectangle([140, 60, 660, 740], radius=32, fill="#fefce8", outline="#ca8a04", width=3)
    # Stitched top seal
    for x in range(160, 640, 16):
        draw.line([(x, 70), (x + 8, 85)], fill="#a16207", width=2)
    draw.line([(140, 95), (660, 95)], fill="#ca8a04", width=2)
    
    # Brand ribbon
    draw.rounded_rectangle([140, 140, 660, 240], radius=0, fill=main_color)
    draw.text((400, 190), brand_name.upper(), fill="#ffffff", font_size=42, anchor="mm")
    
    # Gold medal / Export seal
    draw.ellipse([540, 280, 630, 370], fill="#f59e0b", outline="#b45309", width=2)
    draw.text((585, 315), "100%", fill="#78350f", font_size=16, anchor="mm")
    draw.text((585, 335), "PREMIUM", fill="#78350f", font_size=12, anchor="mm")
    
    # Product name
    draw.text((400, 330), "AROMATIC", fill="#854d0e", font_size=24, anchor="mm")
    draw.text((400, 380), "CHINIGURA RICE", fill="#1e293b", font_size=34, anchor="mm")
    draw.text((400, 425), "সুগন্ধি চিনিগুঁড়া চাল", fill="#047857", font_size=28, anchor="mm")
    
    # Transparent viewing window with rice grain illustration
    draw.ellipse([270, 470, 530, 610], fill="#ffffff", outline="#e2e8f0", width=2)
    # Rice grains pattern in window
    for rx in range(300, 500, 24):
        for ry in range(495, 585, 18):
            draw.ellipse([rx, ry, rx + 14, ry + 6], fill="#fef08a", outline="#eab308")
            
    # Bottom banner with weight
    draw.rounded_rectangle([200, 645, 600, 705], radius=16, fill="#047857")
    draw.text((400, 675), f"NET WEIGHT: {weight_text.upper()}", fill="#ffffff", font_size=20, anchor="mm")
    
    return im

# Dynamic 10MS graphics
def create_10ms_course(title, is_open=False):
    img = Image.new("RGB", (800, 800), "#0f172a")
    draw = ImageDraw.Draw(img)
    if not is_open:
        # PACKET VIEW
        draw.rounded_rectangle([40, 40, 760, 760], radius=24, fill="#1e293b", outline="#334155", width=3)
        draw.rounded_rectangle([60, 60, 740, 160], radius=16, fill="#e11d48")
        draw.rounded_rectangle([90, 80, 150, 140], radius=8, fill="#ffffff")
        draw.text((120, 110), "10", fill="#e11d48", font_size=36, anchor="mm")
        draw.text((170, 95), "10 MINUTE SCHOOL", fill="#ffffff", font_size=28)
        draw.text((170, 125), "Bangladesh's Largest Learning Platform", fill="#fecdd3", font_size=15)
        
        draw.text((100, 210), "PROFESSIONAL COURSE", fill="#38bdf8", font_size=16)
        words = title.split()
        lines = []
        cur = []
        for w in words:
            cur.append(w)
            if len(" ".join(cur)) > 26:
                lines.append(" ".join(cur[:-1]))
                cur = [w]
        if cur:
            lines.append(" ".join(cur))
        
        y = 250
        for l in lines[:3]:
            draw.text((100, y), l, fill="#f8fafc", font_size=32)
            y += 44
            
        draw.ellipse([600, 200, 700, 300], fill="#f59e0b", outline="#fbbf24", width=3)
        draw.text((650, 240), "VERIFIED", fill="#78350f", font_size=15, anchor="mm")
        draw.text((650, 265), "PROGRAM", fill="#78350f", font_size=13, anchor="mm")
        
        draw.rounded_rectangle([100, 420, 700, 580], radius=12, fill="#0f172a", outline="#334155")
        draw.text((120, 445), "✔ 40+ Hours HD Video Lessons & Live Mentorship", fill="#cbd5e1", font_size=17)
        draw.text((120, 477), "✔ Comprehensive Hands-on Projects & Quizzes", fill="#cbd5e1", font_size=17)
        draw.text((120, 509), "✔ Lifetime Access + Career Placement Support", fill="#cbd5e1", font_size=17)
        draw.text((120, 541), "✔ Industry Recognised Certificate of Completion", fill="#cbd5e1", font_size=17)
        
        draw.line([(100, 630), (700, 630)], fill="#334155", width=1)
        draw.text((100, 660), "10ms.com / verified", fill="#64748b", font_size=16)
        draw.text((490, 660), "Official Digital Program", fill="#e11d48", font_size=16)
    else:
        # OPEN VIEW
        draw.rounded_rectangle([40, 40, 760, 760], radius=24, fill="#1e293b", outline="#334155", width=3)
        draw.rounded_rectangle([40, 40, 760, 100], radius=20, fill="#0f172a")
        draw.ellipse([65, 65, 77, 77], fill="#ef4444")
        draw.ellipse([85, 65, 97, 97], fill="#f59e0b")
        draw.ellipse([105, 65, 117, 117], fill="#10b981")
        draw.rounded_rectangle([140, 58, 620, 84], radius=6, fill="#1e293b")
        draw.text((160, 65), "10ms.com/dashboard/live-batch", fill="#94a3b8", font_size=14)
        
        draw.rounded_rectangle([70, 120, 730, 470], radius=14, fill="#000000", outline="#e11d48", width=2)
        draw.ellipse([360, 255, 440, 335], fill="#e11d48")
        draw.polygon([(390, 275), (390, 315), (425, 295)], fill="#ffffff")
        draw.text((95, 140), f"LIVE CLASS: {title[:32]}", fill="#ffffff", font_size=20)
        draw.text((95, 435), "HD 1080p | Instructor Live | 1,420 Active Students", fill="#94a3b8", font_size=15)
        
        draw.rounded_rectangle([70, 490, 420, 720], radius=12, fill="#0f172a", outline="#334155")
        draw.text((90, 510), "Lesson Modules & Code Resources", fill="#38bdf8", font_size=17)
        draw.text((90, 550), "Module 1: Orientation & Foundations", fill="#f8fafc", font_size=14)
        draw.text((90, 585), "Module 2: Practical Implementation", fill="#f8fafc", font_size=14)
        draw.text((90, 620), "Module 3: Project Architecture & Git", fill="#f8fafc", font_size=14)
        draw.text((90, 655), "Module 4: Exam & Freelance Proposal", fill="#f8fafc", font_size=14)
        
        draw.rounded_rectangle([440, 490, 730, 720], radius=12, fill="#0f172a", outline="#334155")
        draw.text((460, 510), "Your Progress", fill="#10b981", font_size=18)
        draw.rounded_rectangle([460, 550, 710, 565], radius=6, fill="#334155")
        draw.rounded_rectangle([460, 550, 650, 565], radius=6, fill="#10b981")
        draw.text((460, 580), "82% Completed (Certificate Ready)", fill="#94a3b8", font_size=14)
        draw.rounded_rectangle([460, 630, 710, 690], radius=8, fill="#e11d48")
        draw.text((585, 660), "CONTINUE LEARNING", fill="#ffffff", font_size=16, anchor="mm")
    return img

# Load catalog
with open(catalog_path, encoding='utf-8') as f:
    catalog_data = json.load(f)

products = catalog_data['products']
print(f"Loaded {len(products)} products from {catalog_path}")

# Pre-render bashundhara sacks for 10kg, 1kg, 2kg, 5kg
bashundhara_sacks = {
    '10kg': create_branded_sack('Bashundhara', 'Aromatic Chinigura Rice', '10 kg Pack'),
    '5kg': create_branded_sack('Bashundhara', 'Aromatic Chinigura Rice', '5 kg Pack'),
    '2kg': create_branded_sack('Bashundhara', 'Aromatic Chinigura Rice', '2 kg Pack'),
    '1kg': create_branded_sack('Bashundhara', 'Aromatic Chinigura Rice', '1 kg Pack')
}

# Master open textures
rice_open = masters.get('cached_rice', masters.get('basmati_rice_packet'))
oil_mustard_open = masters.get('cached_cooking-oil') # Or poured mustard oil
oil_olive_open = masters.get('cached_olive-oil', masters.get('olive_oil_packet'))
oil_soybean_open = masters.get('cached_cooking-oil')
spice_turmeric_open = masters.get('cached_spices-masala')
spice_chilli_open = masters.get('cached_chilli')
dairy_yogurt_open = masters.get('cached_dairy')
tea_open = masters.get('cached_tea')
snacks_open = masters.get('cached_snacks-sweets')
noodles_open = masters.get('cached_noodles')
saree_open = masters.get('saree_jamdani_open')
panjabi_open = masters.get('panjabi_embroidered_open')
anklet_gold_open = masters.get('anklet_gold_open')
anklet_silver_open = masters.get('anklet_silver_open')
bangles_open = masters.get('bangles_gold_open')

print("Starting asset generation for all 5,300 products...")

updated_count = 0

for p in products:
    slug = p['slug']
    cat = p.get('category', '').lower()
    brand = p.get('brand', '').lower()
    name = p.get('name', '').lower()
    
    packet_img = None
    open_img = None
    
    # 1. ONLINE LEARNING / EDTECH (10 Minute School, Shikho)
    if '10 minute school' in brand or 'shikho' in brand or 'learning' in cat or 'course' in name or 'certificate' in name:
        packet_img = create_10ms_course(p['name'], is_open=False)
        open_img = create_10ms_course(p['name'], is_open=True)
        
    # 2. RICE
    elif 'rice' in cat or 'rice' in name or 'chinigura' in name or 'chal' in name:
        open_img = rice_open
        if 'bashundhara' in brand or 'bashundhara' in name:
            wt = '10kg' if '10kg' in name else '5kg' if '5kg' in name else '2kg' if '2kg' in name else '1kg'
            packet_img = bashundhara_sacks.get(wt, bashundhara_sacks['10kg'])
        elif 'pran' in brand or 'pran' in name:
            packet_img = masters.get('pran_rice_packet')
        elif 'chashi' in brand or 'chashi' in name:
            packet_img = masters.get('chashi_rice_packet')
        elif 'fresh' in brand or 'fresh' in name:
            packet_img = masters.get('fresh_rice_packet')
        elif 'aci' in brand or 'aci' in name:
            packet_img = masters.get('aci_miniket_packet') if 'miniket' in name else masters.get('aci_nazirshail_packet')
        elif 'rupchanda' in brand or 'rupchanda' in name:
            packet_img = masters.get('rupchanda_rice_packet')
        elif 'katarivog' in name or 'katari' in name:
            packet_img = masters.get('katarivog_rice_packet')
        elif 'basmati' in name or 'biryani' in name:
            packet_img = masters.get('basmati_rice_packet')
        elif 'puffed' in name or 'muri' in name:
            packet_img = masters.get('puffed_rice_packet')
        else:
            packet_img = masters.get('chashi_rice_packet')
            
    # 3. COOKING OIL
    elif 'oil' in cat or 'oil' in name:
        if 'olive' in name:
            packet_img = masters.get('olive_oil_packet')
            open_img = oil_olive_open or masters.get('olive_oil_packet')
        elif 'mustard' in name or 'sarisha' in name:
            packet_img = masters.get('radhuni_mustard_packet') if 'radhuni' in brand else masters.get('fresh_mustard_packet')
            open_img = oil_mustard_open or masters.get('radhuni_mustard_packet')
        elif 'sunflower' in name:
            packet_img = masters.get('sunflower_oil_packet')
            open_img = oil_soybean_open
        elif 'rice bran' in name:
            packet_img = masters.get('rice_bran_oil_packet')
            open_img = oil_soybean_open
        else:
            # Soybean oil
            if 'teer' in brand:
                packet_img = masters.get('teer_soybean_packet')
            elif 'rupchanda' in brand:
                packet_img = masters.get('rupchanda_soybean_packet')
            else:
                packet_img = masters.get('fresh_soybean_packet')
            open_img = oil_soybean_open
            
    # 4. SPICES & MASALA
    elif 'spice' in cat or 'masala' in cat or 'powder' in name and any(k in name for k in ['turmeric', 'chili', 'chilli', 'cumin', 'coriander', 'curry']):
        if 'turmeric' in name or 'haldi' in name:
            packet_img = masters.get('radhuni_turmeric_packet')
            open_img = spice_turmeric_open or masters.get('radhuni_turmeric_packet')
        elif 'chili' in name or 'chilli' in name or 'morich' in name:
            packet_img = masters.get('radhuni_chilli_packet')
            open_img = spice_chilli_open or masters.get('radhuni_chilli_packet')
        elif 'cumin' in name or 'jeera' in name:
            packet_img = masters.get('radhuni_cumin_packet')
            open_img = masters.get('radhuni_cumin_packet')
        elif 'coriander' in name or 'dhania' in name:
            packet_img = masters.get('radhuni_coriander_packet')
            open_img = masters.get('radhuni_coriander_packet')
        elif 'biryani' in name:
            packet_img = masters.get('radhuni_biryani_packet')
            open_img = masters.get('radhuni_biryani_packet')
        else:
            packet_img = masters.get('radhuni_garam_masala_packet')
            open_img = masters.get('radhuni_garam_masala_packet')
            
    # 5. DAIRY & GHEE
    elif 'dairy' in cat or any(k in name for k in ['yogurt', 'curd', 'ghee', 'milk', 'doi']):
        if 'sweet' in name or 'mishti' in name or 'curd' in name or 'doi' in name:
            packet_img = masters.get('aarong_sweet_yogurt_packet')
            open_img = dairy_yogurt_open or masters.get('aarong_sweet_yogurt_packet')
        elif 'sour' in name or 'tok' in name:
            packet_img = masters.get('aarong_sour_yogurt_packet')
            open_img = dairy_yogurt_open or masters.get('aarong_sour_yogurt_packet')
        elif 'ghee' in name:
            packet_img = masters.get('aarong_ghee_packet')
            open_img = masters.get('aarong_ghee_packet')
        elif 'liquid' in name or 'uht' in name:
            packet_img = masters.get('aarong_liquid_milk_packet')
            open_img = masters.get('aarong_liquid_milk_packet')
        elif 'powder' in name:
            packet_img = masters.get('dano_powder_milk_packet') if 'dano' in brand else masters.get('marks_milk_powder_packet')
            open_img = masters.get('marks_milk_powder_packet')
        elif 'roshogolla' in name or 'sweet' in name:
            packet_img = masters.get('aarong_roshogolla_packet')
            open_img = masters.get('aarong_roshogolla_packet')
        else:
            packet_img = masters.get('aarong_liquid_milk_packet')
            open_img = masters.get('aarong_liquid_milk_packet')
            
    # 6. TEA & BEVERAGES
    elif 'beverage' in cat or any(k in name for k in ['tea', 'juice', 'cola', 'drink']):
        if 'tea' in name:
            packet_img = masters.get('ispahani_tea_packet') if 'ispahani' in brand else masters.get('taaza_tea_packet')
            open_img = tea_open or masters.get('ispahani_tea_packet')
        elif 'mango' in name or 'frooto' in name:
            packet_img = masters.get('pran_mango_packet')
            open_img = masters.get('pran_mango_packet')
        elif 'litchi' in name:
            packet_img = masters.get('pran_litchi_packet')
            open_img = masters.get('pran_litchi_packet')
        elif 'cola' in name or 'mojo' in name:
            packet_img = masters.get('mojo_cola_packet')
            open_img = masters.get('mojo_cola_packet')
        else:
            packet_img = masters.get('pran_mango_packet')
            open_img = masters.get('pran_mango_packet')
            
    # 7. SNACKS & NOODLES
    elif 'snack' in cat or any(k in name for k in ['chanachur', 'biscuit', 'noodles', 'cookie']):
        if 'chanachur' in name or 'mix' in name:
            packet_img = masters.get('bombay_chanachur_packet')
            open_img = snacks_open or masters.get('bombay_chanachur_packet')
        elif 'biscuit' in name or 'energy' in name:
            packet_img = masters.get('olympic_energy_packet')
            open_img = masters.get('olympic_energy_packet')
        elif 'noodles' in name:
            packet_img = masters.get('maggi_noodles_packet')
            open_img = noodles_open or masters.get('maggi_noodles_packet')
        else:
            packet_img = masters.get('bombay_chanachur_packet')
            open_img = masters.get('bombay_chanachur_packet')
            
    # 8. STAPLES (Atta, Maida, Dal)
    elif 'staple' in cat or any(k in name for k in ['atta', 'flour', 'maida', 'dal', 'lentil']):
        if 'dal' in name or 'lentil' in name:
            packet_img = masters.get('dal_packet')
            open_img = masters.get('dal_packet')
        elif 'atta' in name:
            packet_img = masters.get('atta_packet')
            open_img = masters.get('atta_packet')
        else:
            packet_img = masters.get('maida_packet')
            open_img = masters.get('maida_packet')
            
    # 9. JEWELRY
    elif 'jewelry' in cat or any(k in name for k in ['anklet', 'payel', 'nupur', 'bangle', 'choker', 'necklace']):
        if 'anklet' in name or 'payel' in name or 'nupur' in name:
            if 'silver' in name or 'oxidized' in name:
                packet_img = masters.get('anklet_silver_open')
                open_img = masters.get('anklet_silver_open')
            else:
                packet_img = masters.get('anklet_gold_open')
                open_img = masters.get('anklet_gold_open')
        elif 'bangle' in name or 'churi' in name:
            packet_img = bangles_open or masters.get('cached_fashion-jewelry')
            open_img = bangles_open
        else:
            packet_img = masters.get('cached_fashion-jewelry')
            open_img = masters.get('cached_fashion-jewelry')
            
    # 10. SAREES & APPAREL
    elif 'saree' in cat or 'saree' in name:
        packet_img = masters.get('cached_sarees', masters.get('saree_jamdani_open'))
        open_img = saree_open or packet_img
    elif 'panjabi' in cat or 'panjabi' in name or 'kurta' in name:
        packet_img = masters.get('cached_mens-panjabi', masters.get('panjabi_embroidered_open'))
        open_img = panjabi_open or packet_img
    elif 'kids' in cat or 'baby' in cat or 'winter' in name and 'set' in name:
        packet_img = masters.get('cached_kids-clothing', masters.get('cached_baby-gear'))
        open_img = packet_img
    elif 'smartphone' in cat:
        packet_img = masters.get('cached_smartphones')
        open_img = masters.get('cached_smartphones')
    elif 'laptop' in cat:
        packet_img = masters.get('cached_laptops-computers')
        open_img = masters.get('cached_laptops-computers')
    else:
        # Generic category fallback from cache
        packet_img = masters.get(f"cached_{cat}", masters.get('cached_packaged-food'))
        open_img = packet_img

    if not packet_img:
        packet_img = masters.get('chashi_rice_packet')
    if not open_img:
        open_img = packet_img

    # Save packet view: {slug}.jpg
    packet_path = os.path.join(output_dir, f"{slug}.jpg")
    packet_img.save(packet_path, format="JPEG", quality=86, optimize=True)
    
    # Save open view: {slug}-open.jpg
    open_path = os.path.join(output_dir, f"{slug}-open.jpg")
    open_img.save(open_path, format="JPEG", quality=86, optimize=True)
    
    # Update product metadata
    p['imageUrl'] = f"/products/bd/{slug}.jpg"
    p['images'] = [
        {
            'url': f"/products/bd/{slug}.jpg",
            'altText': f"{p['name']} (Packet View)",
            'isPrimary': True
        },
        {
            'url': f"/products/bd/{slug}-open.jpg",
            'altText': f"{p['name']} (Open View)",
            'isPrimary': False
        }
    ]
    updated_count += 1

print(f"Generated {updated_count * 2} high-res JPEG files (packet + open) for all {updated_count} products!")

# Save catalog
with open(catalog_path, 'w', encoding='utf-8') as f:
    json.dump(catalog_data, f, indent=2, ensure_ascii=False)
print(f"Updated {catalog_path}")

# Update production-catalogue.json
with open(prod_catalogue_path, encoding='utf-8') as f:
    prod_data = json.load(f)

# Update products by slug
slug_map = {p['slug']: p for p in products}
updated_prod = 0
for item in prod_data:
    islug = item.get('slug')
    if islug in slug_map:
        source = slug_map[islug]
        item['imageUrl'] = source['imageUrl']
        item['images'] = source['images']
        updated_prod += 1

with open(prod_catalogue_path, 'w', encoding='utf-8') as f:
    json.dump(prod_data, f, indent=2, ensure_ascii=False)
print(f"Updated {updated_prod} items in {prod_catalogue_path}")

print("=== PIPELINE COMPLETED SUCCESSFULLY ===")
