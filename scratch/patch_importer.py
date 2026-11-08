path = 'src/NineCube.Infrastructure/Persistence/ProductionCatalogImporter.cs'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

target = """            if (product.Images.Count == 0 || (refreshImages && item.Images.Count > 0))
            {
                // A merchant's existing image takes precedence over bundled media, but stale generated
                // placeholders (for example "/products/48.webp" or "/products/nc-1001.jpg") are not
                // reliable catalogue assets once the reviewed feed has real source images.
                var preserveCustomImage = !string.IsNullOrWhiteSpace(product.ImageUrl)
                    && !LooksLikeGeneratedPlaceholder(product.ImageUrl)
                    && !item.Images.Any(i => i.Url == product.ImageUrl);
                var photos = string.IsNullOrWhiteSpace(product.ImageUrl) || item.Images.Any(i => i.Url == product.ImageUrl)
                    ? item.Images
                    : preserveCustomImage ? [new Photo(product.ImageUrl, product.Name)] : item.Images;
                if (product.Images.Count > 0) product.Images.Clear();
                foreach (var photo in photos.Select((image, index) => (image, index)))
                    product.Images.Add(new ProductImage { Url = photo.image.Url, AltText = photo.image.AltText,
                        IsPrimary = photo.index == 0, SortOrder = photo.index, CreatedAt = now });
                // Prefer the reviewed source media when the existing value is a stale generated file name.
                if (string.IsNullOrWhiteSpace(product.ImageUrl) || (!preserveCustomImage && item.Images.Count > 0))
                    product.ImageUrl = photos.FirstOrDefault()?.Url ?? product.ImageUrl;
            }"""

replacement = """            if (product.Images.Count == 0 || (refreshImages && item.Images.Count > 0))
            {
                // A merchant's custom image (/uploads/...) takes precedence over bundled media,
                // but catalogue seed images (/products/...) must be refreshed with the reviewed authentic dual image feed.
                var preserveCustomImage = !string.IsNullOrWhiteSpace(product.ImageUrl)
                    && product.ImageUrl.StartsWith("/uploads/", StringComparison.OrdinalIgnoreCase);
                var photos = preserveCustomImage ? [new Photo(product.ImageUrl, product.Name)] : item.Images;
                if (product.Images.Count > 0) product.Images.Clear();
                foreach (var photo in photos.Select((image, index) => (image, index)))
                    product.Images.Add(new ProductImage { Url = photo.image.Url, AltText = photo.image.AltText,
                        IsPrimary = photo.index == 0, SortOrder = photo.index, CreatedAt = now });
                if (!preserveCustomImage && item.Images.Count > 0)
                    product.ImageUrl = photos.FirstOrDefault()?.Url ?? product.ImageUrl;
            }"""

# Normalize \r\n to match
if target in content:
    content = content.replace(target, replacement)
    print("Replaced with UNIX line endings")
elif target.replace('\n', '\r\n') in content:
    content = content.replace(target.replace('\n', '\r\n'), replacement.replace('\n', '\r\n'))
    print("Replaced with CRLF line endings")
else:
    print("TARGET NOT FOUND!")

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
