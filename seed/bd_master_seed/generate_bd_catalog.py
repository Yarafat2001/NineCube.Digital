"""Bangladesh master seed catalog generator — NineCube.Digital.

Generates a deterministic, system-aligned product catalog:
  - 106 categories (built from seed/required_categories.csv) as a 16-root tree
  - >= TARGET products across all product leaves, BDT pricing
  - Importer-compatible output: matches ProductionCatalogImporter.Feed fields
    plus unitCost / compareAtPrice / brand / imageUrl extensions.

Outputs (relative to repo root):
  data/bd-catalog/bd-catalog.json   full dataset
  data/bd-catalog/report.json       generation + validation summary

Run:  python seed/bd_master_seed/generate_bd_catalog.py
"""

from __future__ import annotations

import hashlib
import json
import random
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
CATEGORIES_CSV = REPO / "seed" / "required_categories.csv"
OUT_DIR = REPO / "data" / "bd-catalog"

TARGET_PRODUCTS = 5300
TITLE_MAX = 60
DESC_MAX = 280

# --------------------------------------------------------------------------
# Taxonomy: 16 roots (depth 1). Children map to parent slugs below.
# --------------------------------------------------------------------------
ROOTS = [
    "grocery-food", "fashion-apparel", "electronics", "home-appliances",
    "beauty-personal-care", "health-wellness", "baby-care", "sports-outdoors",
    "pet-supplies", "books-stationery", "tools-hardware", "toys-games",
    "digital-products", "garden-outdoor", "gold-silver-jewelry", "uncategorized",
]

PARENT_OF = {
    # grocery
    "staples": "grocery-food", "rice": "grocery-food", "cooking-oil": "grocery-food",
    "packaged-food": "grocery-food", "spices-masala": "grocery-food",
    "dairy": "grocery-food", "snacks-sweets": "grocery-food",
    "fresh-frozen": "grocery-food", "beverages": "grocery-food",
    "honey-dates": "grocery-food",
    # baby
    "baby-gear": "baby-care", "baby-food": "baby-care",
    # pets
    "cat-food": "pet-supplies", "dog-food": "pet-supplies",
    "pet-accessories": "pet-supplies",
    # fashion
    "mens-clothing": "fashion-apparel", "womens-clothing": "fashion-apparel",
    "kids-clothing": "fashion-apparel", "footwear": "fashion-apparel",
    "bags-luggage": "fashion-apparel", "watches": "fashion-apparel",
    "sunglasses": "fashion-apparel", "fashion-jewelry": "fashion-apparel",
    "traditional-festive": "fashion-apparel",
    "mens-shirts": "mens-clothing", "mens-panjabi": "mens-clothing",
    "mens-jeans-pants": "mens-clothing",
    "sarees": "womens-clothing", "three-piece-kurti": "womens-clothing",
    # sports
    "cricket": "sports-outdoors", "football": "sports-outdoors",
    "badminton": "sports-outdoors", "cycling": "sports-outdoors",
    "fitness-equipment": "sports-outdoors", "sportswear": "sports-outdoors",
    # electronics
    "smartphones": "mobile-phones", "feature-phones": "mobile-phones",
    "mobile-phones": "electronics", "laptops-computers": "electronics",
    "tablets": "electronics", "tvs-displays": "electronics",
    "audio": "electronics", "bluetooth-speakers": "electronics",
    "earbuds-headphones": "electronics", "cameras-cctv": "electronics",
    "wearables": "electronics", "electronics-accessories": "electronics",
    "power-banks-chargers": "electronics-accessories",
    # home
    "refrigerators": "home-appliances", "air-conditioners": "home-appliances",
    "fans-heaters": "home-appliances", "kitchenware": "home-appliances",
    "decor-lighting": "home-appliances", "bedding-linen": "home-appliances",
    "home-furniture": "home-appliances", "furniture": "home-furniture",
    # beauty / health
    "makeup": "beauty-personal-care", "skincare": "beauty-personal-care",
    "haircare": "beauty-personal-care", "grooming": "beauty-personal-care",
    "fragrance-attar": "beauty-personal-care", "soap-body-care": "beauty-personal-care",
    "personal-hygiene": "beauty-personal-care",
    "medical-devices": "health-wellness", "supplements": "health-wellness",
    # stationery
    "books": "books-stationery", "stationery": "books-stationery",
    "school-items": "books-stationery", "office-supplies": "books-stationery",
    "exam-prep": "books-stationery",
    # digital
    "software": "digital-products", "streaming": "digital-products",
    "online-learning": "digital-products", "mobile-topup-data": "digital-products",
    "gift-cards": "digital-products", "freelancing-services": "digital-products",
    # tools / automotive
    "hand-tools": "tools-hardware", "power-tools": "tools-hardware",
    "garden-tools": "tools-hardware", "electrical": "tools-hardware",
    "batteries": "tools-hardware", "paint-plumbing": "tools-hardware",
    "automotive": "tools-hardware",
    "spare-parts": "automotive", "tires": "automotive",
    "lubricants": "automotive", "motorcycle-accessories": "automotive",
    # toys
    "toys-kids-baby": "toys-games",
    # garden
    "plants": "garden-outdoor", "seeds-fertilizer": "garden-outdoor",
    # jewelry
    "jewelry-accessories": "gold-silver-jewelry",
}

# Slugs that carry no direct products (structure only).
STRUCTURAL = set(ROOTS) | {
    "mens-clothing", "womens-clothing", "mobile-phones",
    "electronics-accessories", "home-furniture", "automotive",
}

# --------------------------------------------------------------------------
# Category display names
# --------------------------------------------------------------------------
AND_SLUGS = {
    "earbuds-headphones": "Earbuds & Headphones",
    "books-stationery": "Books & Stationery",
    "paint-plumbing": "Paint & Plumbing",
    "mens-jeans-pants": "Mens Jeans & Pants",
    "honey-dates": "Honey & Dates",
    "seeds-fertilizer": "Seeds & Fertilizer",
    "toys-kids-baby": "Toys, Kids & Baby",
    "gold-silver-jewelry": "Gold & Silver Jewelry",
    "jewelry-accessories": "Jewelry & Accessories",
    "fans-heaters": "Fans & Heaters",
    "power-banks-chargers": "Power Banks & Chargers",
    "soap-body-care": "Soap & Body Care",
    "tvs-displays": "TVs & Displays",
    "snacks-sweets": "Snacks & Sweets",
    "spices-masala": "Spices & Masala",
    "cat-food": "Cat Food", "dog-food": "Dog Food",
    "air-conditioners": "Air Conditioners",
    "home-appliances": "Home Appliances",
    "baby-care": "Baby Care", "pet-supplies": "Pet Supplies",
    "sports-outdoors": "Sports & Outdoors",
    "beauty-personal-care": "Beauty & Personal Care",
    "health-wellness": "Health & Wellness",
    "digital-products": "Digital Products",
    "garden-outdoor": "Garden & Outdoor",
    "tools-hardware": "Tools & Hardware",
    "grocery-food": "Grocery & Food",
    "fashion-apparel": "Fashion & Apparel",
    "uncategorized": "Uncategorized",
    "fashion-jewelry": "Fashion Jewelry",
    "three-piece-kurti": "Three Piece Kurti",
    "exam-prep": "Exam Preparation",
    "online-learning": "Online Learning",
    "fresh-frozen": "Fresh & Frozen",
    "mens-clothing": "Mens Clothing", "womens-clothing": "Womens Clothing",
    "kids-clothing": "Kids Clothing",
}


def display_name(slug: str) -> str:
    if slug in AND_SLUGS:
        return AND_SLUGS[slug]
    return " ".join(w.capitalize() for w in slug.split("-"))


# --------------------------------------------------------------------------
# Root descriptions and default price bands (min, max, tier1, tier2) in BDT
# --------------------------------------------------------------------------
ROOT_BLURB = {
    "grocery-food": "everyday grocery staple sourced for Bangladeshi kitchens",
    "fashion-apparel": "quality apparel from trusted Bangladeshi brand houses",
    "electronics": "genuine electronics suited to Bangladeshi retailers and homes",
    "home-appliances": "reliable home appliances and furnishings for BD households",
    "beauty-personal-care": "authentic beauty and personal care for the BD market",
    "health-wellness": "health and wellness essentials for BD families",
    "baby-care": "gentle baby care products curated for Bangladeshi parents",
    "sports-outdoors": "sports and outdoor gear for the BD active lifestyle",
    "pet-supplies": "quality pet supplies for BD pet households",
    "books-stationery": "books, notes and study aids for BD learners",
    "tools-hardware": "dependable tools and hardware for BD trades and homes",
    "toys-games": "fun and safe toys for BD families",
    "digital-products": "instant digital products and services for BD users",
    "garden-outdoor": "gardening and outdoor selections for BD homes",
    "gold-silver-jewelry": "jewelry and accessories for BD celebrations",
    "uncategorized": "assorted item awaiting catalog classification",
}

ROOT_PRICE = {
    "grocery-food": (10, 3000, 150, 500),
    "fashion-apparel": (300, 15000, 1200, 3500),
    "electronics": (200, 150000, 5000, 25000),
    "home-appliances": (500, 80000, 8000, 25000),
    "beauty-personal-care": (50, 3000, 300, 1000),
    "health-wellness": (50, 15000, 800, 3000),
    "baby-care": (100, 12000, 1000, 4000),
    "sports-outdoors": (100, 20000, 1500, 5000),
    "pet-supplies": (100, 5000, 500, 1500),
    "books-stationery": (20, 2500, 200, 800),
    "tools-hardware": (80, 9000, 900, 3000),
    "toys-games": (80, 6000, 800, 2500),
    "digital-products": (100, 60000, 1500, 5000),
    "garden-outdoor": (30, 5000, 300, 1200),
    "gold-silver-jewelry": (3000, 250000, 15000, 60000),
    "uncategorized": (5, 5000, 100, 500),
}

PRICE = {  # leaf overrides aligned with seed/clean/price-policy.json
    "smartphones": (6000, 250000, 20000, 60000),
    "laptops-computers": (30000, 350000, 60000, 120000),
    "refrigerators": (12000, 160000, 35000, 80000),
    "tvs-displays": (10000, 200000, 30000, 90000),
    "air-conditioners": (28000, 95000, 45000, 70000),
    "tablets": (15000, 120000, 30000, 65000),
    "feature-phones": (1200, 3500, 2000, 2800),
    "wearables": (1500, 40000, 5000, 15000),
    "cameras-cctv": (1200, 150000, 4000, 25000),
    "rice": (100, 3000, 600, 1200),
    "cooking-oil": (150, 5000, 800, 2000),
    "sarees": (1000, 25000, 3500, 9000),
    "mens-panjabi": (800, 10000, 2000, 5000),
    "mens-shirts": (500, 6000, 1200, 2500),
    "three-piece-kurti": (900, 12000, 2200, 5500),
    "footwear": (150, 15000, 1200, 3500),
    "bags-luggage": (200, 12000, 1500, 4000),
    "makeup": (50, 3000, 300, 1000),
    "skincare": (60, 5000, 400, 1600),
    "watches": (300, 30000, 1500, 8000),
    "sunglasses": (250, 8000, 900, 2500),
    "fans-heaters": (200, 6000, 1200, 3000),
    "kitchenware": (200, 8000, 1200, 3500),
    "furniture": (1000, 100000, 8000, 25000),
    "bedding-linen": (300, 9000, 1200, 3500),
    "decor-lighting": (80, 12000, 600, 2500),
    "tires": (2000, 22000, 6000, 14000),
    "lubricants": (300, 2200, 700, 1400),
    "spare-parts": (150, 8000, 600, 2500),
    "motorcycle-accessories": (300, 12000, 1200, 4500),
    "motorcycle-accessories": (300, 12000, 1200, 4500),
    "batteries": (900, 20000, 3000, 9000),
    "electrical": (30, 6000, 300, 1200),
    "hand-tools": (80, 6000, 700, 2400),
    "power-tools": (1200, 32000, 4000, 12000),
    "garden-tools": (80, 5000, 700, 2200),
    "paint-plumbing": (200, 8000, 1200, 3000),
    "cricket": (150, 18000, 2000, 6000),
    "cycling": (3500, 45000, 8000, 18000),
    "fitness-equipment": (150, 60000, 5000, 15000),
    "badminton": (150, 9000, 1000, 3500),
    "football": (150, 8000, 900, 3000),
    "sportswear": (250, 9000, 1200, 3500),
    "supplements": (300, 9000, 1200, 3500),
    "medical-devices": (250, 25000, 1200, 5000),
    "books": (60, 1500, 300, 700),
    "exam-prep": (120, 900, 350, 550),
    "stationery": (20, 500, 80, 200),
    "school-items": (20, 1500, 150, 500),
    "office-supplies": (30, 2500, 200, 700),
    "online-learning": (500, 30000, 3000, 10000),
    "software": (300, 80000, 5000, 25000),
    "streaming": (100, 3000, 300, 1000),
    "mobile-topup-data": (20, 2000, 100, 500),
    "gift-cards": (200, 5000, 500, 2000),
    "freelancing-services": (1000, 60000, 8000, 25000),
    "plants": (60, 2000, 200, 700),
    "seeds-fertilizer": (30, 2500, 150, 600),
    "jewelry-accessories": (100, 6000, 700, 2200),
    "pet-accessories": (80, 6000, 500, 1800),
    "cat-food": (150, 4500, 400, 1200),
    "dog-food": (200, 5500, 450, 1400),
    "baby-food": (60, 3500, 300, 1100),
    "baby-gear": (300, 35000, 2500, 9000),
    "toys-kids-baby": (80, 9000, 800, 2800),
    "traditional-festive": (200, 20000, 1500, 5000),
}

# --------------------------------------------------------------------------
# Leaf brand pools (real Bangladesh-market brands; pseudo-brands marked Local)
# --------------------------------------------------------------------------
LEAF_BRANDS = {
    "smartphones": ["Samsung", "Xiaomi", "Walton", "Symphony", "realme", "Oppo", "Vivo", "iTel", "Tecno", "Apple"],
    "feature-phones": ["Symphony", "Walton", "Nokia", "iTel"],
    "laptops-computers": ["Apple", "Dell", "HP", "Lenovo", "ASUS", "Acer", "MSI", "Walton"],
    "tablets": ["Samsung", "Apple", "Lenovo", "Walton"],
    "tvs-displays": ["Walton", "Vision", "Singer", "Konka", "Samsung", "Sony"],
    "audio": ["F&D", "Microlab", "Walton", "Havit"],
    "bluetooth-speakers": ["Xiaomi", "Anker", "Havit", "JBL"],
    "earbuds-headphones": ["Xiaomi", "Anker", "Havit", "JBL", "realme"],
    "cameras-cctv": ["Hikvision", "Dahua", "Imou", "Canon", "Nikon", "EZVIZ"],
    "wearables": ["Samsung", "Xiaomi", "Amazfit", "Huawei"],
    "power-banks-chargers": ["Anker", "Xiaomi", "Baseus", "Havit"],
    "electronics-accessories": ["TP-Link", "Logitech", "Havit", "Baseus"],
    "refrigerators": ["Walton", "Vision", "Singer", "Konka", "Haier", "Hisense"],
    "air-conditioners": ["Walton", "Vision", "Singer", "Gree", "Haier", "Samsung"],
    "fans-heaters": ["Walton", "Vision", "Singer", "Minister"],
    "kitchenware": ["Walton", "Kiam", "Miyako", "Philips", "Singer"],
    "decor-lighting": ["Philips", "Walton", "Havells"],
    "bedding-linen": ["Aarong", "Aranya", "Westecs"],
    "furniture": ["Hatil", "Otobi", "Regency", "RFL"],
    "garden-outdoor": ["Green Home Nursery", "Bonayan BD"],
    "garden-tools": ["Stanley", "Generic"],
    "plants": ["Green Home Nursery", "Bonayan BD", "Generic"],
    "seeds-fertilizer": ["Lal Teer", "Generic"],
    "rice": ["Bashundhara", "Pran"],
    "cooking-oil": ["Rupchanda", "Teer", "Fresh", "Radhuni", "White Sister"],
    "packaged-food": ["Pran", "Olympic", "Danish", "Nestle", "Cadbury", "Bombay Sweets"],
    "spices-masala": ["Radhuni", "ACI Pure", "Fresh", "Pran"],
    "dairy": ["Pran", "Milk Vita", "Aarong Dairy", "Farm Fresh", "Diploma"],
    "snacks-sweets": ["Pran", "Olympic", "Danish", "Bombay Sweets"],
    "fresh-frozen": ["Pran", "Paragon", "Iceland"],
    "beverages": ["Pran", "Mojo", "Coca-Cola", "Fresh", "Ispahani", "Akij"],
    "honey-dates": ["Sundarban Honey", "Pran"],
    "staples": ["ACI Pure", "Pran", "Bashundhara", "Teer"],
    "baby-food": ["Nestle", "Pran"],
    "baby-gear": ["Chicco", "Fisher-Price", "BabyJoy BD"],
    "cat-food": ["Whiskas", "Drools", "Me-O"],
    "dog-food": ["Drools", "Pedigree", "Me-O"],
    "pet-accessories": ["PetZone BD", "PetPro BD"],
    "mens-shirts": ["Aarong", "Sailor", "Westecs", "Easy", "Ecstasy", "Yellow"],
    "mens-panjabi": ["Aarong", "Sailor", "Aranya", "Westecs"],
    "mens-jeans-pants": ["Sailor", "Easy", "Ecstasy", "Yellow"],
    "sarees": ["Aarong", "Aranya", "Tangail Weavers"],
    "three-piece-kurti": ["Aarong", "Sailor", "Aranya", "Westecs"],
    "kids-clothing": ["Aarong", "Sailor", "Yellow", "Kids Kingdom"],
    "footwear": ["Bata", "Apex", "Bay", "Aarong"],
    "bags-luggage": ["Aarong", "Apex", "Companion BD"],
    "watches": ["Casio", "Fastrack", "Westar", "Sonata"],
    "sunglasses": ["Ray-Ban", "Fastrack"],
    "fashion-jewelry": ["Aarong", "Alankar BD"],
    "traditional-festive": ["Aarong", "Prabartana", "Aranya"],
    "makeup": ["Maybelline", "Lakme", "LOreal Paris"],
    "skincare": ["Skin Cafe", "Cetaphil", "Neutrogena", "Garnier"],
    "haircare": ["Dove", "Sunsilk", "Dabur Vatika", "Himalaya"],
    "grooming": ["Gillette", "Kai", "Kemei"],
    "fragrance-attar": ["Al-Nuaim", "Ajmal", "Swiss Arabian"],
    "soap-body-care": ["Savlon", "Meril", "Lux", "Tibet"],
    "personal-hygiene": ["Dettol", "Savlon", "Whisper", "Sofy"],
    "medical-devices": ["Omron", "Accu-Chek", "Beurer", "Rossmax"],
    "supplements": ["GNC", "Protinex", "NeutraLife"],
    "cricket": ["SG", "MB Malik", "Gray-Nicolls"],
    "football": ["Adidas", "Puma", "Nivia"],
    "badminton": ["Yonex", "Apacs", "Li-Ning"],
    "cycling": ["Phinix", "Hercules", "Giant", "Avon"],
    "fitness-equipment": ["Domyos", "FitnessHub BD"],
    "sportswear": ["Adidas", "Puma", "Nivia"],
    "books": ["Prothoma", "UPL", "Ananda", "Panjeree"],
    "stationery": ["Matador", "Linc", "Regal"],
    "school-items": ["Matador", "Regal", "Classmate"],
    "office-supplies": ["Regal", "Classmate", "One Paper"],
    "exam-prep": ["Panjeree", "Odyssey", "Prothoma"],
    "software": ["NineCube Digital", "DataSoft", "TigerIT"],
    "streaming": ["toffee", "Bioscope"],
    "online-learning": ["10 Minute School", "Bohubrihi", "Interactive Cares"],
    "mobile-topup-data": ["Robi", "Grameenphone", "Banglalink", "Teletalk"],
    "gift-cards": ["Aarong", "Rokomari", "NineCube Digital"],
    "freelancing-services": ["NineCube Digital", "ByteWorks BD"],
    "hand-tools": ["Stanley", "Bosch", "Taparia", "Generic"],
    "power-tools": ["Bosch", "Makita", "DCA", "Stanley"],
    "electrical": ["BRB", "RFL", "Walton"],
    "batteries": ["Hamko", "Runner", "Walton", "Volta"],
    "paint-plumbing": ["Berger", "Asian Paints", "RFL"],
    "spare-parts": ["AutoParts BD", "Generic"],
    "tires": ["Bridgestone", "Apollo", "RoadKing BD"],
    "lubricants": ["Mobil", "Castrol", "Veedol"],
    "motorcycle-accessories": ["Bajaj", "TVS", "Vega"],
    "toys-kids-baby": ["Fisher-Price", "LEGO", "BabyJoy BD"],
    "gold-silver-jewelry": [],
    "jewelry-accessories": ["Amin Jewellers", "Sundarban Gold"],
}

# Brand-specific model names (avoids impossible brand+model pairings).
BRAND_KINDS = {
    ("smartphones", "Apple"): ["iPhone 13", "iPhone 14", "iPhone 15"],
    ("smartphones", "Samsung"): ["Galaxy A05", "Galaxy A15", "Galaxy A24", "Galaxy M14", "Galaxy S23"],
    ("smartphones", "Xiaomi"): ["Redmi 13C", "Redmi Note 13", "Redmi 12", "Redmi A2"],
    ("smartphones", "realme"): ["C53", "C55", "Narzo N53"],
    ("smartphones", "Oppo"): ["A18", "A58"],
    ("smartphones", "Vivo"): ["Y17s", "Y27"],
    ("smartphones", "Symphony"): ["G22", "Helio 90", "R40"],
    ("smartphones", "Walton"): ["Olvia S20", "Xanon X21"],
    ("smartphones", "iTel"): ["A70", "P40"],
    ("smartphones", "Tecno"): ["Spark 20", "Pop 8"],
    ("feature-phones", "Symphony"): ["L24", "L16"],
    ("feature-phones", "Walton"): ["Olvio L22"],
    ("feature-phones", "Nokia"): ["105", "106", "110"],
    ("feature-phones", "iTel"): ["it5607", "it5615"],
    ("laptops-computers", "Apple"): ["MacBook Air M1", "MacBook Air M2", "MacBook Pro 14"],
    ("laptops-computers", "Dell"): ["Inspiron 15", "Vostro 15", "XPS 13", "Latitude 3520"],
    ("laptops-computers", "HP"): ["Pavilion 15", "ProBook 450", "Victus 15"],
    ("laptops-computers", "Lenovo"): ["IdeaPad Slim 3", "IdeaPad Slim 5", "ThinkPad E14", "LOQ 15"],
    ("laptops-computers", "ASUS"): ["Vivobook 15", "TUF Gaming A15"],
    ("laptops-computers", "Acer"): ["Aspire 5", "Nitro 5"],
    ("laptops-computers", "MSI"): ["Modern 14", "Katana GF63"],
    ("laptops-computers", "Walton"): ["Prel T1100", "Tamarind TX5800"],
    ("tablets", "Apple"): ["iPad 9", "iPad Air"],
    ("tablets", "Samsung"): ["Galaxy Tab A9", "Galaxy Tab S6 Lite"],
    ("tablets", "Lenovo"): ["Tab M10"],
    ("tablets", "Walton"): ["T970"],
}

LEAF_KINDS = {
    "smartphones": ["(chipset-tier model)"],  # replaced by BRAND_KINDS + RAM spec
    "air-conditioners": (["Split AC", "Window AC", "Inverter Split AC"], ["1 Ton", "1.5 Ton", "2 Ton"]),
    "audio": (["2.1 Multimedia Speaker", "Bluetooth Tower Speaker", "Soundbar", "Bookshelf Speaker"], ["80W", "120W", "40W"]),
    "batteries": (["Car Battery", "Motorcycle Battery", "UPS Battery", "Tubular Inverter Battery"], ["12V 70Ah", "12V 100Ah", "12V 9Ah"]),
    "bedding-linen": (["Bed Sheet Set", "Quilt Cover", "Pillow Cover Set", "Summer Comforter"], ["Queen Size", "King Size", "Double"]),
    "beverages": (["Mango Fruit Drink", "Tea Bag", "Instant Coffee", "Soft Drink", "Litchi Juice", "Green Tea"], ["250ml", "500ml", "1L", "Pack of 12", "Pack of 20"]),
    "bluetooth-speakers": (["Portable Speaker", "Party Speaker", "Mini Speaker"], ["5W", "10W", "3000mAh", "IPX7"]),
    "books": (["Novel", "Poetry Collection", "History of Bangladesh", "Children's Story Book", "Translated Title"], ["Hardcover", "Paperback", "Bengali", "English"]),
    "cameras-cctv": (["Dome Camera", "Bullet Camera", "Wi-Fi CCTV Kit", "DSLR Camera", "Action Camera"], ["1080p", "2MP", "4MP", "Full HD"]),
    "cat-food": (["Dry Cat Food", "Adult Cat Food", "Cat Treats", "Ocean Fish Cat Food"], ["1.2kg", "400g", "70g"]),
    "dog-food": (["Dry Dog Food", "Adult Dog Food", "Puppy Food", "Dog Treats"], ["1.2kg", "3kg", "400g"]),
    "cooking-oil": (["Soybean Oil", "Mustard Oil", "Palm Oil", "Extra Virgin Olive Oil"], ["1L", "2L", "5L", "500ml"]),
    "cricket": (["Cricket Bat", "Season Ball", "Training Bat", "Batting Helmet", "Batting Gloves"], ["Kashmir Willow", "English Willow", "Size 5"]),
    "cycling": (["Mountain Bike", "Commuter Bicycle", "Gear Cycle", "Kids Bicycle"], ["26 Inch", "20 Inch", "21 Speed"]),
    "dairy": (["Full Cream Milk Powder", "Liquid UHT Milk", "Sweet Yogurt", "Butter", "Cheese Slices"], ["500g", "1kg", "1L", "200g"]),
    "decor-lighting": (["Pendant Light", "LED Strip Light", "Wall Sconce", "Chandelier", "Smart Bulb"], ["Warm White", "RGB", "E27"]),
    "electrical": (["MCB Breaker", "Electric Cable 1/18", "Switch Socket", "Distribution Board", "Ceiling Rose"], ["10A", "100 Yard", "13A"]),
    "exam-prep": (["HSC Guide", "SSC Model Test Book", "Admission Preparation Pack", "BCS Preliminary Guide"], ["2027 Edition", "Bengali Medium"]),
    "fans-heaters": (["Ceiling Fan", "Pedestal Fan", "Rechargeable Fan", "Room Heater", "Standing Fan"], ["56 Inch", "1500W", "3 Blade"]),
    "fashion-jewelry": (["Choker Set", "Jhumka Earrings", "Bangles Set", "Anklet"], ["Gold Plated", "Oxidized Silver", "Artificial"]),
    "fitness-equipment": (["Treadmill", "Yoga Mat", "Dumbbell Set", "Exercise Bike", "Skipping Rope"], ["5kg x 2", "6mm", "Manual"]),
    "football": (["Match Ball", "Football Ball", "Shin Guard", "Goalkeeper Gloves"], ["Size 5", "Machine Stitched"]),
    "footwear": (["Canvas Sneaker", "Leather Formal Shoe", "School Shoe", "Sandal", "Sports Shoe"], ["Size 40", "Size 42", "EU 41"]),
    "fragrance-attar": (["Attar Concentrate", "Eau de Parfum", "Roll-On Attar", "Body Spray"], ["6ml", "12ml", "100ml"]),
    "freelancing-services": (["Gig Setup Consultation", "Portfolio Website Package", "Digital Marketing Retainer"], ["Basic", "Standard", "Premium"]),
    "fresh-frozen": (["Whole Ilish Fish", "Frozen Broiler Chicken", "Frozen Green Peas", "Beef Boneless", "Frozen Shrimp Medium"], ["500g", "1kg", "Per Kg"]),
    "furniture": (["Dining Table Set", "Office Chair", "Bookshelf", "Wardrobe", "TV Unit"], ["With Chairs", "Solid Wood", "6-Feet"]),
    "garden-tools": (["Garden Trowel", "Pruning Shears", "Knapsack Sprayer", "Garden Rake"], ["Stainless", "8L"]),
    "gift-cards": (["BDT 500 Gift Card", "BDT 1000 Gift Card", "BDT 2000 Gift Card", "BDT 5000 Gift Card"], []),
    "grooming": (["Beard Oil", "Hair Trimmer", "Shaving Foam", "Nail Clipper Set"], ["50ml", "Cordless"]),
    "haircare": (["Hair Fall Shampoo", "Amla Hair Oil", "Anti-Dandruff Shampoo", "Hair Serum"], ["400ml", "220ml", "No Paraben"]),
    "hand-tools": (["Adjustable Wrench", "Claw Hammer", "Screwdriver Set", "Measuring Tape", "Pliers"], ["8 Inch", "5m", "12-Piece"]),
    "honey-dates": (["Sundarban Wild Honey", "Ajwa Dates Premium", "Black Seed Honey"], ["500g", "250g", "1kg"]),
    "jewelry-accessories": (["Jewelry Box", "Ring Organizer", "Necklace Display Stand", "Pearl Beads Set"], ["Velvet", "Faux Pearl", "Gold Plated"]),
    "kids-clothing": (["Baby Winter Set", "Boys T-Shirt", "Girls Frock", "Kids Hoodie"], ["Size M", "Size L", "Age 5-6"]),
    "kitchenware": (["Chef Knife", "Non-Stick Fry Pan", "Pressure Cooker", "Mixing Bowl Set", "Rice Cooker"], ["3-Litre", "24cm", "Induction Base", "1.8L"]),
    "lubricants": (["Engine Oil 20W-50", "Gear Oil", "Transmission Fluid", "Brake Fluid"], ["1L", "3L", "4L"]),
    "makeup": (["Matte Lipstick", "Foundation", "Kajal Pencil", "Eyeshadow Palette", "Compact Powder"], ["Shade 05", "SPF 15", "Waterproof"]),
    "medical-devices": (["Digital Blood Pressure Monitor", "Glucometer Kit", "Digital Thermometer", "Nebulizer", "Pulse Oximeter"], ["Digital", "Universal"]),
    "mens-jeans-pants": (["Slim Fit Jeans", "Regular Fit Jeans", "Chino Pant", "Cargo Pant"], ["Size 30", "Size 32", "Size 34"]),
    "mens-panjabi": (["Cotton Panjabi", "Eid Panjabi", "Karchupi Panjabi", "Embroidered Panjabi"], ["Size M", "Size L", "Size XL"]),
    "mens-shirts": (["Formal Shirt", "Casual Shirt", "Checked Shirt", "Oxford Shirt"], ["Size M", "Size L", "Size XL"]),
    "mobile-topup-data": (["Prepaid Talktime Topup", "Mobile Data Recharge", "Family Plan Recharge"], ["BDT 100", "BDT 299", "GB Pack"]),
    "motorcycle-accessories": (["Motorcycle Helmet", "Riding Gloves", "LED Indicator Set", "Phone Holder Mount"], ["Half Face", "Anti-UV", "Universal"]),
    "office-supplies": (["Binder Clip Set", "Whiteboard Marker", "Desk Organizer", "Office Paper Ream", "Heavy Duty Stapler"], ["A4", "80 GSM", "24 Clips"]),
    "online-learning": (["Python Development Course", "IELTS Preparation Course", "Freelancing Masterclass", "Spoken English Course"], ["Self-Paced", "Live Batch", "Certificate"]),
    "packaged-food": (["Instant Noodles", "Chocolate Wafer", "Biscuit Family Pack", "Fruit Cake", "Custard Powder", "Tomato Ketchup"], ["5-Pack", "Family Pack", "500g"]),
    "paint-plumbing": (["Emulsion Paint", "Plastic Paint", "Weather Coat", "PVC Pipe", "Bathroom Fitting Set"], ["1 Gallon", "5L", "Classic White"]),
    "personal-hygiene": (["Hand Sanitizer", "Sanitary Pads Pack", "Baby Wipes", "Antiseptic Liquid", "Toilet Tissue"], ["250ml", "10-Pad", "Alcohol Free"]),
    "pet-accessories": (["Cat Litter Tray", "Pet Shampoo", "Grooming Brush", "Dog Collar"], ["Medium", "Anti-Tick", "Universal"]),
    "plants": (["Money Plant", "Tulsi Sapling", "Aloe Vera Plant", "Areca Palm"], ["Terracotta Pot", "Indoor", "Sapling"]),
    "power-banks-chargers": (["10000mAh Power Bank", "20000mAh Power Bank", "20W Fast Charger", "Braided USB-C Cable", "Wireless Charging Pad"], ["Type-C", "Digital Display", "1m"]),
    "power-tools": (["Drill Machine", "Angle Grinder", "Impact Wrench", "Jig Saw"], ["650W", "850W", "13mm Chuck"]),
    "refrigerators": (["Direct Cool Fridge", "Frost Free Refrigerator", "Mini Fridge", "No Frost Top Mount Refrigerator"], ["118L", "164L", "Single Door"]),
    "rice": (["Aromatic Chinigura Rice", "Miniket Rice", "Najirshail Rice", "Kalijeera Rice", "Atap Rice"], ["1kg", "2kg", "5kg", "10kg"]),
    "sarees": (["Jamdani Saree", "Half Silk Saree", "Tussar Silk Saree", "Cotton Tangail Saree"], ["Half Silk", "With Blouse Piece"]),
    "school-items": (["Geometry Box", "Glue Stick Class Pack", "Student Diary", "School Bag Backpack", "Water Bottle"], ["14-Piece", "1L", "BPA Free"]),
    "seeds-fertilizer": (["Mustard Seed Packet", "Papaya Seed Packet", "Neem Cake Fertilizer", "Urea Fertilizer Bag"], ["25kg", "10g Packet"]),
    "skincare": (["Vitamin C Serum", "Sunscreen SPF 50", "Hydrating Face Wash", "Night Repair Cream", "Body Lotion"], ["30ml", "50ml", "For Oily Skin"]),
    "snacks-sweets": (["Chanachur Mix", "Roshogolla Tin", "Tamarind Candy", "Laddoo Pack"], ["400g", "Can of 12", "500g"]),
    "soap-body-care": (["Antibacterial Soap", "Bathing Bar Pack", "Body Wash Gel", "Talcum Powder"], ["100g x 4", "250ml"]),
    "software": (["Point-of-Sale Software License", "Accounting Software Subscription", "Website Builder Annual Plan", "Antivirus 1-Device License"], ["1 Year", "Perpetual", "2 Seats"]),
    "spare-parts": (["Brake Pads", "Clutch Plate Set", "Air Filter", "Spark Plug", "Headlight Assembly"], ["For 100cc", "Universal"]),
    "spices-masala": (["Turmeric Powder", "Chili Powder", "Coriander Powder", "Panch Phoron Mix", "Cumin Powder"], ["100g", "250g", "500g"]),
    "sportswear": (["Training Jersey", "Track Pant", "Gym Shorts", "Compression Sleeve"], ["Size M", "Size L", "Dry Fit"]),
    "staples": (["Red Lentil Dal", "Wheat Flour Atta", "Chickpea", "Vermicelli Bundle"], ["500g", "1kg", "2kg"]),
    "stationery": (["A4 Notebook 200 Pages", "Ballpoint Pen", "Gel Pen Pack", "Highlighter Set"], ["20-Pack", "Blue Ink", "Single Line"]),
    "streaming": (["Premium Plan Subscription", "Sports Plan Subscription", "Kids Plan Subscription"], ["1 Month", "3 Months", "1 Year"]),
    "sunglasses": (["Aviator Sunglasses", "Polarized Sunglasses", "Round UV400 Sunglasses"], ["UV400", "Foldable"]),
    "supplements": (["Whey Protein Powder", "Vitamin D3 Tablets", "Omega-3 Fish Oil", "Daily Multivitamin", "Calcium Tablet"], ["60 Tablets", "30 Servings"]),
    "tablets": (["Wi-Fi Tablet", "LTE Tablet", "Kids Tablet"], ["64GB", "4GB RAM"]),
    "three-piece-kurti": (["Unstitched Three Piece", "Kurti Set", "Salwar Kameez Set", "Block Print Three Piece"], ["Size M", "Size L", "Stitched"]),
    "tires": (["Car Tire 14 Inch", "Motorcycle Tire", "Truck Tire", "Tubeless Tire"], ["Ply 4", "Radial", "2.75"]),
    "toys-kids-baby": (["Building Blocks Set", "Plush Teddy Bear", "Educational Puzzle", "Remote Toy Car", "Musical Toy"], ["100 Blocks", "Age 3+"]),
    "traditional-festive": (["Eid Gift Hamper", "Festive Gift Hamper", "Shankha Bangles Set"], ["Family Size", "Handcrafted"]),
    "tvs-displays": (["Smart LED TV", "Android TV", "Basic LED TV", "4K UHD TV"], ["32 Inch", "43 Inch", "55 Inch"]),
    "watches": (["Analog Watch", "Digital Watch", "Hybrid Smartwatch", "Leather Strap Watch"], ["Water Resistant", "Stainless"]),
    "wearables": (["Fitness Band", "Smartwatch", "GPS Sports Watch"], ["AMOLED", "5ATM", "Black Strap"]),
    "badminton": (["Badminton Racket", "Shuttle Cock Tube", "Racket Grip", "String Set"], ["Carbon", "Nylon"], ),
    "baby-food": (["Infant Cereal", "Baby Milk Formula", "Fruit Puree Jar"], ["350g", "Stage 1", "Age 6-12"]),
    "baby-gear": (["Baby Stroller", "Baby Cot", "Diaper Bag", "Baby Carrier", "High Chair"], ["Foldable", "3-in-1"]),
    "bags-luggage": (["Backpack", "Travel Trolley Bag", "Laptop Bag", "Duffel Bag"], ["20L", "Cabin Size", "Water Resistant"]),
    "smartphones-ext": ([], []),  # placeholder, smartphones handled specially
}
LEAF_KINDS.pop("smartphones-ext", None)

SPECS_BY_LEAF = {  # smartphones spec tokens
    "smartphones": ["4GB/64GB", "6GB/128GB", "8GB/256GB", "8GB/128GB"],
    "laptops-computers": ["Core i5 8GB/512GB", "Core i7 16GB/512GB", "Ryzen 5 8GB/512GB", "Core i3 8GB/256GB", "M2 8GB/256GB"],
    "feature-phones": ["Dual SIM"],
}

SPEC_LABEL = {  # specsJson key per leaf ("Variant" when absent)
    "smartphones": "RAM/Storage",
    "laptops-computers": "Configuration",
    "feature-phones": "SIM",
    "tablets": "Storage",
    "sarees": "Material",
    "mens-panjabi": "Fabric",
    "three-piece-kurti": "Fabric",
    "mens-shirts": "Fabric",
    "womens-clothing": "Fabric",
    "footwear": "Size",
    "refrigerators": "Capacity",
    "air-conditioners": "Capacity",
    "rice": "Pack",
    "cooking-oil": "Pack",
    "spices-masala": "Pack",
    "dairy": "Pack",
    "staples": "Pack",
    "packaged-food": "Pack",
    "snacks-sweets": "Pack",
    "beverages": "Pack",
    "fresh-frozen": "Weight",
    "tvs-displays": "Screen",
    "fans-heaters": "Type",
    "cricket": "Material",
    "stationery": "Format",
    "online-learning": "Format",
    "mobile-topup-data": "Plan",
    "gift-cards": "Value",
}

SPEC_KEY_DEFAULT = "Variant"

# Local BD brands (gets "Local Brand" / "Made in Bangladesh" tags).
LOCAL_BRANDS = {
    "Walton", "Vision", "Pran", "Square", "ACI Pure", "Fresh", "Teer",
    "Rupchanda", "White Sister", "Radhuni", "Meril", "Savlon", "Milk Vita",
    "Mojo", "Bashundhara", "Ispahani", "Akij", "Aarong", "Aranya", "Sailor",
    "Westecs", "Easy", "Ecstasy", "Yellow", "Bata", "Apex", "Hatil", "Otobi",
    "Regency", "RFL", "Hamko", "Runner", "BRB", "Lal Teer", "Minister",
    "Phinix", "Hercules", "Kiam", "Miyako", "Volta", "Berger", "Olympic",
    "Danish", "Bombay Sweets", "Paragon", "Iceland", "Sundarban Honey",
    "Symphony", "Singer", "Prothoma", "UPL", "Panjeree", "Ananda", "Odyssey",
    "10 Minute School", "Bohubrihi", "toffee", "Bioscope", "Robi",
    "Grameenphone", "Banglalink", "Teletalk", "PetZone BD", "PetPro BD",
    "Companion BD", "BabyJoy BD", "Green Home Nursery", "Bonayan BD",
    "AutoParts BD", "RoadKing BD", "Aarong Dairy", "Farm Fresh", "Diploma",
    "Nestle India", "Tibet", "Kids Kingdom", "Alankar BD", "Tangail Weavers",
    "Prabartana", "NineCube Digital", "DataSoft", "TigerIT", "ByteWorks BD",
    "Interactive Cares", "One Paper", "FitnessHub BD", "Sundarban Gold",
    "Amin Jewellers", "Gray-Nicolls", "MB Malik", "Classmate", "Regal",
    "Matador", "Linc", "DCA", "Kemei", "Skin Cafe", "Lakme", "Bohubrihi",
}

BRAND_SLUG_OVERRIDES = {
    "F&D": "f-and-d", "L'Oreal Paris": "loreal-paris", "10 Minute School": "10-minute-school",
    "Lal Teer": "lal-teer", "BRB": "brb", "GNC": "gnc", "TVS": "tvs",
    "HP": "hp", "SG": "sg", "DCA": "dca", "toffee": "toffee",
}


def brand_slug(name: str) -> str:
    if name in BRAND_SLUG_OVERRIDES:
        return BRAND_SLUG_OVERRIDES[name]
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()
    return s or "brand"


def sku_code(name: str) -> str:
    code = re.sub(r"[^A-Za-z0-9]", "", name).upper()[:4]
    return (code + "XXXX")[:4]


def kebab(text: str) -> str:
    s = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()
    return s[:118] or "product"


def h(text: str, n: int) -> str:
    return hashlib.sha1(text.encode()).hexdigest().upper()[:n]


# --------------------------------------------------------------------------
# Product leaves and count allocation
# --------------------------------------------------------------------------
RAW_COUNT_OVERRIDES = {
    "smartphones": 140, "laptops-computers": 110, "packaged-food": 120,
    "snacks-sweets": 100, "mens-shirts": 100, "sarees": 90, "mens-panjabi": 90,
    "makeup": 90, "skincare": 90, "stationery": 100, "books": 90,
    "software": 15, "streaming": 12, "gift-cards": 12,
    "freelancing-services": 10, "mobile-topup-data": 14, "online-learning": 15,
    "exam-prep": 40, "rice": 80, "cooking-oil": 70, "footwear": 90,
    "refrigerators": 60, "tvs-displays": 60, "air-conditioners": 50,
    "furniture": 70, "kitchenware": 70, "spices-masala": 70, "dairy": 70,
    "beverages": 70, "toys-kids-baby": 60, "watches": 60,
}
DEFAULT_LEAF_COUNT = 55


def load_csv_slugs() -> list[str]:
    lines = CATEGORIES_CSV.read_text(encoding="utf-8").splitlines()
    slugs = [ln.strip() for ln in lines[1:] if ln.strip()]
    return slugs


def main() -> int:
    rng = random.Random(20261107)
    slugs = load_csv_slugs()
    slug_set = set(slugs)
    expected = set(ROOTS) | set(PARENT_OF) | {"uncategorized"}
    missing = expected - slug_set
    extra = slug_set - expected
    if missing or extra:
        raise SystemExit(f"taxonomy/csv mismatch. missing={sorted(missing)} extra={sorted(extra)}")

    # ---- category rows (depth-first order defined by ROOTS + PARENT_OF) ----
    def subtree(slug: str) -> list[str]:
        kids = sorted(k for k, p in PARENT_OF.items() if p == slug)
        out = [slug]
        for k in kids:
            out.extend(subtree(k))
        return out

    ordered: list[str] = []
    for r in ROOTS:
        ordered.extend(subtree(r))
    categories = []
    for idx, slug in enumerate(ordered):
        parent = PARENT_OF.get(slug)
        chain = [slug]
        cur = slug
        while cur in PARENT_OF:
            cur = PARENT_OF[cur]
            chain.append(cur)
        path = "/" + "/".join(reversed(chain)) + "/"
        depth = len(chain)
        categories.append({
            "name": display_name(slug), "slug": slug, "parentSlug": parent,
            "depth": depth, "path": path, "sortOrder": idx, "isActive": True,
        })

    # ---- product counts ----
    leaves = [s for s in ordered if s not in STRUCTURAL]
    counts = {s: RAW_COUNT_OVERRIDES.get(s, DEFAULT_LEAF_COUNT) for s in leaves}
    base_total = sum(counts.values())
    scale = TARGET_PRODUCTS / base_total
    for s in leaves:
        counts[s] = max(10, round(counts[s] * scale))
    total = sum(counts.values())
    i = 0
    while total < TARGET_PRODUCTS:
        counts[leaves[i % len(leaves)]] += 1
        total += 1
        i += 1

    # ---- generate ----
    products: list[dict] = []
    seen_sku: set[str] = set()
    seen_slug: set[str] = set()
    SUFFIX_BY_ROOT = {
        "grocery-food": ["Twin Pack", "Family Pack", "Value Pack", "Export Quality", "Combo Pack"],
        "fashion-apparel": ["New Arrival", "Festive Look", "Premium Line", "New Edition"],
        "electronics": ["Official Variant", "Latest Edition", "Standard Edition"],
        "home-appliances": ["Standard Edition", "New Arrival", "Official Variant"],
        "sports-outdoors": ["Practice Grade", "Match Grade", "Pro Series"],
        "beauty-personal-care": ["New Stock", "Salon Size", "Combo Offer"],
        "baby-care": ["Gentle Care", "New Stock"],
        "digital-products": ["Starter", "Plus", "Pro"],
        "tools-hardware": ["Trade Grade", "DIY Grade"],
        "toys-games": ["Gift Edition", "Play Set"],
        "books-stationery": ["New Edition", "Latest Print", "Revised"],
        "default": ["Value Pack", "New Stock", "Standard"],
    }
    brand_by_name: dict[str, dict] = {}
    for leaf in leaves:
        n = counts[leaf]
        root = leaf
        while root in PARENT_OF:
            root = PARENT_OF[root]
        blurb = ROOT_BLURB[root]
        lo, hi, t1, t2 = PRICE.get(leaf, ROOT_PRICE[root])
        brands = LEAF_BRANDS.get(leaf) or LEAF_BRANDS.get(root) or ["Generic"]
        for j in range(n):
            brand = brands[j % len(brands)] if len(brands) else "Generic"
            sk_key = (leaf, brand)
            kinds_pair = LEAF_KINDS.get(leaf)
            if leaf == "smartphones":
                kind = (BRAND_KINDS.get(sk_key) or ["4G Android Smartphone"])[rng.randrange(
                    len(BRAND_KINDS.get(sk_key) or ["4G Android Smartphone"]))]
                spec = SPECS_BY_LEAF["smartphones"][rng.randrange(4)]
                name = f"{brand} {kind} ({spec})" if not kind.startswith("(") else None
                if name is None:
                    continue
            elif kinds_pair:
                kinds, spec_opts = kinds_pair
                if not kinds:
                    continue
                kind = kinds[rng.randrange(len(kinds))]
                if leaf == "beverages" and kind in ("Tea Bag", "Green Tea", "Instant Coffee"):
                    spec = ["Pack of 20", "Pack of 50", "100g"][rng.randrange(3)]
                elif leaf == "toys-kids-baby" and kind in ("Plush Teddy Bear", "Musical Toy"):
                    spec = ["Small", "Medium", "Large"][rng.randrange(3)]
                else:
                    spec = spec_opts[rng.randrange(len(spec_opts))] if spec_opts else ""
                name = f"{brand} {kind}" + (f" {spec}" if spec else "")
            else:
                spec_opts = SPECS_BY_LEAF.get(leaf, [""])
                spec = spec_opts[rng.randrange(len(spec_opts))]
                kind = BRAND_KINDS.get(sk_key, [])
                kind_name = kind[rng.randrange(len(kind))] if kind else ""
                name = f"{brand} {kind_name}".strip() + (f" ({spec})" if spec else "")
            if len(name) > TITLE_MAX:
                name = name[:TITLE_MAX - 3].rstrip() + "..."
            # dedupe name attempts
            attempts = [name]
            slug0 = kebab(name)
            if slug0 in seen_slug:
                pool = SUFFIX_BY_ROOT.get(root, SUFFIX_BY_ROOT["default"])
                for _ in range(8):
                    cand = f"{name} {pool[rng.randrange(len(pool))]}"
                    if kebab(cand) not in seen_slug and len(cand) <= TITLE_MAX:
                        name, attempts = cand, [cand]
                        break
                else:
                    suffix4 = h(f"{leaf}|{name}|{j}|{len(products)}", 4)
                    name = f"{name} {suffix4}"[:TITLE_MAX]
            slug = kebab(name)
            if slug in seen_slug:
                s4 = h(f"{leaf}|{name}|{j}", 4)
                slug = kebab(f"{name} {s4}")[:118]
            while slug in seen_slug:
                s4 = h(f"{slug}|{len(products)}", 4)
                slug = kebab(f"{slug} {s4}")[:118]
            seen_slug.add(slug)

            price = round(lo + (hi - lo) * (rng.random() ** 1.4))
            unit_cost = round(price * rng.uniform(0.60, 0.82), 2)
            compare_at = round(price * rng.uniform(1.08, 1.30)) if rng.random() < 0.35 else None
            stock = 20 + int(sha_int(f"{leaf}|{slug}") % 181)
            sv = int(sha_int(f"stock|{slug}") % 100)
            if sv < 7:
                stock = 0
            elif sv < 13:
                stock = 1 + int(sha_int(f"low|{slug}") % 5)
            tier_tag = "Budget" if price < t1 else ("Mid-range" if price < t2 else "Premium")
            tags = [f"Brand: {brand}", tier_tag]
            is_local = brand in LOCAL_BRANDS
            tags.append("Local Brand" if is_local else "Imported")
            if is_local:
                tags.append("Made in Bangladesh")
            if rng.random() < 0.06:
                tags.append("Eid")
            if rng.random() < 0.02 and root in ("electronics",):
                tags.append("Gaming")
            # extras: sibling link ~10%
            extras: list[str] = []
            if rng.random() < 0.10:
                parent = PARENT_OF.get(leaf)
                siblings = sorted(k for k, p in PARENT_OF.items() if p == parent and k not in STRUCTURAL and k != leaf)
                if siblings:
                    extras = [siblings[rng.randrange(len(siblings))]]

            spec_key = SPEC_LABEL.get(leaf, SPEC_KEY_DEFAULT)
            specs: dict = {"Category": display_name(leaf), "Origin": "Bangladesh" if is_local else "Imported"}
            if spec:
                specs[spec_key] = spec
            if root in ("electronics", "home-appliances") and is_local:
                specs["Warranty"] = "1 Year Service Warranty"

            sku = None
            for k_iter in range(40):
                cand = f"BD-{sku_code(brand)}-{sku_code(leaf)}-{j % 1000:03d}-{h(f'{leaf}|{name}|{j}|{k_iter}', 6)}"
                if cand not in seen_sku:
                    sku = cand
                    break
            assert sku, f"SKU exhausted for {leaf}"
            seen_sku.add(sku)
            desc = f"{name} — {blurb}."
            products.append({
                "sku": sku, "slug": slug, "name": name, "description": desc,
                "price": price, "compareAtPrice": compare_at, "unitCost": unit_cost,
                "currency": "BDT", "stockQuantity": stock, "isActive": True,
                "needsReview": rng.random() < 0.15,
                "category": leaf, "extraCategories": extras,
                "tags": sorted(set(tags)),
                "specsJson": json.dumps(specs, ensure_ascii=False),
                "sourceName": "NineCube BD master seed v1 (generated)",
                "sourceUrl": None,
                "sourceLicense": "Generated dataset - internal demo use",
                "priceBasis": f"Seeded BDT market band for {display_name(leaf).lower()} ({lo}-{hi})",
                "brand": brand,
                "imageUrl": f"/products/bd/{slug}.jpg",
                "images": [{"url": f"/products/bd/{slug}.jpg", "altText": name}],
            })

    buyers = [{"name": b, "slug": brand_slug(b), "isActive": True}
              for b in sorted({p["brand"] for p in products})]
    brand_by_name = {b["name"]: b for b in buyers}

    # ---- validate ----
    errors: list[str] = []
    if len(products) < 5000:
        errors.append(f"only {len(products)} products (<5000)")
    if len(categories) < 100:
        errors.append(f"only {len(categories)} categories (<100)")
    max_depth = max(c["depth"] for c in categories)
    if max_depth > 4:
        errors.append(f"category depth {max_depth} > 4")
    for p in products:
        if len(p["sku"]) > 24:
            errors.append(f"sku too long {p['sku']}")
        if p["price"] <= 0:
            errors.append(f"bad price {p['sku']}")
        if len(p["name"]) > 200 or len(p["description"]) > 2000:
            errors.append(f"overlong text {p['sku']}")
        if p["category"] in STRUCTURAL:
            errors.append(f"structural primary {p['sku']}")
        if p["stockQuantity"] < 0:
            errors.append(f"negative stock {p['sku']}")
    if errors:
        for e in errors[:20]:
            print("ERROR:", e)
        raise SystemExit(1)

    dataset = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "locale": "BD", "currency": "BDT", "version": "bd-master-seed-v1",
        "categories": categories,
        "brands": buyers,
        "products": products,
    }
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "bd-catalog.json").write_text(
        json.dumps(dataset, ensure_ascii=False, indent=1), encoding="utf-8")

    per_cat: dict[str, int] = {}
    for p in products:
        per_cat[p["category"]] = per_cat.get(p["category"], 0) + 1
    report = {
        "generatedAt": dataset["generatedAt"],
        "products": len(products),
        "categories": len(categories),
        "categoriesLeavesWithStock": len(per_cat),
        "brands": len(buyers),
        "maxDepth": max_depth,
        "priceRangeTotaka": [min(p["price"] for p in products), max(p["price"] for p in products)],
        "needsReview": sum(1 for p in products if p["needsReview"]),
        "zeroStock": sum(1 for p in products if p["stockQuantity"] == 0),
        "withCompareAtPrice": sum(1 for p in products if p["compareAtPrice"]),
        "withExtraCategory": sum(1 for p in products if p["extraCategories"]),
        "perLeafCount": dict(sorted(per_cat.items())),
    }
    (OUT_DIR / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({k: v for k, v in report.items() if k != "perLeafCount"}, indent=2))
    print(f"written: {OUT_DIR / 'bd-catalog.json'}")
    return 0


def sha_int(text: str) -> int:
    return int(hashlib.sha1(text.encode()).hexdigest()[:12], 16)


if __name__ == "__main__":
    raise SystemExit(main())
