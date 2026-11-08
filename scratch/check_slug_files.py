import os

p1 = 'web/public/products/bd/fresh-extra-virgin-olive-oil-1l.jpg'
p2 = 'web/public/products/bd/fresh-mustard-oil-1l.jpg'
p3 = 'web/public/products/bd/aarong-anklet-gold-plated-premium-line.jpg'
p4 = 'web/public/products/bd/aarong-baby-winter-set-size-m.jpg'

for p in [p1, p2, p3, p4]:
    if os.path.exists(p):
        print(f"{p} exists, size={os.path.getsize(p)}")
    else:
        print(f"{p} DOES NOT EXIST")
