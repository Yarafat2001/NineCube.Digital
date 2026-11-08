import os
from PIL import Image, ImageDraw, ImageFont

def create_10ms_course_card(title, course_type="Verified Certificate", code="IELTS", is_open=False):
    # 800x800 square
    img = Image.new("RGB", (800, 800), "#0f172a") # dark slate background
    draw = ImageDraw.Draw(img)
    
    if not is_open:
        # PACKET VIEW: Premium EdTech Course Packaging / Box & Certificate
        # Certificate border
        draw.rounded_rectangle([40, 40, 760, 760], radius=24, fill="#1e293b", outline="#334155", width=3)
        draw.rounded_rectangle([60, 60, 740, 740], radius=16, fill="#0f172a", outline="#e11d48", width=2)
        
        # 10MS Header banner
        draw.rounded_rectangle([60, 60, 740, 160], radius=16, fill="#e11d48")
        
        # Draw 10 logo box
        draw.rounded_rectangle([90, 80, 150, 140], radius=8, fill="#ffffff")
        draw.text((105, 90), "10", fill="#e11d48", font_size=36)
        draw.text((170, 88), "10 MINUTE SCHOOL", fill="#ffffff", font_size=28)
        draw.text((170, 122), "Bangladesh's Largest Learning Platform", fill="#fecdd3", font_size=15)
        
        # Certificate Title & Details
        draw.text((100, 210), "PROFESSIONAL MASTERCLASS", fill="#38bdf8", font_size=16)
        
        # Wrap title
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
        
        y = 245
        for line in lines[:3]:
            draw.text((100, y), line, fill="#f8fafc", font_size=32)
            y += 44
            
        # Golden Badge / Verified Seal
        draw.ellipse([600, 200, 700, 300], fill="#f59e0b", outline="#fbbf24", width=3)
        draw.text((615, 235), "VERIFIED", fill="#78350f", font_size=16)
        draw.text((618, 258), "COURSE", fill="#78350f", font_size=14)
        
        # Key Features
        draw.rounded_rectangle([100, 420, 700, 580], radius=12, fill="#1e293b", outline="#334155")
        features = [
            "  40+ Hours HD Video Lessons & Live Mentorship",
            "  Comprehensive Hands-on Projects & Quizzes",
            "  Lifetime Access + Career Placement Support",
            "  Industry Recognised Certificate of Completion"
        ]
        fy = 440
        for f in features:
            draw.text((120, fy), f, fill="#cbd5e1", font_size=17)
            fy += 32
            
        # Footer branding
        draw.line([100, 630, 700, 630], fill="#334155", width=1)
        draw.text((100, 660), "10ms.com / verified", fill="#64748b", font_size=16)
        draw.text((490, 660), "Official Digital Program", fill="#e11d48", font_size=16)
        draw.rounded_rectangle([590, 690, 700, 725], radius=6, fill="#0284c7")
        draw.text((610, 698), "ENROLLED", fill="#ffffff", font_size=14)
        
    else:
        # OPEN VIEW: Interactive Learning Dashboard & Video Player
        draw.rounded_rectangle([40, 40, 760, 760], radius=24, fill="#1e293b", outline="#334155", width=3)
        
        # Browser / App Bar
        draw.rounded_rectangle([40, 40, 760, 100], radius=20, fill="#0f172a")
        draw.ellipse([65, 65, 77, 77], fill="#ef4444")
        draw.ellipse([85, 65, 97, 97], fill="#f59e0b")
        draw.ellipse([105, 65, 117, 117], fill="#10b981")
        draw.rounded_rectangle([140, 58, 620, 84], radius=6, fill="#1e293b")
        draw.text((160, 63), f"10ms.com/live-class/{code.lower()}", fill="#94a3b8", font_size=14)
        
        # Video Player Area (top half)
        draw.rounded_rectangle([70, 120, 730, 470], radius=14, fill="#000000", outline="#e11d48", width=2)
        # Play button in center
        draw.ellipse([360, 255, 440, 335], fill="#e11d48")
        draw.polygon([(390, 275), (390, 315), (425, 295)], fill="#ffffff")
        draw.text((95, 140), f"LIVE BATCH: {title[:32]}", fill="#ffffff", font_size=20)
        draw.text((95, 435), "HD 1080p | Instructor Live | 1,420 Active Students", fill="#94a3b8", font_size=15)
        
        # Bottom Dashboard
        draw.rounded_rectangle([70, 490, 420, 720], radius=12, fill="#0f172a", outline="#334155")
        draw.text((90, 510), "Lesson Modules & Resources", fill="#38bdf8", font_size=18)
        draw.text((90, 550), "Module 1: Orientation & Fundamentals", fill="#f8fafc", font_size=15)
        draw.text((90, 585), "Module 2: Practical Implementation", fill="#f8fafc", font_size=15)
        draw.text((90, 620), "Module 3: Project Architecture & Git", fill="#f8fafc", font_size=15)
        draw.text((90, 655), "Module 4: Exam & Freelance Proposal", fill="#f8fafc", font_size=15)
        
        # Student Progress Widget (right)
        draw.rounded_rectangle([440, 490, 730, 720], radius=12, fill="#0f172a", outline="#334155")
        draw.text((460, 510), "Your Progress", fill="#10b981", font_size=18)
        draw.rounded_rectangle([460, 550, 710, 565], radius=6, fill="#334155")
        draw.rounded_rectangle([460, 550, 650, 565], radius=6, fill="#10b981") # 80%
        draw.text((460, 580), "82% Completed (Certificate Ready)", fill="#94a3b8", font_size=14)
        draw.rounded_rectangle([460, 630, 710, 690], radius=8, fill="#e11d48")
        draw.text((500, 650), "CONTINUE LEARNING", fill="#ffffff", font_size=16)

    return img

os.makedirs('scratch/samples', exist_ok=True)
p1 = create_10ms_course_card("10 Minute School Freelancing Masterclass", is_open=False)
p1.save('scratch/samples/10ms_freelancing_packet.jpg', quality=90)

p2 = create_10ms_course_card("10 Minute School Freelancing Masterclass", is_open=True)
p2.save('scratch/samples/10ms_freelancing_open.jpg', quality=90)

print("Sample 10MS graphics created successfully.")
