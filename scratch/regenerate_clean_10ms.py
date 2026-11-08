import os
import shutil
from PIL import Image, ImageDraw

def create_10ms_course_card(title, course_type="Verified Certificate", code="IELTS", is_open=False):
    img = Image.new("RGB", (800, 800), "#0b132b") # deep elegant navy slate
    draw = ImageDraw.Draw(img)
    
    if not is_open:
        # PACKET / COVER VIEW: Premium EdTech Course Card & Verified Program Packaging
        draw.rounded_rectangle([40, 40, 760, 760], radius=24, fill="#1c2541", outline="#3a506b", width=3)
        draw.rounded_rectangle([60, 60, 740, 740], radius=16, fill="#0b132b", outline="#e11d48", width=2)
        
        # 10MS Top Brand Header
        draw.rounded_rectangle([60, 60, 740, 165], radius=16, fill="#e11d48")
        
        # 10 Brand Pill
        draw.rounded_rectangle([90, 80, 155, 145], radius=10, fill="#ffffff")
        draw.text((105, 90), "10", fill="#e11d48", font_size=38)
        draw.text((175, 88), "10 MINUTE SCHOOL", fill="#ffffff", font_size=28)
        draw.text((175, 124), "Bangladesh's Largest Learning Platform", fill="#ffe4e6", font_size=15)
        
        # Certificate Subtitle
        draw.text((100, 205), "PROFESSIONAL MASTERCLASS PROGRAM", fill="#38bdf8", font_size=15)
        
        # Title
        words = title.split()
        lines = []
        cur = []
        for w in words:
            cur.append(w)
            if len(" ".join(cur)) > 24:
                lines.append(" ".join(cur[:-1]))
                cur = [w]
        if cur:
            lines.append(" ".join(cur))
        
        y = 238
        for line in lines[:3]:
            draw.text((100, y), line, fill="#f8fafc", font_size=32)
            y += 42
            
        # Verified Seal Badge
        draw.ellipse([605, 195, 715, 305], fill="#f59e0b", outline="#fbbf24", width=3)
        draw.text((625, 232), "VERIFIED", fill="#78350f", font_size=16)
        draw.text((630, 255), "COURSE", fill="#78350f", font_size=14)
        
        # Key Features Box
        draw.rounded_rectangle([95, 415, 705, 590], radius=14, fill="#1c2541", outline="#3a506b")
        features = [
            "40+ Hours HD Video Lessons & Live Mentorship",
            "Comprehensive Hands-on Projects & Quizzes",
            "Lifetime Access + Career Placement Support",
            "Industry Recognised Certificate of Completion"
        ]
        fy = 438
        for f in features:
            # Draw a beautiful bullet circle
            draw.ellipse([120, fy + 4, 130, fy + 14], fill="#38bdf8")
            draw.text((145, fy), f, fill="#e2e8f0", font_size=16)
            fy += 34
            
        # Footer Branding
        draw.line([95, 630, 705, 630], fill="#334155", width=1)
        draw.text((100, 660), "10ms.com / verified-credentials", fill="#94a3b8", font_size=16)
        draw.text((490, 660), "Official Digital Program", fill="#e11d48", font_size=16)
        draw.rounded_rectangle([580, 690, 705, 725], radius=6, fill="#0284c7")
        draw.text((605, 698), "ENROLLED", fill="#ffffff", font_size=14)
        
    else:
        # OPEN / INSIDE VIEW: Interactive Learning Dashboard & Live Video Player
        draw.rounded_rectangle([40, 40, 760, 760], radius=24, fill="#1c2541", outline="#3a506b", width=3)
        
        # Browser Chrome Bar
        draw.rounded_rectangle([40, 40, 760, 100], radius=20, fill="#0b132b")
        draw.ellipse([65, 65, 77, 77], fill="#ef4444")
        draw.ellipse([85, 65, 97, 97], fill="#f59e0b")
        draw.ellipse([105, 65, 117, 117], fill="#10b981")
        draw.rounded_rectangle([140, 58, 620, 84], radius=6, fill="#1c2541")
        draw.text((160, 63), f"10ms.com/dashboard/live-batch/{code.lower()}", fill="#94a3b8", font_size=14)
        
        # Live Video Player
        draw.rounded_rectangle([70, 115, 730, 465], radius=14, fill="#000000", outline="#e11d48", width=2)
        # Play Button
        draw.ellipse([360, 250, 440, 330], fill="#e11d48")
        draw.polygon([(390, 270), (390, 310), (425, 290)], fill="#ffffff")
        draw.text((95, 135), f"LIVE CLASS: {title[:32]}", fill="#ffffff", font_size=20)
        draw.text((95, 430), "HD 1080p | Instructor Live | 1,420 Active Students", fill="#94a3b8", font_size=14)
        
        # Lesson Modules
        draw.rounded_rectangle([70, 485, 420, 725], radius=12, fill="#0b132b", outline="#3a506b")
        draw.text((90, 505), "Lesson Modules & Code Resources", fill="#38bdf8", font_size=16)
        draw.text((90, 545), "Module 1: Orientation & Foundations", fill="#f8fafc", font_size=14)
        draw.text((90, 580), "Module 2: Practical Implementation", fill="#f8fafc", font_size=14)
        draw.text((90, 615), "Module 3: Project Architecture & Git", fill="#f8fafc", font_size=14)
        draw.text((90, 650), "Module 4: Exam & Freelance Proposal", fill="#f8fafc", font_size=14)
        
        # Student Progress Widget
        draw.rounded_rectangle([440, 485, 730, 725], radius=12, fill="#0b132b", outline="#3a506b")
        draw.text((460, 505), "Your Progress", fill="#10b981", font_size=16)
        draw.rounded_rectangle([460, 545, 710, 560], radius=6, fill="#334155")
        draw.rounded_rectangle([460, 545, 665, 560], radius=6, fill="#10b981") # 82%
        draw.text((460, 575), "82% Completed (Certificate Ready)", fill="#94a3b8", font_size=13)
        draw.rounded_rectangle([460, 630, 710, 690], radius=8, fill="#e11d48")
        draw.text((505, 650), "CONTINUE LEARNING", fill="#ffffff", font_size=15)

    return img

courses = [
    ("10 Minute School Freelancing Masterclass", "canonical_10ms_freelancing_packet.jpg", "canonical_10ms_freelancing_open.jpg", "freelancing"),
    ("10 Minute School IELTS Preparation Course", "canonical_10ms_ielts_packet.jpg", "canonical_10ms_ielts_open.jpg", "ielts"),
    ("10 Minute School Python Development Live Batch", "canonical_10ms_python_packet.jpg", "canonical_10ms_python_open.jpg", "python"),
    ("10 Minute School Skill Development Program", "canonical_10ms_general_packet.jpg", "canonical_10ms_general_open.jpg", "skill"),
]

bd_dir = 'web/public/products/bd'

for name, pkt_name, opn_name, code in courses:
    pkt_img = create_10ms_course_card(name, code=code, is_open=False)
    pkt_path = os.path.join(bd_dir, pkt_name)
    pkt_img.save(pkt_path, quality=92)
    print(f"Saved {pkt_name} ({os.path.getsize(pkt_path)} bytes)")

    opn_img = create_10ms_course_card(name, code=code, is_open=True)
    opn_path = os.path.join(bd_dir, opn_name)
    opn_img.save(opn_path, quality=92)
    print(f"Saved {opn_name} ({os.path.getsize(opn_path)} bytes)")

# Also copy over slug files
slug_map = {
    '10-minute-school-freelancing-masterclass-certificate-plus.jpg': 'canonical_10ms_freelancing_packet.jpg',
    '10-minute-school-freelancing-masterclass-certificate.jpg': 'canonical_10ms_freelancing_packet.jpg',
    '10-minute-school-ielts-preparation-course-certificate.jpg': 'canonical_10ms_ielts_packet.jpg',
    '10-minute-school-python-development-course-live-batch.jpg': 'canonical_10ms_python_packet.jpg',
    '10-minute-school-spoken-english-course-certificate.jpg': 'canonical_10ms_general_packet.jpg',
    '10-minute-school-spoken-english-course-live-batch.jpg': 'canonical_10ms_general_packet.jpg',
    'interactive-cares-freelancing-masterclass-certificate-pro.jpg': 'canonical_10ms_freelancing_packet.jpg',
    'interactive-cares-freelancing-masterclass-certificate.jpg': 'canonical_10ms_freelancing_packet.jpg',
    'interactive-cares-ielts-preparation-course-self-paced.jpg': 'canonical_10ms_ielts_packet.jpg',
    'interactive-cares-python-development-course-self-paced.jpg': 'canonical_10ms_python_packet.jpg',
    'interactive-cares-spoken-english-course-certificate.jpg': 'canonical_10ms_general_packet.jpg',
    'bohubrihi-ielts-preparation-course-certificate-pro.jpg': 'canonical_10ms_ielts_packet.jpg',
    'bohubrihi-ielts-preparation-course-certificate-starter.jpg': 'canonical_10ms_ielts_packet.jpg',
    'bohubrihi-ielts-preparation-course-certificate.jpg': 'canonical_10ms_ielts_packet.jpg',
    'bohubrihi-python-development-course-certificate.jpg': 'canonical_10ms_python_packet.jpg',
    'bohubrihi-python-development-course-live-batch.jpg': 'canonical_10ms_python_packet.jpg',
}

for slug_f, canon_f in slug_map.items():
    s_path = os.path.join(bd_dir, slug_f)
    c_path = os.path.join(bd_dir, canon_f)
    if os.path.exists(c_path):
        shutil.copyfile(c_path, s_path)

print("All 10MS files regenerated with clean typography and verified bullets.")
