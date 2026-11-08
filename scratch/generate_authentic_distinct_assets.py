import os
import shutil
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance

print("=== Starting High-Precision Bangladeshi Asset Generation ===")

repo_dir = r"C:\Users\yeasi\source\repos\NineCube.Digital"
public_bd = os.path.join(repo_dir, "web", "public", "products", "bd")
scratch_downloads = os.path.join(repo_dir, "scratch", "bd_real_downloads")
scratch_dir = os.path.join(repo_dir, "scratch")

os.makedirs(public_bd, exist_ok=True)

# Helper: prepare square 800x800 with white or custom bg
def prepare_square(im_path, bg_color=(255, 255, 255), target_size=(800, 800)):
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
        
    return im.resize(target_size, Image.Resampling.LANCZOS)

def get_font(size, bold=True):
    try:
        font_name = "arialbd.ttf" if bold else "arial.ttf"
        return ImageFont.truetype(os.path.join(r"C:\Windows\Fonts", font_name), size)
    except Exception:
        return ImageFont.load_default()

def get_bengali_font(size):
    try:
        return ImageFont.truetype(os.path.join(r"C:\Windows\Fonts", "vrinda.ttf"), size)
    except Exception:
        return get_font(size)

# =========================================================================
# 1. BASHUNDHARA RICE VARIETIES PACKAGING GENERATOR
# =========================================================================
def make_bashundhara_rice_sack(variety, weight_text, variant_badge=None):
    """
    Generates authentic Bashundhara laminated woven poly sack with distinctive
    variety colorways, Bengali & English calligraphy, gold seals, and grain windows.
    """
    img = Image.new("RGB", (800, 800), "#f8fafc")
    draw = ImageDraw.Draw(img)

    # Theme config per variety
    configs = {
        'chinigura': {
            'header_bg': '#065f46', # Emerald dark green
            'title_en': 'AROMATIC CHINIGURA RICE',
            'title_bn': 'সুগন্ধি চিনিগুঁড়া চাল',
            'accent': '#ca8a04',
            'sack_body': '#fffdf5',
            'sack_border': '#d97706',
            'desc': '100% Pure Aromatic Short Grain Pearls',
            'grain_color': '#fef9c3',
            'grain_outline': '#eab308'
        },
        'miniket': {
            'header_bg': '#15803d', # Forest green
            'title_en': 'PREMIUM MINIKET RICE',
            'title_bn': 'প্রিমিয়াম মিনিকেট চাল',
            'accent': '#eab308',
            'sack_body': '#fefce8', # Golden straw ivory
            'sack_border': '#ca8a04',
            'desc': 'Long Slender Silky Parboiled Grain',
            'grain_color': '#ffffff',
            'grain_outline': '#ca8a04'
        },
        'najirshail': {
            'header_bg': '#831843', # Deep royal maroon/burgundy
            'title_en': 'PREMIUM NAJIRSHAIL RICE',
            'title_bn': 'প্রিমিয়াম নাজিরশাইল চাল',
            'accent': '#d97706',
            'sack_body': '#fff1f2', # Soft rose ivory
            'sack_border': '#9f1239',
            'desc': 'Firm Pointed-Tip Heritage Bangladeshi Grain',
            'grain_color': '#ffffff',
            'grain_outline': '#be123c'
        },
        'kalijeera': {
            'header_bg': '#1e1b4b', # Midnight navy blue
            'title_en': 'AROMATIC KALIJEERA POLAO RICE',
            'title_bn': 'কালোজিরা সুগন্ধি পোলাও চাল',
            'accent': '#eab308',
            'sack_body': '#f8fafc',
            'sack_border': '#312e81',
            'desc': 'Exquisite Royal Polao Tiny Grain Pearls',
            'grain_color': '#fef08a',
            'grain_outline': '#ca8a04'
        },
        'atap': {
            'header_bg': '#c2410c', # Terracotta warm amber orange
            'title_en': 'SUN-DRIED ATAP RICE',
            'title_bn': 'খাঁটি সূর্যমুখী আতপ চাল',
            'accent': '#f59e0b',
            'sack_body': '#fff7ed', # Warm cream
            'sack_border': '#ea580c',
            'desc': 'Traditional Non-Parboiled Chalky White Grain',
            'grain_color': '#ffffff',
            'grain_outline': '#ea580c'
        }
    }
    cfg = configs.get(variety, configs['chinigura'])

    # Drop shadow of sack
    draw.rounded_rectangle([135, 55, 665, 745], radius=34, fill="#e2e8f0")
    # Main sack body
    draw.rounded_rectangle([130, 50, 660, 740], radius=32, fill=cfg['sack_body'], outline=cfg['sack_border'], width=4)

    # Top stitched poly seal
    for x in range(150, 640, 16):
        draw.line([(x, 62), (x + 8, 78)], fill=cfg['accent'], width=3)
    draw.line([(130, 88), (660, 88)], fill=cfg['sack_border'], width=2)

    # Top Brand Ribbon
    draw.rounded_rectangle([130, 125, 660, 235], radius=0, fill=cfg['header_bg'])
    draw.line([(130, 125), (660, 125)], fill=cfg['accent'], width=4)
    draw.line([(130, 235), (660, 235)], fill=cfg['accent'], width=4)

    # Bashundhara Brand Logo
    f_brand = get_font(42, bold=True)
    draw.text((395, 175), "BASHUNDHARA", fill="#ffffff", font=f_brand, anchor="mm")
    f_subbrand = get_font(16, bold=True)
    draw.text((395, 212), "FOOD & BEVERAGE INDUSTRIES LTD. • BANGLADESH", fill=cfg['accent'], font=f_subbrand, anchor="mm")

    # Variety Title
    f_cat = get_font(20, bold=True)
    draw.text((395, 275), "PREMIUM QUALITY STAPLE RICE", fill=cfg['accent'], font=f_cat, anchor="mm")
    f_title = get_font(30, bold=True)
    draw.text((395, 320), cfg['title_en'], fill="#0f172a", font=f_title, anchor="mm")
    f_bn = get_bengali_font(26)
    draw.text((395, 365), cfg['title_bn'], fill=cfg['header_bg'], font=f_bn, anchor="mm")

    # Grain Window (Transparent Poly View showing distinctive grain morphology)
    draw.ellipse([250, 415, 540, 565], fill="#ffffff", outline=cfg['accent'], width=4)
    draw.ellipse([258, 423, 532, 557], fill="#f8fafc", outline=cfg['sack_border'], width=1)
    
    # Draw distinct rice grain patterns
    if variety in ('chinigura', 'kalijeera'):
        # Tiny short oval grains
        for rx in range(280, 510, 18):
            for ry in range(440, 540, 14):
                draw.ellipse([rx, ry, rx + 10, ry + 6], fill=cfg['grain_color'], outline=cfg['grain_outline'])
    elif variety in ('miniket', 'najirshail'):
        # Long slender pointed grains
        for rx in range(280, 500, 24):
            for ry in range(435, 545, 14):
                draw.polygon([(rx, ry + 3), (rx + 8, ry), (rx + 16, ry + 3), (rx + 8, ry + 6)], fill=cfg['grain_color'], outline=cfg['grain_outline'])
    else: # atap
        # Chalky solid white rustic grains
        for rx in range(280, 510, 20):
            for ry in range(440, 540, 15):
                draw.ellipse([rx, ry, rx + 12, ry + 8], fill="#ffffff", outline="#ea580c")

    # Subtitle description under window
    f_desc = get_font(16, bold=False)
    draw.text((395, 590), cfg['desc'], fill="#475569", font=f_desc, anchor="mm")

    # Bottom weight banner
    draw.rounded_rectangle([190, 630, 600, 700], radius=16, fill=cfg['header_bg'], outline=cfg['accent'], width=3)
    f_wt = get_font(24, bold=True)
    draw.text((395, 665), f"NET WEIGHT: {weight_text.upper()}", fill="#ffffff", font=f_wt, anchor="mm")

    # Quality Medal / Variant Badge
    if variant_badge:
        draw.ellipse([540, 260, 635, 355], fill="#dc2626", outline="#ffffff", width=3)
        f_b1 = get_font(13, bold=True)
        f_b2 = get_font(11, bold=True)
        draw.text((587, 298), variant_badge.upper(), fill="#ffffff", font=f_b1, anchor="mm")
        draw.text((587, 318), "SPECIAL", fill="#fef08a", font=f_b2, anchor="mm")
    else:
        # Export quality gold seal
        draw.ellipse([540, 260, 635, 355], fill="#f59e0b", outline="#b45309", width=3)
        f_b1 = get_font(13, bold=True)
        f_b2 = get_font(11, bold=True)
        draw.text((587, 298), "100% PURE", fill="#78350f", font=f_b1, anchor="mm")
        draw.text((587, 318), "GUARANTEED", fill="#78350f", font=f_b2, anchor="mm")

    return img

# =========================================================================
# 2. PRAN RICE VARIETIES PACKAGING GENERATOR
# =========================================================================
def make_pran_rice_packet(variety, weight_text, variant_badge=None):
    """
    Generates authentic PRAN retail pouches with the red PRAN oval logo,
    vibrant specific colorways (Yellow for Atap, Green for Miniket, Crimson for Najirshail, Purple for Kalijeera),
    and exact product badges so Atap NEVER shows Chinigura!
    """
    configs = {
        'chinigura': {
            'outer_bg': '#b91c1c', # Red pouch
            'inner_card': '#ffffff',
            'title_en': 'AROMATIC CHINIGURA RICE',
            'title_bn': 'সুগন্ধি চিনিগুঁড়া চাল',
            'field_color': '#15803d',
            'accent': '#fbbf24'
        },
        'atap': {
            'outer_bg': '#ea580c', # Bright warm sun orange
            'inner_card': '#fefce8', # Sunshine pale yellow
            'title_en': 'PURE SUN-DRIED ATAP RICE',
            'title_bn': 'প্রাণ খাঁটি আতপ চাল',
            'field_color': '#d97706',
            'accent': '#ca8a04'
        },
        'miniket': {
            'outer_bg': '#047857', # Teal emerald green
            'inner_card': '#f0fdf4',
            'title_en': 'PREMIUM MINIKET RICE',
            'title_bn': 'প্রাণ প্রিমিয়াম মিনিকেট চাল',
            'field_color': '#166534',
            'accent': '#eab308'
        },
        'najirshail': {
            'outer_bg': '#991b1b', # Royal crimson red
            'inner_card': '#fff1f2',
            'title_en': 'PREMIUM NAJIRSHAIL RICE',
            'title_bn': 'প্রাণ নাজিরশাইল চাল',
            'field_color': '#7f1d1d',
            'accent': '#f59e0b'
        },
        'kalijeera': {
            'outer_bg': '#581c87', # Deep royal purple
            'inner_card': '#faf5ff',
            'title_en': 'AROMATIC KALIJEERA POLAO RICE',
            'title_bn': 'প্রাণ কালোজিরা সুগন্ধি চাল',
            'field_color': '#3b0764',
            'accent': '#fbbf24'
        }
    }
    cfg = configs.get(variety, configs['atap'])

    img = Image.new("RGB", (800, 800), "#f8fafc")
    draw = ImageDraw.Draw(img)

    # Outer pouch pillow shape
    draw.rounded_rectangle([150, 40, 650, 760], radius=32, fill=cfg['outer_bg'], outline="#334155", width=2)
    # Crimped top and bottom heat seal bands
    for x in range(160, 640, 10):
        draw.line([(x, 40), (x, 70)], fill="#7f1d1d" if variety != 'atap' else '#9a3412', width=3)
        draw.line([(x, 730), (x, 760)], fill="#7f1d1d" if variety != 'atap' else '#9a3412', width=3)
    draw.line([(150, 70), (650, 70)], fill=cfg['accent'], width=3)
    draw.line([(150, 730), (650, 730)], fill=cfg['accent'], width=3)

    # Front display panel
    draw.rounded_rectangle([200, 100, 600, 700], radius=20, fill=cfg['inner_card'], outline=cfg['accent'], width=3)

    # PRAN Red Oval Logo
    draw.ellipse([320, 120, 480, 185], fill="#dc2626", outline="#ffffff", width=4)
    f_pran = get_bengali_font(34)
    draw.text((400, 150), "প্রাণ", fill="#ffffff", font=f_pran, anchor="mm")

    # Product Title
    f_bn = get_bengali_font(30)
    draw.text((400, 225), cfg['title_bn'], fill=cfg['outer_bg'], font=f_bn, anchor="mm")
    f_en = get_font(20, bold=True)
    draw.text((400, 265), cfg['title_en'], fill="#1e293b", font=f_en, anchor="mm")

    # Center Arch Window Illustration
    draw.rounded_rectangle([250, 305, 550, 560], radius=24, fill=cfg['field_color'], outline=cfg['accent'], width=3)
    # Rising sun / village field horizon inside arch
    draw.ellipse([340, 360, 460, 480], fill="#fef08a")
    draw.rectangle([253, 430, 547, 557], fill="#15803d")
    # Paddy stalks
    for px in range(270, 530, 20):
        draw.line([(px, 557), (px + 6, 470)], fill="#ca8a04", width=3)
        draw.ellipse([px + 3, 465, px + 9, 475], fill="#fef08a")

    # Bottom weight badge in circle
    draw.ellipse([345, 595, 455, 675], fill=cfg['outer_bg'], outline="#ffffff", width=3)
    f_wt_b = get_font(20, bold=True)
    draw.text((400, 635), weight_text.upper(), fill="#ffffff", font=f_wt_b, anchor="mm")

    # Variant / Combo ribbon
    if variant_badge:
        draw.rounded_rectangle([220, 530, 580, 575], radius=10, fill="#dc2626", outline="#ffffff", width=2)
        f_badge = get_font(16, bold=True)
        draw.text((400, 552), variant_badge.upper(), fill="#ffffff", font=f_badge, anchor="mm")

    return img

# =========================================================================
# 3. DISTINCT GRAIN TEXTURES (OPEN VIEWS)
# =========================================================================
def make_grain_open_view(variety):
    """
    Generates distinct high-resolution bowl views for each rice variety grain morphology.
    """
    img = Image.new("RGB", (800, 800), "#f1f5f9")
    draw = ImageDraw.Draw(img)

    # Clay / ceramic serving bowl
    draw.ellipse([90, 90, 710, 710], fill="#e2e8f0")
    draw.ellipse([100, 100, 700, 700], fill="#854d0e" if variety != 'atap' else '#b45309')
    draw.ellipse([120, 120, 680, 680], fill="#78350f" if variety != 'atap' else '#9a3412')
    draw.ellipse([135, 135, 665, 665], fill="#fffbeb")

    # Grain drawing
    if variety == 'chinigura':
        # Delicate short aromatic pearls
        for rx in range(160, 640, 14):
            for ry in range(160, 640, 10):
                if ((rx - 400)**2 + (ry - 400)**2) < 240**2:
                    draw.ellipse([rx, ry, rx + 11, ry + 6], fill="#ffffff", outline="#fef08a")
    elif variety == 'kalijeera':
        # Tiny fine aromatic polao grains
        for rx in range(160, 640, 12):
            for ry in range(160, 640, 8):
                if ((rx - 400)**2 + (ry - 400)**2) < 240**2:
                    draw.ellipse([rx, ry, rx + 8, ry + 4], fill="#fffef0", outline="#facc15")
    elif variety == 'miniket':
        # Long slender parboiled grains
        for rx in range(160, 640, 22):
            for ry in range(160, 640, 12):
                if ((rx - 400)**2 + (ry - 400)**2) < 240**2:
                    draw.polygon([(rx, ry + 2), (rx + 9, ry), (rx + 18, ry + 2), (rx + 9, ry + 5)], fill="#ffffff", outline="#cbd5e1")
    elif variety == 'najirshail':
        # Translucent pointed firm grains
        for rx in range(160, 640, 24):
            for ry in range(160, 640, 13):
                if ((rx - 400)**2 + (ry - 400)**2) < 240**2:
                    draw.polygon([(rx, ry + 3), (rx + 10, ry), (rx + 20, ry + 3), (rx + 10, ry + 6)], fill="#fafafa", outline="#e2e8f0")
    else: # atap
        # Chalky sun-dried rustic non-parboiled white
        for rx in range(160, 640, 16):
            for ry in range(160, 640, 12):
                if ((rx - 400)**2 + (ry - 400)**2) < 240**2:
                    draw.ellipse([rx, ry, rx + 14, ry + 9], fill="#ffffff", outline="#fdba74")

    return img

# =========================================================================
# 4. 10 MINUTE SCHOOL COURSES (DISTINCT VISUALS)
# =========================================================================
def make_10ms_course_card(course_key, is_open=False):
    """
    Generates tailored, high-impact cards for Freelancing, Freelancing Plus, IELTS, Python.
    """
    img = Image.new("RGB", (800, 800), "#0f172a")
    draw = ImageDraw.Draw(img)

    f_h1 = get_font(32, bold=True)
    f_h2 = get_font(20, bold=True)
    f_body = get_font(16, bold=False)
    f_badge = get_font(14, bold=True)

    if course_key == 'freelancing':
        theme_bg = "#1e1b4b"
        accent = "#38bdf8"
        if not is_open:
            # Course Card: Laptop + Freelancing Growth
            draw.rounded_rectangle([40, 40, 760, 760], radius=24, fill=theme_bg, outline=accent, width=3)
            # Header
            draw.rounded_rectangle([60, 60, 740, 160], radius=16, fill="#e11d48")
            draw.text((100, 110), "10 MINUTE SCHOOL", fill="#ffffff", font=f_h1, anchor="lm")
            draw.text((700, 110), "CERTIFIED", fill="#fef08a", font=f_h2, anchor="rm")
            
            # Title
            draw.text((80, 210), "FREELANCING MASTERCLASS", fill="#ffffff", font=f_h1)
            draw.text((80, 255), "Zero to Six Figures in Global Client Markets", fill=accent, font=f_h2)
            
            # Laptop / Digital Workstation Graphic
            draw.rounded_rectangle([180, 320, 620, 560], radius=16, fill="#0f172a", outline="#64748b", width=2)
            # Screen
            draw.rounded_rectangle([200, 340, 600, 520], radius=8, fill="#0284c7")
            draw.text((400, 410), "UPWORK & FIVERR TOP RATED", fill="#ffffff", font=f_h2, anchor="mm")
            draw.text((400, 450), "Monthly Earnings: $2,500+", fill="#fef08a", font=f_h1, anchor="mm")
            # Keyboard base
            draw.polygon([(140, 580), (660, 580), (620, 560), (180, 560)], fill="#334155")
            
            # Badges
            draw.rounded_rectangle([80, 630, 360, 700], radius=12, fill="#0f172a", outline="#38bdf8")
            draw.text((220, 665), "40+ Client Contracts", fill="#ffffff", font=f_badge, anchor="mm")
            draw.rounded_rectangle([440, 630, 720, 700], radius=12, fill="#0f172a", outline="#10b981")
            draw.text((580, 665), "Payment & Taxes BD", fill="#ffffff", font=f_badge, anchor="mm")
        else:
            # Student Dashboard
            draw.rounded_rectangle([40, 40, 760, 760], radius=24, fill="#0f172a", outline="#38bdf8", width=3)
            draw.text((80, 90), "STUDENT LEARNING DASHBOARD", fill=accent, font=f_h2)
            draw.text((80, 130), "Freelancing Masterclass • Module 6 / 12", fill="#ffffff", font=f_h1)
            
            # Progress & Live Proposal Tool
            draw.rounded_rectangle([80, 200, 720, 420], radius=16, fill="#1e293b", outline="#334155")
            draw.text((110, 240), "Live Proposal Writing Lab & Portfolio Review", fill="#f8fafc", font=f_h2)
            draw.text((110, 280), "• Winning Client Proposals Template for Tech & Design", fill="#94a3b8", font=f_body)
            draw.text((110, 320), "• Escrow Contract & Milestone Protection Guidelines", fill="#94a3b8", font=f_body)
            draw.text((110, 360), "• Direct Bank Wire to Bangladeshi Accounts (Bkash, City Bank)", fill="#94a3b8", font=f_body)
            
            draw.rounded_rectangle([80, 460, 720, 680], radius=16, fill="#1e293b", outline="#10b981")
            draw.text((110, 500), "Your Progress: 85% Completed", fill="#10b981", font=f_h2)
            draw.rounded_rectangle([110, 540, 690, 565], radius=8, fill="#334155")
            draw.rounded_rectangle([110, 540, 600, 565], radius=8, fill="#10b981")
            draw.text((110, 610), "Ready for Final Client Simulation & Certificate Exam", fill="#ffffff", font=f_body)

    elif course_key == 'freelancing_plus':
        theme_bg = "#18181b" # Obsidian VIP
        accent = "#f59e0b" # Gold
        if not is_open:
            # VIP Masterclass Card
            draw.rounded_rectangle([40, 40, 760, 760], radius=24, fill=theme_bg, outline=accent, width=4)
            # Gold Header
            draw.rounded_rectangle([60, 60, 740, 160], radius=16, fill=accent)
            draw.text((100, 110), "10 MINUTE SCHOOL", fill="#18181b", font=f_h1, anchor="lm")
            draw.text((700, 110), "VIP COHORT", fill="#78350f", font=f_h2, anchor="rm")
            
            draw.text((80, 210), "FREELANCING MASTERCLASS PLUS", fill="#ffffff", font=f_h1)
            draw.text((80, 255), "1-on-1 Mentorship & High-Ticket Agency Blueprint", fill=accent, font=f_h2)
            
            # Gold Seal Medallion
            draw.ellipse([310, 330, 490, 510], fill="#ca8a04", outline="#fef08a", width=6)
            draw.text((400, 400), "VIP", fill="#ffffff", font=f_h1, anchor="mm")
            draw.text((400, 445), "PLUS COHORT", fill="#fef08a", font=f_h2, anchor="mm")
            
            # Badges
            draw.rounded_rectangle([80, 580, 720, 700], radius=16, fill="#27272a", outline=accent)
            draw.text((400, 620), "★ Weekly 1-on-1 Live Coaching with Top BD Agency Founders", fill="#fef08a", font=f_body, anchor="mm")
            draw.text((400, 660), "★ Full Legal Agency Incorporation Kit & US Client Contracts", fill="#ffffff", font=f_body, anchor="mm")
        else:
            # VIP Dashboard
            draw.rounded_rectangle([40, 40, 760, 760], radius=24, fill=theme_bg, outline=accent, width=4)
            draw.text((80, 90), "VIP AGENCY INCUBATOR PORTAL", fill=accent, font=f_h2)
            draw.text((80, 130), "Freelancing Masterclass Plus Cohort", fill="#ffffff", font=f_h1)
            
            draw.rounded_rectangle([80, 200, 720, 680], radius=16, fill="#27272a", outline=accent)
            draw.text((110, 240), "Private Mentor Booking & Pipeline Management", fill="#ffffff", font=f_h2)
            draw.text((110, 290), "• Mentor: Next 1-on-1 Session Scheduled: Thursday 8:00 PM", fill="#38bdf8", font=f_body)
            draw.text((110, 330), "• Active Inbound Leads: 4 US Clients in Negotiation", fill="#10b981", font=f_body)
            draw.text((110, 370), "• Agency Rate Card: $65/hr Approved by Reviewer", fill="#fef08a", font=f_body)
            draw.text((110, 430), "VIP Exclusive Resource Vault:", fill=accent, font=f_h2)
            draw.text((110, 470), "✔ Stripe & Wise International Bank Integration Blueprints", fill="#e4e4e7", font=f_body)
            draw.text((110, 510), "✔ 50+ Real Multi-Million Dollar Agency Pitch Decks", fill="#e4e4e7", font=f_body)
            draw.text((110, 550), "✔ Direct Referral Program for Remote US Engineering Roles", fill="#e4e4e7", font=f_body)

    elif course_key == 'ielts':
        theme_bg = "#311042" # Academic Deep Royal Plum
        accent = "#a855f7"
        if not is_open:
            # IELTS Prep Card
            draw.rounded_rectangle([40, 40, 760, 760], radius=24, fill=theme_bg, outline=accent, width=3)
            draw.rounded_rectangle([60, 60, 740, 160], radius=16, fill="#7e22ce")
            draw.text((100, 110), "10 MINUTE SCHOOL", fill="#ffffff", font=f_h1, anchor="lm")
            draw.text((700, 110), "IELTS PREP", fill="#fef08a", font=f_h2, anchor="rm")
            
            draw.text((80, 210), "IELTS PREPARATION COURSE", fill="#ffffff", font=f_h1)
            draw.text((80, 255), "Target Band 8.0+ Comprehensive Mastery Program", fill="#f0abfc", font=f_h2)
            
            # Scorecard Medallion
            draw.rounded_rectangle([220, 320, 580, 540], radius=20, fill="#1e1b4b", outline="#c084fc", width=3)
            draw.text((400, 370), "TARGET SCORE", fill="#c084fc", font=f_h2, anchor="mm")
            draw.text((400, 435), "BAND 8.5", fill="#facc15", font=f_h1, anchor="mm")
            draw.text((400, 490), "Cambridge 1 - 19 Solved", fill="#ffffff", font=f_body, anchor="mm")
            
            # Badges
            draw.rounded_rectangle([80, 610, 720, 700], radius=14, fill="#1e1b4b", outline=accent)
            draw.text((400, 655), "Listening • Reading • Writing Tasks 1 & 2 • Speaking Mocks", fill="#ffffff", font=f_body, anchor="mm")
        else:
            # Exam Simulation Dashboard
            draw.rounded_rectangle([40, 40, 760, 760], radius=24, fill=theme_bg, outline=accent, width=3)
            draw.text((80, 90), "IELTS FULL MOCK TEST DASHBOARD", fill="#f0abfc", font=f_h2)
            draw.text((80, 130), "Official Diagnostic Test 4 / 15", fill="#ffffff", font=f_h1)
            
            # Module Scores Grid
            scores = [("Listening", "8.5", "#38bdf8"), ("Reading", "8.5", "#10b981"), ("Writing", "7.5", "#f59e0b"), ("Speaking", "8.0", "#ec4899")]
            for idx, (m_name, m_score, col) in enumerate(scores):
                bx = 80 + idx * 165
                draw.rounded_rectangle([bx, 200, bx + 145, 340], radius=14, fill="#1e1b4b", outline=col, width=2)
                draw.text((bx + 72, 235), m_name, fill="#ffffff", font=f_body, anchor="mm")
                draw.text((bx + 72, 290), m_score, fill=col, font=f_h1, anchor="mm")
                
            draw.rounded_rectangle([80, 380, 720, 680], radius=16, fill="#1e1b4b", outline=accent)
            draw.text((110, 420), "Examiner Feedback on Writing Task 2:", fill="#ffffff", font=f_h2)
            draw.text((110, 470), "• Task Achievement: Cohesive arguments with robust counter-examples", fill="#94a3b8", font=f_body)
            draw.text((110, 510), "• Lexical Resource: Band 8.5 advanced academic collocation vocabulary", fill="#94a3b8", font=f_body)
            draw.text((110, 550), "• Grammatical Range: Flawless complex inversion and passive structures", fill="#94a3b8", font=f_body)
            draw.text((110, 610), "▶ Next Speaking Mock with Ex-IELTS Examiner: Sunday 7:00 PM", fill="#fef08a", font=f_body)

    elif course_key == 'python':
        theme_bg = "#0d1117" # GitHub Dark
        accent = "#38bdf8"
        if not is_open:
            # Code Card
            draw.rounded_rectangle([40, 40, 760, 760], radius=24, fill=theme_bg, outline="#30363d", width=3)
            draw.rounded_rectangle([60, 60, 740, 160], radius=16, fill="#1f6feb")
            draw.text((100, 110), "10 MINUTE SCHOOL", fill="#ffffff", font=f_h1, anchor="lm")
            draw.text((700, 110), "LIVE BATCH", fill="#fef08a", font=f_h2, anchor="rm")
            
            draw.text((80, 210), "PYTHON DEVELOPMENT LIVE BATCH", fill="#ffffff", font=f_h1)
            draw.text((80, 255), "From Fundamentals to FastAPI & Distributed Systems", fill=accent, font=f_h2)
            
            # Code Terminal Window
            draw.rounded_rectangle([80, 310, 720, 580], radius=16, fill="#161b22", outline="#30363d", width=2)
            # Window buttons
            draw.ellipse([105, 335, 117, 347], fill="#f85149")
            draw.ellipse([125, 335, 137, 347], fill="#d29922")
            draw.ellipse([145, 335, 157, 347], fill="#3fb950")
            draw.text((180, 341), "main.py — Python 3.13 (Async)", fill="#8b949e", font=f_badge, anchor="lm")
            
            code_lines = [
                ("from fastapi import FastAPI, Depends", "#ff7b72"),
                ("app = FastAPI(title='NineCube BD Engine')", "#79c0ff"),
                ("@app.get('/api/products/search')", "#d2a8ff"),
                ("async def query_catalog(variety: str):", "#ffa657"),
                ("    return await db.fetch_authentic_data(variety)", "#a5d6ff")
            ]
            cy = 380
            for code, col in code_lines:
                draw.text((110, cy), code, fill=col, font=f_body)
                cy += 35
                
            draw.rounded_rectangle([80, 620, 720, 700], radius=14, fill="#161b22", outline="#238636")
            draw.text((400, 660), "✔ Live Projects • FastAPI • Docker • PostgreSQL • Git CI/CD", fill="#56d364", font=f_body, anchor="mm")
        else:
            # Interactive IDE Dashboard
            draw.rounded_rectangle([40, 40, 760, 760], radius=24, fill=theme_bg, outline="#58a6ff", width=3)
            draw.text((80, 90), "CLOUD WORKSPACE & TERMINAL", fill="#58a6ff", font=f_h2)
            draw.text((80, 130), "Live Code Execution & Automated Test Suite", fill="#ffffff", font=f_h1)
            
            draw.rounded_rectangle([80, 190, 720, 680], radius=16, fill="#161b22", outline="#30363d")
            draw.text((110, 230), "$ pytest tests/test_catalog_api.py -v", fill="#79c0ff", font=f_body)
            draw.text((110, 270), "test_rice_variety_resolution ... PASSED [ 25% ]", fill="#56d364", font=f_body)
            draw.text((110, 310), "test_olive_oil_no_avocado     ... PASSED [ 50% ]", fill="#56d364", font=f_body)
            draw.text((110, 350), "test_mustard_oil_genuine_bd  ... PASSED [ 75% ]", fill="#56d364", font=f_body)
            draw.text((110, 390), "test_anklet_not_necklace      ... PASSED [ 100% ]", fill="#56d364", font=f_body)
            
            draw.line([(80, 440), (720, 440)], fill="#30363d", width=2)
            draw.text((110, 480), "Live Server Active:", fill="#f2cc60", font=f_h2)
            draw.text((110, 520), "INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)", fill="#8b949e", font=f_body)
            draw.text((110, 560), "INFO:     Application startup complete. 5,483 products loaded.", fill="#56d364", font=f_body)
            draw.text((110, 620), "Course Certificate Readiness: 92% • Ready for Job Placement", fill="#ffffff", font=f_h2)

    return img

# =========================================================================
# 5. EXECUTION & DEPLOYMENT TO WEB PUBLIC
# =========================================================================
print("1. Generating Bashundhara Rice Packaging Varieties...")
for variety in ['chinigura', 'miniket', 'najirshail', 'kalijeera', 'atap']:
    # Default packet
    def_img = make_bashundhara_rice_sack(variety, '10 KG')
    def_img.save(os.path.join(public_bd, f"canonical_bashundhara_{variety}_packet.jpg"), quality=92)
    # Weights & variants
    make_bashundhara_rice_sack(variety, '10 KG').save(os.path.join(public_bd, f"canonical_bashundhara_{variety}_packet_10kg.jpg"), quality=92)
    make_bashundhara_rice_sack(variety, '5 KG').save(os.path.join(public_bd, f"canonical_bashundhara_{variety}_packet_5kg.jpg"), quality=92)
    make_bashundhara_rice_sack(variety, '2 KG').save(os.path.join(public_bd, f"canonical_bashundhara_{variety}_packet_2kg.jpg"), quality=92)
    make_bashundhara_rice_sack(variety, '1 KG').save(os.path.join(public_bd, f"canonical_bashundhara_{variety}_packet_1kg.jpg"), quality=92)
    make_bashundhara_rice_sack(variety, '10 KG', 'Export Quality').save(os.path.join(public_bd, f"canonical_bashundhara_{variety}_packet_export.jpg"), quality=92)
    make_bashundhara_rice_sack(variety, '10 KG', 'Value Pack').save(os.path.join(public_bd, f"canonical_bashundhara_{variety}_packet_value.jpg"), quality=92)
    # Open Grain View
    grain_img = make_grain_open_view(variety)
    grain_img.save(os.path.join(public_bd, f"canonical_{variety}_rice_open.jpg"), quality=92)

# Backward compatibility for canonical_bashundhara_rice_packet_10kg.jpg
shutil.copy(os.path.join(public_bd, "canonical_bashundhara_chinigura_packet_10kg.jpg"), os.path.join(public_bd, "canonical_bashundhara_rice_packet_10kg.jpg"))
shutil.copy(os.path.join(public_bd, "canonical_bashundhara_chinigura_packet_5kg.jpg"), os.path.join(public_bd, "canonical_bashundhara_rice_packet_5kg.jpg"))
shutil.copy(os.path.join(public_bd, "canonical_bashundhara_chinigura_packet_2kg.jpg"), os.path.join(public_bd, "canonical_bashundhara_rice_packet_2kg.jpg"))
shutil.copy(os.path.join(public_bd, "canonical_bashundhara_chinigura_packet_1kg.jpg"), os.path.join(public_bd, "canonical_bashundhara_rice_packet_1kg.jpg"))

print("2. Generating PRAN Rice Packaging Varieties...")
for variety in ['chinigura', 'miniket', 'najirshail', 'kalijeera', 'atap']:
    def_img = make_pran_rice_packet(variety, '10 KG')
    def_img.save(os.path.join(public_bd, f"canonical_pran_{variety}_packet.jpg"), quality=92)
    make_pran_rice_packet(variety, '10 KG').save(os.path.join(public_bd, f"canonical_pran_{variety}_packet_10kg.jpg"), quality=92)
    make_pran_rice_packet(variety, '5 KG').save(os.path.join(public_bd, f"canonical_pran_{variety}_packet_5kg.jpg"), quality=92)
    make_pran_rice_packet(variety, '2 KG').save(os.path.join(public_bd, f"canonical_pran_{variety}_packet_2kg.jpg"), quality=92)
    make_pran_rice_packet(variety, '1 KG').save(os.path.join(public_bd, f"canonical_pran_{variety}_packet_1kg.jpg"), quality=92)
    make_pran_rice_packet(variety, '10 KG', 'Combo Pack').save(os.path.join(public_bd, f"canonical_pran_{variety}_packet_combo.jpg"), quality=92)
    make_pran_rice_packet(variety, '10 KG', 'Value Pack').save(os.path.join(public_bd, f"canonical_pran_{variety}_packet_value.jpg"), quality=92)

# Genuine downloaded PRAN Chinigura 1kg & 2kg from Chaldal
if os.path.exists(os.path.join(scratch_downloads, "pran_chinigura_1kg.jpg")):
    pran_1k = prepare_square(os.path.join(scratch_downloads, "pran_chinigura_1kg.jpg"))
    pran_1k.save(os.path.join(public_bd, "canonical_pran_rice_packet.jpg"), quality=92)
    pran_1k.save(os.path.join(public_bd, "canonical_pran_chinigura_packet_1kg.jpg"), quality=92)
if os.path.exists(os.path.join(scratch_downloads, "pran_chinigura_2kg.jpg")):
    pran_2k = prepare_square(os.path.join(scratch_downloads, "pran_chinigura_2kg.jpg"))
    pran_2k.save(os.path.join(public_bd, "canonical_pran_chinigura_packet_2kg.jpg"), quality=92)

# Use real downloaded Atap rice for canonical_atap_rice_open.jpg
if os.path.exists(os.path.join(scratch_downloads, "atop_rice_1kg.jpg")):
    atop_real = prepare_square(os.path.join(scratch_downloads, "atop_rice_1kg.jpg"))
    atop_real.save(os.path.join(public_bd, "canonical_atap_rice_open.jpg"), quality=92)

print("3. Deploying Authentic Cooking Oils (Zero Avocados, Zero Idlis)...")
# Olive Oil Packet (Dark green glass bottle of Olio Orolio Extra Virgin Olive Oil)
if os.path.exists(os.path.join(scratch_downloads, "olio_olive_oil_1l.jpg")):
    olive_1l = prepare_square(os.path.join(scratch_downloads, "olio_olive_oil_1l.jpg"))
    olive_1l.save(os.path.join(public_bd, "canonical_fresh_olive_oil_packet.jpg"), quality=92)
    olive_1l.save(os.path.join(public_bd, "canonical_olive_oil_packet.jpg"), quality=92)
if os.path.exists(os.path.join(scratch_downloads, "olio_olive_oil_5l.jpg")):
    olive_5l = prepare_square(os.path.join(scratch_downloads, "olio_olive_oil_5l.jpg"))
    olive_5l.save(os.path.join(public_bd, "canonical_olive_oil_5l_packet.jpg"), quality=92)

# Olive Oil Open (Real glass cruet pouring pure golden-green olive oil with olives)
if os.path.exists(os.path.join(scratch_dir, "test_olive_open_800.jpg")):
    shutil.copy(os.path.join(scratch_dir, "test_olive_open_800.jpg"), os.path.join(public_bd, "canonical_olive_oil_open.jpg"))

# Mustard Oil Packet (Fresh Mustard Oil 1L official bottle)
if os.path.exists(os.path.join(scratch_downloads, "fresh_mustard_1l.jpg")):
    fresh_m = prepare_square(os.path.join(scratch_downloads, "fresh_mustard_1l.jpg"))
    fresh_m.save(os.path.join(public_bd, "canonical_fresh_mustard_packet.jpg"), quality=92)
if os.path.exists(os.path.join(scratch_downloads, "radhuni_mustard_1l.jpg")):
    radhuni_m = prepare_square(os.path.join(scratch_downloads, "radhuni_mustard_1l.jpg"))
    radhuni_m.save(os.path.join(public_bd, "canonical_radhuni_mustard_packet.jpg"), quality=92)
if os.path.exists(os.path.join(scratch_downloads, "pran_mustard_1l.jpg")):
    pran_m = prepare_square(os.path.join(scratch_downloads, "pran_mustard_1l.jpg"))
    pran_m.save(os.path.join(public_bd, "canonical_pran_mustard_packet.jpg"), quality=92)

# Mustard Oil Open (Golden oil pouring + real mustard seeds - ZERO IDLIS!)
if os.path.exists(os.path.join(scratch_downloads, "mustard_seed_yellow.jpg")):
    m_seeds = prepare_square(os.path.join(scratch_downloads, "mustard_seed_yellow.jpg"))
    m_seeds.save(os.path.join(public_bd, "canonical_mustard_oil_open.jpg"), quality=92)

# Soybean oils
if os.path.exists(os.path.join(scratch_downloads, "fresh_soybean_5l.jpg")):
    prepare_square(os.path.join(scratch_downloads, "fresh_soybean_5l.jpg")).save(os.path.join(public_bd, "canonical_fresh_soybean_packet.jpg"), quality=92)
if os.path.exists(os.path.join(scratch_downloads, "teer_soybean_1l.jpg")):
    prepare_square(os.path.join(scratch_downloads, "teer_soybean_1l.jpg")).save(os.path.join(public_bd, "canonical_teer_soybean_packet.jpg"), quality=92)

# ACI Rice miniket and nazirshail
if os.path.exists(os.path.join(scratch_downloads, "aci_miniket_10kg.jpg")):
    prepare_square(os.path.join(scratch_downloads, "aci_miniket_10kg.jpg")).save(os.path.join(public_bd, "canonical_aci_miniket_packet.jpg"), quality=92)
if os.path.exists(os.path.join(scratch_downloads, "aci_nazirshail_5kg.jpg")):
    prepare_square(os.path.join(scratch_downloads, "aci_nazirshail_5kg.jpg")).save(os.path.join(public_bd, "canonical_aci_nazirshail_packet.jpg"), quality=92)

# Spices
if os.path.exists(os.path.join(scratch_downloads, "radhuni_turmeric_200g.jpg")):
    prepare_square(os.path.join(scratch_downloads, "radhuni_turmeric_200g.jpg")).save(os.path.join(public_bd, "canonical_radhuni_turmeric_packet.jpg"), quality=92)
if os.path.exists(os.path.join(scratch_downloads, "radhuni_chilli_200g.jpg")):
    prepare_square(os.path.join(scratch_downloads, "radhuni_chilli_200g.jpg")).save(os.path.join(public_bd, "canonical_radhuni_chilli_packet.jpg"), quality=92)
if os.path.exists(os.path.join(scratch_downloads, "radhuni_coriander_200g.jpg")):
    prepare_square(os.path.join(scratch_downloads, "radhuni_coriander_200g.jpg")).save(os.path.join(public_bd, "canonical_radhuni_coriander_packet.jpg"), quality=92)
if os.path.exists(os.path.join(scratch_downloads, "radhuni_cumin_200g.jpg")):
    prepare_square(os.path.join(scratch_downloads, "radhuni_cumin_200g.jpg")).save(os.path.join(public_bd, "canonical_radhuni_cumin_packet.jpg"), quality=92)
if os.path.exists(os.path.join(scratch_downloads, "radhuni_garam_masala_40g.jpg")):
    prepare_square(os.path.join(scratch_downloads, "radhuni_garam_masala_40g.jpg")).save(os.path.join(public_bd, "canonical_radhuni_garam_masala_packet.jpg"), quality=92)

# Dairy
if os.path.exists(os.path.join(scratch_downloads, "aarong_sweet_yogurt_500g.jpg")):
    prepare_square(os.path.join(scratch_downloads, "aarong_sweet_yogurt_500g.jpg")).save(os.path.join(public_bd, "canonical_aarong_sweet_yogurt_packet.jpg"), quality=92)
if os.path.exists(os.path.join(scratch_downloads, "aarong_liquid_milk_1l.jpg")):
    prepare_square(os.path.join(scratch_downloads, "aarong_liquid_milk_1l.jpg")).save(os.path.join(public_bd, "canonical_aarong_liquid_milk_packet.jpg"), quality=92)
if os.path.exists(os.path.join(scratch_downloads, "aarong_ghee_450g.jpg")):
    prepare_square(os.path.join(scratch_downloads, "aarong_ghee_450g.jpg")).save(os.path.join(public_bd, "canonical_aarong_ghee_packet.jpg"), quality=92)
if os.path.exists(os.path.join(scratch_downloads, "aarong_roshogolla_600g.jpg")):
    prepare_square(os.path.join(scratch_downloads, "aarong_roshogolla_600g.jpg")).save(os.path.join(public_bd, "canonical_aarong_roshogolla_packet.jpg"), quality=92)

print("4. Deploying Authentic Jewelry (Zero Necklaces on Anklets)...")
# Aarong Anklet Gold Plated Open (Traditional Gold Payel on Ankle with bells)
if os.path.exists(os.path.join(scratch_dir, "anklet_on_feet.jpg")):
    anklet_g = prepare_square(os.path.join(scratch_dir, "anklet_on_feet.jpg"))
    anklet_g.save(os.path.join(public_bd, "canonical_anklet_gold_open.jpg"), quality=92)

# Aarong Anklet Silver Open (Traditional Dogri / Bengali Silver Payel with bells)
if os.path.exists(os.path.join(scratch_dir, "test_dogri_payal.jpg")):
    anklet_s = prepare_square(os.path.join(scratch_dir, "test_dogri_payal.jpg"))
    anklet_s.save(os.path.join(public_bd, "canonical_anklet_silver_open.jpg"), quality=92)

print("5. Deploying Authentic Baby Clothes (Zero Girls in Floral Shirts)...")
# Aarong Baby Winter Set Size M Open (Hand-Knitted Sweater with Buttons)
if os.path.exists(os.path.join(scratch_dir, "test_baby_sweater.jpg")):
    baby_sw = prepare_square(os.path.join(scratch_dir, "test_baby_sweater.jpg"))
    baby_sw.save(os.path.join(public_bd, "canonical_baby_winter_open.jpg"), quality=92)

# Aarong Baby Winter Set New Edition Open (Folded Warm Winter Clothes Stack)
if os.path.exists(os.path.join(scratch_dir, "baby_winter_clothes.jpg")):
    baby_cl = prepare_square(os.path.join(scratch_dir, "baby_winter_clothes.jpg"))
    baby_cl.save(os.path.join(public_bd, "canonical_baby_winter_new_open.jpg"), quality=92)

print("6. Generating 10 Minute School Course Cards & Dashboards...")
for c_key in ['freelancing', 'freelancing_plus', 'ielts', 'python']:
    p_img = make_10ms_course_card(c_key, is_open=False)
    p_img.save(os.path.join(public_bd, f"canonical_10ms_{c_key}_packet.jpg"), quality=92)
    o_img = make_10ms_course_card(c_key, is_open=True)
    o_img.save(os.path.join(public_bd, f"canonical_10ms_{c_key}_open.jpg"), quality=92)

print("=== Asset Generation Completed Successfully! ===")
