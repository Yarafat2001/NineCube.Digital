import os
files = []
for root, dirs, filenames in os.walk('C:/Users/yeasi/source/repos/NineCube.Digital/web/public/products'):
    for f in filenames:
        if f.endswith('.jpg') or f.endswith('.png') or f.endswith('.webp'):
            rel = os.path.relpath(os.path.join(root, f), 'C:/Users/yeasi/source/repos/NineCube.Digital/web/public')
            files.append(rel)
print(f'Total product images in public: {len(files)}')
for keyword in ['shoe', 'watch', 'bag', 'chair', 'fridge', 'refrigerator', 'tv', 'headphone', 'book', 'pen', 'cream', 'lotion', 'oximeter', 'glucose']:
    matches = [f for f in files if keyword in f.lower()]
    print(f'  keyword "{keyword}": {len(matches)} matches (e.g. {matches[:2]})')
