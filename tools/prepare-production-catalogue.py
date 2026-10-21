"""Bundle the already collected catalogue; never fetch or invent product records."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
def read(name):
    return json.loads((ROOT / name).read_text(encoding="utf-8-sig"))

categories = read("seed/clean/categories.json")
category_slugs = {c["Id"]: c["Slug"] for c in categories}
images = {item["name"]: item for item in read("seed/clean/product-image-backfill.json")}
records = []
for item in read("seed/clean/products.json"):
    photo = images[item["name"]]
    file = ROOT / "web/public" / photo["url"].lstrip("/")
    assert hashlib.sha256(file.read_bytes()).hexdigest() == photo["sha256"], file
    primary = item["primaryCategorySlug"]
    if primary == "uncategorized" and item["extraCategorySlugs"]:
        primary = item["extraCategorySlugs"][0]
    description = item["shortDescription"]
    if item["specs"]:
        description += " " + "; ".join(f"{key.replace('_', ' ')}: {value}" for key, value in item["specs"].items()) + "."
    records.append(dict(sku=item["sku"], slug=item["slug"], name=item["name"], price=item["price"],
        currency=item["currency"], description=description, category=primary, tags=item["tags"],
        specsJson=json.dumps(item["specs"], ensure_ascii=False), sourceName=item["source_name"],
        sourceUrl=item["source_url"], sourceLicense=item["source_license"], priceBasis=item["price_basis"],
        needsReview=item["needs_review"], images=[dict(url=photo["url"], altText=("Representative image: " if photo["match"].startswith("representative") else "") + item["name"]) ]))
for item in read("seed/clean/laptops.json"):
    for photo in item["images"]:
        file = ROOT / "web/public" / photo["url"].lstrip("/")
        assert hashlib.sha256(file.read_bytes()).hexdigest() == photo["sha256"], file
    records.append(dict(sku=item["sku"], slug=item["slug"], name=item["name"], price=item["price"],
        currency=item["currency"], description=item["description"], category="laptops", tags=item["tags"],
        specsJson=item["specsJson"], sourceName=item["sourceName"], sourceUrl=item["sourceUrl"],
        sourceLicense=item["sourceLicense"], priceBasis=item["priceBasis"], needsReview=True,
        images=[dict(url=p["url"], altText=f"{item['name']} — source photo {i + 1}") for i, p in enumerate(item["images"])]))
for item in read("src/NineCube.Infrastructure/Persistence/catalogue.json")["products"]:
    records.append(dict(sku=f"DJ-{item['id']}", slug=f"sample-kitchen-{item['id']}", name=item["title"],
        price=item["price"], currency="BDT", description=item["description"], category="kitchen", tags=[],
        sourceName="Bundled sample catalogue", sourceUrl="https://dummyjson.com/products/category/kitchen-accessories",
        priceBasis="Sample catalogue price; requires merchant review", needsReview=True,
        images=[dict(url=f"/products/{item['id']}.webp", altText=item["title"])]))
coffee = [
    ("Espresso Machine Pro", 249, "Espresso coffee machine for preparing espresso drinks. Confirm the model, included accessories and warranty with the merchant."),
    ("Milk Frother", 39.90, "Milk frother for adding a foamed milk finish to coffee and other drinks. Confirm capacity and power requirements before purchase."),
    ("Burr Coffee Grinder", 89.50, "Burr grinder for grinding coffee beans before brewing. Confirm grind settings and bean capacity with the merchant."),
    ("Pour Over Kettle", 64, "Kettle for controlled pouring during manual coffee preparation. Confirm capacity and heat-source compatibility before purchase."),
    ("Paper Filters (100 pack)", 6.75, "Pack of 100 paper coffee filters. Check filter shape and size against your brewer before ordering."),
    ("Ceramic Mug Set", 24, "Ceramic mugs for serving hot or cold drinks. Confirm the number of mugs, capacity and care instructions with the merchant."),
    ("Single Origin Beans 1kg", 32.40, "One-kilogram pack of single-origin coffee beans. Confirm origin, roast date and roast level with the merchant."),
    ("Cold Brew Carafe", 45, "Carafe for preparing or serving cold-brew coffee. Confirm capacity, filter inclusion and care instructions before ordering."),
    ("Tamper & Mat Bundle", 29.99, "Coffee tamper and mat bundle for espresso preparation. Confirm tamper diameter against your portafilter before ordering."),
    ("Reusable Cup", 14.50, "Reusable drinks cup for everyday use. Confirm capacity, lid inclusion and cleaning instructions with the merchant.")
]
for index, (name, price, description) in enumerate(coffee, 1001):
    records.append(dict(sku=f"NC-{index}", slug=f"ninecube-coffee-{index}", name=name, price=price,
        currency="BDT", description=description, category="coffee-tea", tags=[], needsReview=True,
        sourceName="Original NineCube sample catalogue", priceBasis="Original sample price; merchant review required",
        images=[dict(url=f"/products/nc-{index}.jpg", altText=name)]))
assert len({p["sku"] for p in records}) == len(records)
assert len({p["slug"] for p in records}) == len(records)
for record in records:
    assert record["category"] in category_slugs.values()
    for image in record["images"]:
        assert (ROOT / "web/public" / image["url"].lstrip("/")).is_file(), image
bundle = dict(categories=[dict(name=c["Name"], slug=c["Slug"], parentSlug=category_slugs.get(c.get("ParentId")), depth=c["Depth"]) for c in categories], products=records)
target = ROOT / "src/NineCube.Infrastructure/Persistence/production-catalogue.json"
target.write_text(json.dumps(bundle, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"Validated bundle: {len(categories)} categories, {len(records)} additional products, {sum(len(r['images']) for r in records)} images")
