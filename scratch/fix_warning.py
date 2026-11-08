path = 'src/NineCube.Infrastructure/Persistence/ProductionCatalogImporter.cs'
with open(path, 'r', encoding='utf-8') as f:
    c = f.read()

c = c.replace('[new Photo(product.ImageUrl, product.Name)]', '[new Photo(product.ImageUrl!, product.Name)]')

with open(path, 'w', encoding='utf-8') as f:
    f.write(c)
print("Updated null-forgiving operator.")
