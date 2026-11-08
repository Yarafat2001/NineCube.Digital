import os

for f in ['fresh-extra-virgin-olive-oil-5l.jpg', 'fresh-extra-virgin-olive-oil-5l-export-quality.jpg', 'fresh-mustard-oil-1l.jpg']:
    p = os.path.join('web/public/products/bd', f)
    if os.path.exists(p):
        print(f"{f}: size={os.path.getsize(p)}")
    else:
        print(f"{f}: NOT FOUND")
