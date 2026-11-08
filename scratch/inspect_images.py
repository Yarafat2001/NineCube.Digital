import os
from PIL import Image

def inspect_img(path):
    if not os.path.exists(path):
        print(f"NOT FOUND: {path}")
        return
    with Image.open(path) as img:
        print(f"{path}: format={img.format}, size={img.size}, mode={img.mode}")

inspect_img('web/public/products/bd/fresh-mustard-oil-1l.jpg')
inspect_img('web/public/products/bd/fresh-extra-virgin-olive-oil-1l.jpg')
inspect_img('web/public/products/bd/aarong-anklet-gold-plated-premium-line.jpg')
inspect_img('web/public/products/bd/aarong-baby-winter-set-size-m.jpg')
inspect_img('web/public/products/bd/canonical_fresh_mustard_packet.jpg')
inspect_img('web/public/products/bd/canonical_mustard_oil_open.jpg')
inspect_img('web/public/products/bd/canonical_olive_oil_packet.jpg')
inspect_img('web/public/products/bd/canonical_olive_oil_open.jpg')
