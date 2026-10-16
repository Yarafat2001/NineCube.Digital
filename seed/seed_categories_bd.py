"""Explicit one-time taxonomy setup, authorized by the completion request.
The product loader remains unable to create or modify categories.
"""
from common import ROOT, save_json, sql, categories

TREE = {
    "Grocery": [("Rice", "rice"), ("Cooking Oil", "cooking-oil"), ("Packaged Food", "packaged-food")],
    "Fashion": [("Shirts", "shirts"), ("Panjabi", "panjabi"), ("Sarees", "sarees")],
    "Furniture": [("Chairs", "chairs"), ("Beds", "beds")],
    "Footwear": [("Shoes", "shoes")],
    "Beauty": [("Cosmetics", "cosmetics"), ("Fragrances", "fragrances")],
    "Health": [("Medicines", "medicines")],
    "Sports": [("Sports Accessories", "sports-accessories")],
    "Accessories": [("Bags", "bags"), ("Watches", "watches")],
    "Automotive": [("Auto Accessories", "auto-accessories")],
    "Motorcycles": [("Motorbikes", "motorbikes")],
    "Paint": [("Wall Paint", "wall-paint")],
    "Batteries": [("IPS Batteries", "ips-batteries")],
    "Electrical": [("LED Lighting", "led-lighting")],
}

def main():
    entries = []
    for sort, (name, children) in enumerate(TREE.items(), 2):
        slug = name.lower()
        entries.append((name, slug, None, sort))
        entries.extend((name, child, slug, i) for i, (name, child) in enumerate(children))
    entries += [("Home Appliances", "home-appliances", "electronics", 2),
                ("Refrigerators", "refrigerators", "home-appliances", 0),
                ("Laptops", "laptops", "electronics", 3)]
    statement = "SET XACT_ABORT ON; BEGIN TRANSACTION;\nDECLARE @lock int; EXEC @lock=sp_getapplock @Resource='NineCube.Categories',@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=15000; IF @lock<0 THROW 51000,'Taxonomy lock failed',1;\n"
    for name, slug, parent, sort in entries:
        parent_select = "NULL" if parent is None else f"(SELECT Id FROM Categories WHERE Slug=N'{parent}')"
        path = f"'/{slug}/'" if parent is None else f"(SELECT Path FROM Categories WHERE Slug=N'{parent}')+N'{slug}/'"
        depth = "1" if parent is None else f"(SELECT Depth+1 FROM Categories WHERE Slug=N'{parent}')"
        if parent:
            statement += f"IF NOT EXISTS(SELECT 1 FROM Categories WHERE Slug=N'{parent}') THROW 51001,'Required parent missing',1;\n"
        statement += f"IF NOT EXISTS(SELECT 1 FROM Categories WHERE Slug=N'{slug}') INSERT Categories(Name,Slug,ParentId,Path,Depth,SortOrder,IsActive) VALUES(N'{name}',N'{slug}',{parent_select},{path},{depth},{sort},1);\n"
    statement += "COMMIT;"
    (ROOT / "seed_categories_bd.sql").write_text(statement + "\n", encoding="utf-8")
    sql(statement)
    tree = categories()
    roots = [c for c in tree if c.get("ParentId") is None and c["Slug"] != "uncategorized"]
    if len(roots) != 15 or max(c["Depth"] for c in tree) > 3:
        raise ValueError("Expected 15 roots plus Uncategorized, depth <= 3. Existing conflicting taxonomy requires review.")
    save_json(ROOT / "clean/categories.json", tree)
    print(f"Taxonomy: {len(roots)} roots + Uncategorized; {len(tree)} categories; maximum depth 3.")

if __name__ == "__main__":
    main()
