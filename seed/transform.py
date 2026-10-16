"""Build attributed records using actual SQL leaves; estimate prices explicitly.
Sources: cached Open Food Facts extract, pinned Hugging Face phones dataset,
parsed official brand catalogues, and section 4.7 generic fallbacks citing
verified Wikipedia reference pages. Slugs and stock rules for already-loaded
records are unchanged so reruns stay insert-if-missing no-ops.
"""
import csv
import hashlib
import json
import re
import unicodedata
from collections import Counter
from common import RAW, CLEAN, categories, save_json, sku

PHONE_PRICES = {"iPhone 12": 45000, "Galaxy S21": 40000, "Redmi Note 10": 14000,
    "9 Pro": 40000, "Pixel 6": 35000, "iPhone 13": 55000, "Galaxy A52": 24000,
    "Mi 11": 30000, "GT Master Edition": 22000, "Reno 8": 28000}
# Documented Bangladesh retail price ranges (BDT) and Budget/Mid-range/Premium
# tier thresholds per leaf. Generic fallback prices use the range midpoint
# band and are always flagged needs_review.
PRICE_POLICIES = {
    "smartphones": {"range": [6000, 250000], "tiers": [20000, 60000]},
    "laptops": {"range": [30000, 350000], "tiers": [60000, 120000]},
    "refrigerators": {"range": [12000, 160000], "tiers": [35000, 80000]},
    "led-lighting": {"range": [30, 5000], "tiers": [300, 1200]},
    "coffee-tea": {"range": [50, 5000], "tiers": [500, 1500]},
    "uncategorized": {"range": [5, 5000], "tiers": [100, 500]},
    "packaged-food": {"range": [5, 3000], "tiers": [50, 200]},
    "rice": {"range": [100, 3000], "tiers": [600, 1200]},
    "cooking-oil": {"range": [150, 5000], "tiers": [800, 2000]},
    "shirts": {"range": [500, 6000], "tiers": [1200, 2500]},
    "panjabi": {"range": [800, 10000], "tiers": [2000, 5000]},
    "sarees": {"range": [1000, 25000], "tiers": [3500, 9000]},
    "cosmetics": {"range": [50, 3000], "tiers": [300, 1000]},
    "fragrances": {"range": [100, 6000], "tiers": [500, 2000]},
    "medicines": {"range": [5, 1000], "tiers": [50, 200]},
    "sports-accessories": {"range": [100, 15000], "tiers": [1500, 5000]},
    "watches": {"range": [300, 30000], "tiers": [1500, 8000]},
    "auto-accessories": {"range": [100, 8000], "tiers": [800, 2500]},
    "motorbikes": {"range": [80000, 400000], "tiers": [150000, 250000]},
    "wall-paint": {"range": [200, 8000], "tiers": [1200, 3000]},
    "ips-batteries": {"range": [1000, 25000], "tiers": [5000, 12000]},
    "shoes": {"range": [150, 15000], "tiers": [1200, 3500]},
    "bags": {"range": [200, 12000], "tiers": [1500, 4000]},
    "chairs": {"range": [1000, 100000], "tiers": [8000, 25000]},
    "beds": {"range": [6000, 200000], "tiers": [25000, 70000]},
}
# Section 6 volume guidance: 8-15 per leaf, 20+ for smartphones.
LEAF_CAPS = {"smartphones": 30, "coffee-tea": 10, "shoes": 15, "bags": 15,
             "chairs": 15, "beds": 15, "refrigerators": 15, "led-lighting": 15}
FOOD_WORDS = re.compile(r"chutney|chocolate|kitkat|drink|milk|cereal|coca.?cola|sauce|juice|joice|oats?|haribo|chips|cookies|biscuit|noodles|jolpai|chanachur|coffee|tea", re.I)
BRANDS = {"pran": "Pran", "square": "Square", "quaker": "Quaker", "cocacola": "Coca-Cola",
          "nestlé": "Nestlé", "goldmark": "GoldMark", "ahmed": "Ahmed", "samyang": "Samyang"}
FOOD_ORIGIN = {"pran": "Local Brand", "bombay sweets": "Local Brand", "goldmark": "Local Brand",
    "bisk club": "Local Brand", "quasem food products limited": "Local Brand",
    "cowhead": "Made in India", "ching`s": "Imported", "samyang": "Imported",
    "haribo": "Imported", "quaker": "Imported", "coca-cola": "Imported", "nestlé": "Imported"}
OFFICIAL_ORIGIN = {"Walton": "Local Brand", "Hatil": "Local Brand", "Bata": "Local Brand", "Apex": "Local Brand"}
OFFICIAL_SOURCE = {"Walton": "Walton official catalogue", "Hatil": "Hatil official catalogue",
    "Bata": "Bata official catalogue", "Apex": "Apex official catalogue"}
# Generic fallbacks per brief section 4.7: unbranded descriptors only, no
# invented model numbers. Reference pages resolved by fetch_reference_docs.py.
GENERIC_ITEMS = [
    ("rice", "Generic Miniket Rice 5 kg", 650, "Local Brand", ["wiki-rice"]),
    ("rice", "Generic Basmati Rice 1 kg", 380, "Local Brand", ["wiki-basmati"]),
    ("cooking-oil", "Generic Soybean Cooking Oil 5 L", 850, "Local Brand", ["wiki-soybean-oil"]),
    ("cooking-oil", "Generic Coconut Oil 1 L", 420, "Local Brand", ["wiki-coconut-oil"]),
    ("shirts", "Generic Men Cotton Casual Shirt", 1100, "Local Brand", ["wiki-shirt"]),
    ("shirts", "Generic Men Formal Dress Shirt", 1800, "Local Brand", ["wiki-dress-shirt"]),
    ("panjabi", "Generic Cotton Panjabi", 1800, "Local Brand", ["Eid"], ["wiki-kurta"]),
    ("panjabi", "Generic Embroidered Eid Panjabi", 3500, "Local Brand", ["Eid"], ["wiki-kurta"]),
    ("sarees", "Generic Cotton Saree", 3000, "Local Brand", ["Eid"], ["wiki-saree"]),
    ("sarees", "Generic Jamdani-Style Saree", 8000, "Local Brand", ["Eid"], ["wiki-jamdani"]),
    ("cosmetics", "Generic Moisturising Face Cream 50 g", 250, "Local Brand", ["wiki-cosmetics"]),
    ("cosmetics", "Generic Lipstick", 450, "Local Brand", ["wiki-lipstick"]),
    ("fragrances", "Generic Rose Attar 10 ml", 600, "Local Brand", ["wiki-perfume"]),
    ("fragrances", "Generic Body Spray 200 ml", 350, "Imported", ["wiki-deodorant"]),
    ("medicines", "Generic Oral Rehydration Salt Sachet", 25, "Local Brand", ["DGDA Required"], ["wiki-oral-rehydration-therapy"]),
    ("medicines", "Generic Paracetamol 500 mg Tablet Strip", 15, "Local Brand", ["DGDA Required"], ["wiki-paracetamol"]),
    ("sports-accessories", "Generic Cricket Bat", 2500, "Imported", ["wiki-cricket-bat"]),
    ("sports-accessories", "Generic Badminton Racket Set", 1200, "Imported", ["wiki-badminton"]),
    ("watches", "Generic Analog Wrist Watch", 1400, "Imported", ["wiki-watch"]),
    ("auto-accessories", "Generic Motorcycle Helmet Size M", 1300, "Imported", ["wiki-helmet"]),
    ("auto-accessories", "Generic Car Cleaning Kit", 500, "Imported", ["wiki-car-wash"]),
    ("motorbikes", "Generic 125cc Commuter Motorcycle", 185000, "Imported", ["wiki-motorcycle"]),
    ("wall-paint", "Generic Interior Plastic Paint 10 kg", 1100, "Local Brand", ["wiki-paint"]),
    ("wall-paint", "Generic Exterior Emulsion Paint 20 kg", 2600, "Local Brand", ["wiki-interior-decoration"]),
    ("ips-batteries", "Generic Tall Tubular Battery 150 Ah", 7800, "Local Brand", ["wiki-deep-cycle-battery"]),
    ("laptops", "Generic Laptop 8 GB RAM 256 GB SSD", 58000, "Imported", ["wiki-laptop"]),
]
GENERIC_REASONS = ["Generic fallback (brief section 4.7): no usable official or open source for this leaf's brands",
                   "Estimated BDT price from documented price range; not a retailer quote",
                   "Brand, origin and compliance classification unverified per item"]

def normalized(value):
    return re.sub(r"[^a-z0-9]+", " ", unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode().lower()).strip()

def slugify(value):
    return normalized(value).replace(" ", "-")

def tier_for(category, price):
    policy = PRICE_POLICIES[category]
    return "Budget" if price < policy["tiers"][0] else "Mid-range" if price < policy["tiers"][1] else "Premium"

def build():
    tree = categories()
    save_json(CLEAN / "categories.json", tree)
    parents = {c.get("ParentId") for c in tree}
    leaves = {c["Slug"] for c in tree if c["Id"] not in parents}
    records, skipped = [], []
    def skip(source, name, reason):
        skipped.append(dict(source=source, name=name or "(missing)", reason=reason))
    def make(name, brand, category, price, specs, source, reasons, stock, tags=None, extras=(), is_active=True):
        if category not in leaves:
            skip(source["source_name"], name, f"No matching leaf '{category}' in SQL")
            return None
        policy = PRICE_POLICIES[category]
        if not policy["range"][0] <= price <= policy["range"][1]:
            reasons = reasons + ["Outside configured BDT price range"]
        slug = slugify(name if normalized(name).startswith(normalized(brand)) else brand + " " + name)
        tags = tags or ["Brand: " + brand, tier_for(category, price)]
        return dict(name=name, slug=slug, sku=sku(slug), currency="BDT", price=price,
            stockQuantity=stock, isActive=is_active, shortDescription=(f"{name}. Check the sourced pack or model details before purchase.")[:150],
            primaryCategorySlug=category, extraCategorySlugs=list(extras), tags=tags, specs=specs,
            imageUrl=None, needs_review=bool(reasons), review_reasons=reasons, placeholder=False,
            requires_dgda=category == "medicines", requires_bsti=None,
            price_basis="Estimated BDT seed price; not a retailer quote", **source)
    def add(name, brand, category, price, specs, source, reasons, index):
        # Legacy rules preserved verbatim for the already-loaded foods/phones so
        # their SKUs and StockQuantity values never drift on reruns.
        record = make(name, brand, category, price, specs, source, reasons,
            0 if index % 13 == 0 else 20 + int(hashlib.sha256(slugify(name if normalized(name).startswith(normalized(brand)) else brand + " " + name).encode()).hexdigest()[:6], 16) % 181,
            tags=["Brand: " + brand, tier_for(category, price), origin_for(name, brand, category)])
        if record:
            records.append(record)
    def origin_for(name, brand, category):
        return FOOD_ORIGIN.get(normalized(brand), "Imported")
    food_path = RAW / "off-products.json"
    foods = json.loads(food_path.read_text(encoding="utf-8")) if food_path.exists() else []
    accepted_food = Counter()
    for row in foods:
        source = "Open Food Facts"
        name = (row.get("product_name_en") or row.get("product_name") or "").strip()
        brand_raw = (row.get("brands") or "").strip()
        if "en:bangladesh" not in row.get("countries_tags", []):
            skip(source, name, "Not explicitly tagged Bangladesh"); continue
        if not name or not brand_raw or not FOOD_WORDS.search(name):
            skip(source, name, "Missing name/brand or unverified food identity"); continue
        if any("\u0980" <= char <= "\u09ff" for char in name + brand_raw):
            skip(source, name, "English name/brand unavailable; no invented translation"); continue
        if len(brand_raw.split(",")) != 1 or len(brand_raw) > 70:
            skip(source, name, "Ambiguous brand"); continue
        quantity = re.sub(r"\s+", " ", row.get("quantity", "").strip().lower())
        quantity = re.sub(r"(\d)\s*(gm|gram|grams)\b", r"\1 g", quantity)
        quantity = re.sub(r"(\d)\s*(liter|litre)\b", r"\1 L", quantity)
        quantity = re.sub(r"(\d)\s*(ml|kg|g|l)\b", r"\1 \2", quantity)
        match = re.fullmatch(r"(\d+(?:\.\d+)?)\s*(g|kg|ml|l|L)", quantity)
        if not match:
            skip(source, name, "Pack size missing, ambiguous or lacking a unit"); continue
        brand = BRANDS.get(brand_raw.lower(), brand_raw)
        name = re.sub(r"\s+", " ", name)
        if quantity.lower().replace(" ", "") not in name.lower().replace(" ", ""):
            name += " " + quantity
        category = "coffee-tea" if any(c in row.get("categories_tags", []) for c in ["en:coffees", "en:teas"]) else "uncategorized"
        if accepted_food[category] >= 15:
            skip(source, name, "15-row leaf cap"); continue
        amount = float(match[1]) * (1000 if match[2].lower() in {"kg", "l"} else 1)
        if re.search(r"milk|drink|coca|juice|joice", name, re.I):
            price = round(max(20, amount * .13) / 5) * 5
        elif re.search(r"oats|cereal", name, re.I):
            price = round(max(80, amount * 1.4) / 5) * 5
        else:
            price = round(max(15, amount * .8) / 5) * 5
        before = len(records)
        reasons = ["Estimated BDT price", "Community-contributed product identity needs verification"]
        extras = []
        if category == "uncategorized":
            reasons.append("Primary Uncategorized kept from the first import; grocery tree was added afterwards, so the product is cross-listed to packaged-food")
            extras = ["packaged-food"]
        add(name, brand, category, price, {"pack_quantity": quantity},
            dict(source_name=source, source_url="https://world.openfoodfacts.org/product/" + row["code"], source_license="ODbL-1.0 / DbCL-1.0"),
            reasons, len(records))
        if len(records) > before:
            records[-1]["extraCategorySlugs"] = extras
            accepted_food[category] += 1
    phone_path = RAW / "hf-phones.csv"
    if phone_path.exists():
        provenance = json.loads((RAW / "hf-provenance.json").read_text(encoding="utf-8"))
        for row in csv.DictReader(phone_path.read_text(encoding="utf-8-sig").splitlines()):
            if row.get("model") not in PHONE_PRICES:
                skip(provenance["source_name"], row.get("model"), "No reviewed price policy for this model"); continue
            name = row["model"] if normalized(row["model"]).startswith(normalized(row["brand"])) else row["brand"] + " " + row["model"]
            specs = {key: row[key] for key in ["release_year", "os", "ram_gb", "storage_gb", "battery_mah"] if row.get(key)}
            add(name, row["brand"], "smartphones", PHONE_PRICES[row["model"]], specs, provenance,
                ["Estimated BDT price", "Older model: Bangladesh availability and source specifications require verification"], len(records))
    def fresh_stock(slug):
        h = int(hashlib.sha256(slug.encode()).hexdigest()[:8], 16) % 100
        return 0 if h < 7 else 1 + h % 5 if h < 13 else 20 + h % 181
    official = json.loads((CLEAN / "official-records.json").read_text(encoding="utf-8")) if (CLEAN / "official-records.json").exists() else []
    by_category = {}
    for row in official:
        by_category.setdefault(row["primaryCategorySlug"], []).append(row)
    for category in sorted(by_category):
        rows = sorted(by_category[category], key=lambda r: (r["brand"], r["name"]))
        brands = sorted({r["brand"] for r in rows})
        queue = {b: [r for r in rows if r["brand"] == b] for b in brands}
        picked, i = [], 0
        while len(picked) < LEAF_CAPS.get(category, 15) and any(queue.values()):
            b = brands[i % len(brands)]
            if queue[b]:
                picked.append(queue[b].pop(0))
            i += 1
        for row in rows:
            if row in picked:
                continue
            skip(row["source_name"], row["name"], f"Leaf volume cap {LEAF_CAPS.get(category, 15)} (brief section 6)")
        for row in picked:
            brand = row["brand"]
            tags = ["Brand: " + brand, tier_for(category, row["price"]), OFFICIAL_ORIGIN.get(brand, "Imported")]
            record = make(row["name"], brand, category, row["price"], row["specs"],
                dict(source_name=row["source_name"], source_url=row["source_url"], source_license=row["source_license"],
                     price_verified_at=row["price_verified_at"]),
                list(row["review_reasons"]), fresh_stock(slugify(row["name"])), tags=tags)
            if record:
                record["price_basis"] = row["price_basis"]
                record["shortDescription"] = (f"{row['name']}. Listed on the {brand} Bangladesh catalogue; confirm current BDT price, variants and warranty before ordering.")[:150]
                records.append(record)
    references = json.loads((CLEAN / "reference-docs.json").read_text(encoding="utf-8")) if (CLEAN / "reference-docs.json").exists() else {}
    ref_index = {}
    for entries in references.values():
        for entry in entries:
            ref_index["wiki-" + entry["title"].lower().replace(" ", "-").replace("–", "-").replace("'", "")] = entry
    for item in GENERIC_ITEMS:
        category, name, price, origin = item[:4]
        extra_tags, refs = [], item[-1]
        if len(item) == 6:
            extra_tags, refs = item[4], item[5]
        elif len(item) == 5:
            refs = item[4]
        docs = [ref_index[r] for r in refs if r in ref_index]
        if category not in leaves or not docs:
            skip("Generic fallback", name, "Leaf missing or reference page unresolved"); continue
        ref = docs[0]
        record = make(name, "Generic", category, price, {"reference_topic": ref["title"]},
            dict(source_name="Generic fallback (documented price range)", source_url=ref["url"],
                 source_license=ref["license"] + " (reference page for product-type facts only; no text reuse)"),
            list(GENERIC_REASONS), fresh_stock(slugify(name)))
        if record:
            record["placeholder"] = True
            record["stockQuantity"] = 20 + int(hashlib.sha256(record["slug"].encode()).hexdigest()[:6], 16) % 181
            record["tags"] = ["Brand: Generic", tier_for(category, price), origin] + extra_tags
            record["shortDescription"] = (f"{name}. Unbranded placeholder describing the product type; verify an actual sourced item before selling.")[:150]
            records.append(record)
    seen = set()
    unique = []
    for row in records:
        identity = (normalized(row["name"]), normalized(next(t[7:] for t in row["tags"] if t.startswith("Brand: "))))
        if identity in seen:
            skip(row["source_name"], row["name"], "Duplicate normalized name + brand"); continue
        seen.add(identity)
        unique.append(row)
    covered = Counter(r["primaryCategorySlug"] for r in unique)
    extras = Counter(e for r in unique for e in r["extraCategorySlugs"])
    coverage = []
    for leaf in sorted(leaves):
        kinds = sorted({r.get("source_name", "") for r in unique if r["primaryCategorySlug"] == leaf})
        if covered[leaf] or extras[leaf]:
            kind = "official-catalogue" if any("official" in k for k in kinds) else "open-data" if kinds else "cross-listed"
        else:
            kind = "none"
        note = ""
        if covered[leaf] < 8:
            if kind == "none":
                note = "No new approved-source rows for this leaf; existing database coverage is unchanged"
            elif all(r["placeholder"] for r in unique if r["primaryCategorySlug"] == leaf):
                note = "Generic fallbacks only (brief section 4.7); never fabricate to reach a number"
            elif kind == "open-data":
                note = "Approved-source rows exhausted (cached Open Food Facts Bangladesh page); fewer than 8 rather than fabricated"
            else:
                note = "Official catalogue leaf capped by volume guidance or awaiting more verified rows"
        coverage.append(dict(slug=leaf, cleanProducts=covered[leaf], crossListed=extras[leaf], kind=kind, note=note))
    save_json(CLEAN / "coverage.json", coverage)
    save_json(CLEAN / "products.json", unique)
    save_json(CLEAN / "skipped.json", skipped)
    save_json(CLEAN / "price-policy.json", PRICE_POLICIES)
    save_json(CLEAN / "allowed-tags.json", sorted({t for p in unique for t in p["tags"]}))
    CLEAN.mkdir(exist_ok=True)
    with (CLEAN / "products.csv").open("w", newline="", encoding="utf-8-sig") as stream:
        fields = list(dict.fromkeys(key for row in unique for key in row)) if unique else ["name", "slug", "primaryCategorySlug"]
        writer = csv.DictWriter(stream, fieldnames=fields)
        writer.writeheader()
        for row in unique:
            writer.writerow({key: json.dumps(value, ensure_ascii=False) if isinstance(value, (list, dict)) else value for key, value in row.items()})
    print(f"Clean records: {len(unique)}; categories: {dict(Counter(r['primaryCategorySlug'] for r in unique))}; skipped: {len(skipped)}")

if __name__ == "__main__":
    build()
