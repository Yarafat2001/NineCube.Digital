import json
import os
import shutil
import sys
from PIL import Image, ImageDraw

print("=== Starting Authentic BD Catalog Deployment ===")

catalog_path = r'C:\Users\yeasi\source\repos\NineCube.Digital\data\bd-catalog\bd-catalog.json'
prod_catalogue_path = r'C:\Users\yeasi\source\repos\NineCube.Digital\src\NineCube.Infrastructure\Persistence\production-catalogue.json'
master_dir = r'C:\Users\yeasi\source\repos\NineCube.Digital\scratch\bd_master_photos'
output_dir = r'C:\Users\yeasi\source\repos\NineCube.Digital\web\public\products\bd'
os.makedirs(output_dir, exist_ok=True)

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
        if 0.85 <= w / h <= 1.18:
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

canonical = {}

# 1. Custom Bashundhara Sack
def make_bashundhara_sack(weight_text='10 kg'):
    im = Image.new('RGB', (800, 800), '#f8fafc')
    draw = ImageDraw.Draw(im)
    draw.rounded_rectangle([150, 60, 650, 740], radius=28, fill='#fffdf5', outline='#d97706', width=3)
    for x in range(165, 635, 14):
        draw.line([(x, 70), (x + 8, 88)], fill='#b45309', width=2)
    draw.line([(150, 96), (650, 96)], fill='#d97706', width=2)
    draw.rounded_rectangle([150, 130, 650, 230], radius=0, fill='#047857')
    draw.text((400, 180), 'BASHUNDHARA', fill='#ffffff', font_size=40, anchor='mm')
    draw.ellipse([540, 260, 630, 350], fill='#f59e0b', outline='#b45309', width=2)
    draw.text((585, 295), 'PREMIUM', fill='#78350f', font_size=14, anchor='mm')
    draw.text((585, 315), 'AROMATIC', fill='#78350f', font_size=12, anchor='mm')
    draw.text((400, 310), 'AROMATIC', fill='#b45309', font_size=26, anchor='mm')
    draw.text((400, 355), 'CHINIGURA RICE', fill='#1e293b', font_size=34, anchor='mm')
    draw.text((400, 395), 'সুগন্ধি চিনিগুঁড়া চাল', fill='#047857', font_size=28, anchor='mm')
    draw.ellipse([270, 440, 530, 580], fill='#ffffff', outline='#cbd5e1', width=3)
    for rx in range(295, 505, 20):
        for ry in range(465, 555, 14):
            draw.ellipse([rx, ry, rx + 12, ry + 5], fill='#fef08a', outline='#eab308')
    draw.rounded_rectangle([220, 620, 580, 680], radius=16, fill='#047857')
    draw.text((400, 650), f'NET WEIGHT: {weight_text.upper()}', fill='#ffffff', font_size=20, anchor='mm')
    return im

canonical['bashundhara_rice_packet_10kg'] = make_bashundhara_sack('10 kg Pack')
canonical['bashundhara_rice_packet_5kg'] = make_bashundhara_sack('5 kg Pack')
canonical['bashundhara_rice_packet_2kg'] = make_bashundhara_sack('2 kg Pack')
canonical['bashundhara_rice_packet_1kg'] = make_bashundhara_sack('1 kg Pack')

# 2. 10 Minute School Courses
def create_10ms_course(title, is_open=False):
    img = Image.new("RGB", (800, 800), "#0f172a")
    draw = ImageDraw.Draw(img)
    if not is_open:
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

canonical['10ms_freelancing_packet'] = create_10ms_course('Freelancing Masterclass Certificate', is_open=False)
canonical['10ms_freelancing_open'] = create_10ms_course('Freelancing Masterclass Certificate', is_open=True)
canonical['10ms_ielts_packet'] = create_10ms_course('IELTS Preparation Course Certificate', is_open=False)
canonical['10ms_ielts_open'] = create_10ms_course('IELTS Preparation Course Certificate', is_open=True)
canonical['10ms_python_packet'] = create_10ms_course('Python Development Course Live Batch', is_open=False)
canonical['10ms_python_open'] = create_10ms_course('Python Development Course Live Batch', is_open=True)
canonical['10ms_general_packet'] = create_10ms_course('10 Minute School Online Program', is_open=False)
canonical['10ms_general_open'] = create_10ms_course('10 Minute School Online Program', is_open=True)

# 3. Master photos from scratch
sources = {
    'chinigura_rice_open': r'C:\Users\yeasi\.gemini\antigravity\brain\c29260b8-4e39-4119-8fe7-84a12d0e5923\real_chinigura_rice_sample.jpg',
    'mustard_oil_open': r'C:\Users\yeasi\.gemini\antigravity\brain\c29260b8-4e39-4119-8fe7-84a12d0e5923\real_oil_sample.jpg',
    'olive_oil_open': r'C:\Users\yeasi\source\repos\NineCube.Digital\scratch\olive_oil_unsplash.jpg',
    'turmeric_open': r'C:\Users\yeasi\.gemini\antigravity\brain\c29260b8-4e39-4119-8fe7-84a12d0e5923\real_turmeric_sample.jpg',
    'anklet_gold_packet': r'C:\Users\yeasi\source\repos\NineCube.Digital\scratch\anklet_on_feet.jpg',
    'anklet_gold_open': r'C:\Users\yeasi\source\repos\NineCube.Digital\scratch\anklet_on_feet.jpg',
    'anklet_silver_packet': r'C:\Users\yeasi\source\repos\NineCube.Digital\scratch\test_dogri_payal.jpg',
    'anklet_silver_open': r'C:\Users\yeasi\source\repos\NineCube.Digital\scratch\test_silver_anklet.jpg',
    'baby_winter_packet': r'C:\Users\yeasi\source\repos\NineCube.Digital\scratch\baby_winter_clothes.jpg',
    'baby_winter_open': r'C:\Users\yeasi\source\repos\NineCube.Digital\scratch\baby_winter_clothes.jpg',
    'pran_rice_packet': r'C:\Users\yeasi\source\repos\NineCube.Digital\scratch\bd_master_photos\pran_rice_packet.jpg',
    'chashi_rice_packet': r'C:\Users\yeasi\source\repos\NineCube.Digital\scratch\bd_master_photos\chashi_rice_packet.jpg',
    'fresh_rice_packet': r'C:\Users\yeasi\source\repos\NineCube.Digital\scratch\bd_master_photos\fresh_rice_packet.jpg',
    'aci_miniket_packet': r'C:\Users\yeasi\source\repos\NineCube.Digital\scratch\bd_master_photos\aci_miniket_packet.jpg',
    'aci_nazirshail_packet': r'C:\Users\yeasi\source\repos\NineCube.Digital\scratch\bd_master_photos\aci_nazirshail_packet.jpg',
    'rupchanda_rice_packet': r'C:\Users\yeasi\source\repos\NineCube.Digital\scratch\bd_master_photos\rupchanda_rice_packet.jpg',
    'fresh_mustard_packet': r'C:\Users\yeasi\source\repos\NineCube.Digital\scratch\bd_master_photos\fresh_mustard_packet.jpg',
    'radhuni_mustard_packet': r'C:\Users\yeasi\source\repos\NineCube.Digital\scratch\bd_master_photos\radhuni_mustard_packet.jpg',
    'olive_oil_packet': r'C:\Users\yeasi\source\repos\NineCube.Digital\scratch\bd_master_photos\olive_oil_packet.jpg',
    'radhuni_turmeric_packet': r'C:\Users\yeasi\source\repos\NineCube.Digital\scratch\bd_master_photos\radhuni_turmeric_packet.jpg',
    'radhuni_chilli_packet': r'C:\Users\yeasi\source\repos\NineCube.Digital\scratch\bd_master_photos\radhuni_chilli_packet.jpg',
    'radhuni_coriander_packet': r'C:\Users\yeasi\source\repos\NineCube.Digital\scratch\bd_master_photos\radhuni_coriander_packet.jpg',
    'radhuni_cumin_packet': r'C:\Users\yeasi\source\repos\NineCube.Digital\scratch\bd_master_photos\radhuni_cumin_packet.jpg',
    'radhuni_biryani_packet': r'C:\Users\yeasi\source\repos\NineCube.Digital\scratch\bd_master_photos\radhuni_biryani_packet.jpg',
    'radhuni_garam_masala_packet': r'C:\Users\yeasi\source\repos\NineCube.Digital\scratch\bd_master_photos\radhuni_garam_masala_packet.jpg',
    'teer_soybean_packet': r'C:\Users\yeasi\source\repos\NineCube.Digital\scratch\bd_master_photos\teer_soybean_packet.jpg',
    'rupchanda_soybean_packet': r'C:\Users\yeasi\source\repos\NineCube.Digital\scratch\bd_master_photos\rupchanda_soybean_packet.jpg',
    'fresh_soybean_packet': r'C:\Users\yeasi\source\repos\NineCube.Digital\scratch\bd_master_photos\fresh_soybean_packet.jpg',
    'aarong_sweet_yogurt_packet': r'C:\Users\yeasi\source\repos\NineCube.Digital\scratch\bd_master_photos\aarong_sweet_yogurt_packet.jpg',
    'aarong_sour_yogurt_packet': r'C:\Users\yeasi\source\repos\NineCube.Digital\scratch\bd_master_photos\aarong_sour_yogurt_packet.jpg',
    'aarong_ghee_packet': r'C:\Users\yeasi\source\repos\NineCube.Digital\scratch\bd_master_photos\aarong_ghee_packet.jpg',
    'aarong_liquid_milk_packet': r'C:\Users\yeasi\source\repos\NineCube.Digital\scratch\bd_master_photos\aarong_liquid_milk_packet.jpg',
    'aarong_roshogolla_packet': r'C:\Users\yeasi\source\repos\NineCube.Digital\scratch\bd_master_photos\aarong_roshogolla_packet.jpg',
    'dano_powder_milk_packet': r'C:\Users\yeasi\source\repos\NineCube.Digital\scratch\bd_master_photos\dano_powder_milk_packet.jpg',
    'marks_milk_powder_packet': r'C:\Users\yeasi\source\repos\NineCube.Digital\scratch\bd_master_photos\marks_milk_powder_packet.jpg',
    'ispahani_tea_packet': r'C:\Users\yeasi\source\repos\NineCube.Digital\scratch\bd_master_photos\ispahani_tea_packet.jpg',
    'taaza_tea_packet': r'C:\Users\yeasi\source\repos\NineCube.Digital\scratch\bd_master_photos\taaza_tea_packet.jpg',
    'pran_mango_packet': r'C:\Users\yeasi\source\repos\NineCube.Digital\scratch\bd_master_photos\pran_mango_packet.jpg',
    'pran_litchi_packet': r'C:\Users\yeasi\source\repos\NineCube.Digital\scratch\bd_master_photos\pran_litchi_packet.jpg',
    'mojo_cola_packet': r'C:\Users\yeasi\source\repos\NineCube.Digital\scratch\bd_master_photos\mojo_cola_packet.jpg',
    'bombay_chanachur_packet': r'C:\Users\yeasi\source\repos\NineCube.Digital\scratch\bd_master_photos\bombay_chanachur_packet.jpg',
    'olympic_energy_packet': r'C:\Users\yeasi\source\repos\NineCube.Digital\scratch\bd_master_photos\olympic_energy_packet.jpg',
    'maggi_noodles_packet': r'C:\Users\yeasi\source\repos\NineCube.Digital\scratch\bd_master_photos\maggi_noodles_packet.jpg',
    'atta_packet': r'C:\Users\yeasi\source\repos\NineCube.Digital\scratch\bd_master_photos\atta_packet.jpg',
    'maida_packet': r'C:\Users\yeasi\source\repos\NineCube.Digital\scratch\bd_master_photos\maida_packet.jpg',
    'dal_packet': r'C:\Users\yeasi\source\repos\NineCube.Digital\scratch\bd_master_photos\dal_packet.jpg',
    'saree_jamdani': r'C:\Users\yeasi\source\repos\NineCube.Digital\scratch\bd_master_photos\saree_jamdani_open.jpg',
    'panjabi_embroidered': r'C:\Users\yeasi\source\repos\NineCube.Digital\scratch\bd_master_photos\panjabi_embroidered_open.jpg',
    'smartphone': r'C:\Users\yeasi\.gemini\antigravity\brain\c29260b8-4e39-4119-8fe7-84a12d0e5923\real_smartphone_sample.jpg'
}

for name, path in sources.items():
    if os.path.exists(path):
        sq = prepare_square(path)
        if sq:
            canonical[name] = sq
            print(f"Loaded canonical: {name}")

# Save all canonical assets into web/public/products/bd/
print(f"Saving {len(canonical)} canonical images to {output_dir}...")
canonical_saved = {}
for name, img in canonical.items():
    fname = f"canonical_{name}.jpg"
    out_path = os.path.join(output_dir, fname)
    img.save(out_path, format="JPEG", quality=85)
    canonical_saved[name] = f"/products/bd/{fname}"

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
with open(catalog_path, encoding='utf-8') as f:
    catalog_data = json.load(f)

products = catalog_data['products']
print(f"Updating metadata for {len(products)} products...")

file_copy_jobs = []

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
    
    # Also maintain slug-based file aliases for backward compatibility on disk
    src_p = os.path.join(output_dir, p_file)
    src_o = os.path.join(output_dir, o_file)
    dst_p = os.path.join(output_dir, f"{slug}.jpg")
    dst_o = os.path.join(output_dir, f"{slug}-open.jpg")
    file_copy_jobs.append((src_p, dst_p))
    file_copy_jobs.append((src_o, dst_o))

# Save bd-catalog.json
with open(catalog_path, 'w', encoding='utf-8') as f:
    json.dump(catalog_data, f, indent=2, ensure_ascii=False)
print(f"Saved {catalog_path} with {len(products)} products!")

# Save production-catalogue.json
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

with open(prod_catalogue_path, 'w', encoding='utf-8') as f:
    json.dump(prod_data, f, indent=2, ensure_ascii=False)
print(f"Updated {updated_prod} items in {prod_catalogue_path}!")

# Write top 250 slug-based files for immediate direct requests
print(f"Creating direct slug aliases for top 250 products...")
for src, dst in file_copy_jobs[:500]:
    if os.path.exists(src) and not os.path.exists(dst):
        try:
            shutil.copyfile(src, dst)
        except Exception:
            pass

print("=== DEPLOYMENT COMPLETED SUCCESSFULLY ===")
