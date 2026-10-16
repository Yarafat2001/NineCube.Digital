using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using NineCube.Domain;

namespace NineCube.Infrastructure.Persistence;

public sealed record BrandBackfillReport(
    int BrandsCreated,
    int LinesCreated,
    int ProductsWithBrand,
    int ProductsWithLine,
    IReadOnlyList<string> ProductsWithoutBrand,
    IReadOnlyList<string> ProductsWithoutLine);

/// <summary>
/// Builds the brand/series catalogue from data that is already in the database, and nothing else:
/// brands come from the "Brand: &lt;Name&gt;" tags the seed wrote, a product's brand is that tag, and a
/// product's series is the model identifier inside its name once the brand token, the units, sizes,
/// colours, genders and product-type nouns are dropped.
///
/// Nothing is invented: a series row exists only because at least one product name contains it, and a
/// name that carries no model identifier leaves the product with a null series. Idempotent - reruns
/// reuse existing rows and only fill in what is missing.
/// </summary>
public static class BrandCatalogImporter
{
    /// <summary>"Generic" is the seed's placeholder for unbranded items, not a manufacturer.</summary>
    private static readonly string[] IgnoredBrands = ["generic", "unbranded", "no brand"];

    /// <summary>Tokens that describe a variant or a product type rather than a series.</summary>
    private static readonly HashSet<string> AttributeTokens = new(StringComparer.OrdinalIgnoreCase)
    {
        "g", "kg", "mg", "ml", "l", "litre", "litres", "liter", "oz", "pc", "pcs", "pack", "packs",
        "sachet", "strip", "tablet", "tablets", "bottle", "can", "tin", "jar", "box", "boxes", "set",
        "inch", "inches", "feet", "ft", "ah", "w", "wat", "watts", "volt", "gb", "tb", "mb", "ram",
        "ssd", "hdd", "mah", "and", "the", "of", "with", "size", "s", "m", "xl", "xxl", "xxxl",
        "mens", "men", "men's", "women", "womens", "women's", "man", "woman", "boys", "girls", "kid",
        "kids", "unisex", "adult",
        "black", "white", "silver", "gold", "golden", "blue", "red", "green", "grey", "gray", "pink",
        "brown", "beige", "navy", "maroon", "orange", "yellow", "purple", "multi",
        "shoe", "shoes", "sandal", "sandals", "slipper", "slippers", "boot", "boots", "chat", "chappal",
        "shirt", "shirts", "pant", "pants", "trouser", "trousers", "dress", "panjabi", "saree",
        "wallet", "wallets", "tote", "crossbody", "handbag", "handbags", "backpack", "fanny", "bag", "bags",
        "bulb", "bulbs", "led", "light", "lights", "lamp", "tube", "lighting",
        "watch", "watches", "cream", "spray", "oil", "rice", "chips", "biscuit", "biscuits", "cookie",
        "cookies", "chocolate", "oat", "oats", "drink", "drinks", "juice", "sauce", "chutney", "masala",
        "helmet", "battery", "paint", "emulsion", "kit", "racket", "bat", "motorcycle", "commuter",
        "sugar", "salt", "tea", "coffee", "water", "cosmetic", "footwear", "apparel", "inverter",
        "milk", "test", "gym", "leather", "long", "short",
        "casual", "formal", "classic", "original", "regular", "new", "special", "premium", "standard",
        "shape", "code", "model", "item", "variant", "complete"
    };

    public static async Task<BrandBackfillReport> ImportAsync(AppDbContext db, ILogger logger, CancellationToken ct)
    {
        var products = await db.Products.Include(p => p.Tags).ThenInclude(t => t.Tag).ToListAsync(ct);
        var brands = await db.Brands.ToListAsync(ct);
        var lines = await db.ProductLines.ToListAsync(ct);
        var now = DateTime.UtcNow;
        var brandsCreated = 0;
        var linesCreated = 0;

        Brand GetBrand(string name)
        {
            var slug = Slugify(name);
            var brand = brands.FirstOrDefault(b => b.Slug == slug);
            if (brand is null)
            {
                brand = new Brand { Name = name.Trim(), Slug = slug, IsActive = true, CreatedAt = now };
                brands.Add(brand);
                db.Brands.Add(brand);
                brandsCreated++;
            }
            return brand;
        }

        foreach (var name in products.SelectMany(p => p.Tags.Select(t => t.Tag.Name))
                     .Where(n => n.StartsWith("Brand: ", StringComparison.OrdinalIgnoreCase))
                     .Select(n => n["Brand: ".Length..].Trim())
                     .Where(n => n.Length > 0 && !IgnoredBrands.Contains(n.ToLowerInvariant()))
                     .Distinct(StringComparer.OrdinalIgnoreCase))
        {
            // Brands get their own save, so the series and product rows below always reference an identity
            // that already exists in the database.
            GetBrand(name);
        }

        await db.SaveChangesAsync(ct);

        var withBrand = 0;
        var withLine = 0;
        var noBrand = new List<string>();
        var noLine = new List<string>();

        foreach (var product in products)
        {
            var tagNames = product.Tags.Select(t => t.Tag.Name)
                .Where(n => n.StartsWith("Brand: ", StringComparison.OrdinalIgnoreCase))
                .Select(n => n["Brand: ".Length..].Trim())
                .Where(n => n.Length > 0 && !IgnoredBrands.Contains(n.ToLowerInvariant()))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            // No brand tag, or several contradictory ones: the product stays unbranded and is reported.
            if (tagNames.Count != 1)
            {
                if (product.BrandId is null) noBrand.Add(product.Sku);
                continue;
            }

            var brand = GetBrand(tagNames[0]);
            if (product.BrandId != brand.Id)
            {
                product.BrandId = brand.Id;
                product.UpdatedAt = now;
            }
            withBrand++;

            var derived = DeriveLineName(brand.Name, product.Name);
            if (derived is null)
            {
                if (product.ProductLineId is null) noLine.Add(product.Sku);
                continue;
            }

            var slug = Slugify(derived);
            var line = lines.FirstOrDefault(l => l.BrandId == brand.Id && l.Slug == slug);
            if (line is null)
            {
                line = new ProductLine
                {
                    BrandId = brand.Id,
                    Name = derived,
                    Slug = slug,
                    SortOrder = lines.Count(l => l.BrandId == brand.Id),
                    IsActive = true
                };
                lines.Add(line);
                db.ProductLines.Add(line);
                await db.SaveChangesAsync(ct);
                linesCreated++;
            }

            if (product.ProductLineId != line.Id)
            {
                product.ProductLineId = line.Id;
                product.UpdatedAt = now;
            }
            withLine++;
        }

        await db.SaveChangesAsync(ct);

        // A series exists because a product name carried it, so a row no product references is left over
        // from an older derivation (or a renamed product) and would only add empty options to the filter.
        var orphanLines = await db.ProductLines
            .Where(l => !db.Products.Any(p => p.ProductLineId == l.Id)).ToListAsync(ct);
        var orphanBrands = await db.Brands
            .Where(b => !db.Products.Any(p => p.BrandId == b.Id) && !db.ProductLines.Any(l => l.BrandId == b.Id)).ToListAsync(ct);
        db.ProductLines.RemoveRange(orphanLines);
        db.Brands.RemoveRange(orphanBrands);
        await db.SaveChangesAsync(ct);

        var report = new BrandBackfillReport(brandsCreated, linesCreated, withBrand, withLine, noBrand, noLine);
        logger.LogInformation(
            "Brand backfill: {Brands} brands, {Lines} series, {WithBrand} products branded, {WithLine} with a series, " +
            "{NoBrand} without brand, {NoLine} without series.",
            report.BrandsCreated, report.LinesCreated, report.ProductsWithBrand, report.ProductsWithLine,
            report.ProductsWithoutBrand.Count, report.ProductsWithoutLine.Count);

        return report;
    }

    /// <summary>
    /// The model identifier inside a product name, or null when the name carries none.
    /// "(64010a13)" and "(5 Feet-Complete Bed)" style parentheticals are SKU text, not series.
    /// </summary>
    internal static string? DeriveLineName(string brandName, string productName)
    {
        var withoutParentheses = Regex.Replace(productName, "\\([^)]*\\)", " ");
        var tokens = withoutParentheses.Split([' ', '-', '/', ',', ':', ';', '.'], StringSplitOptions.RemoveEmptyEntries);
        var brandWords = brandName.Split(' ', StringSplitOptions.RemoveEmptyEntries)
            .Select(LettersOnly).Where(w => w.Length > 0).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var kept = new List<string>();

        for (var i = 0; i < tokens.Length; i++)
        {
            var token = tokens[i].Trim().Replace('’', '\'');
            if (token.Length == 0) continue;

            // Numbers first: they are either the model number (iPhone 12) or a measurement (250 g),
            // and both end the series name.
            if (Regex.IsMatch(token, @"^\d+(?:[.,]\d+)?$"))
            {
                var digits = token.Replace(".", "").Replace(",", "");
                var previousIsWord = kept.Count == 0 || kept[^1].Any(char.IsLetter);
                // "1.5 l" and "5 ft" measure something, so the number is not a model. "13 128GB" does not -
                // the measurement is written on its own, which means 13 is the model number of the iPhone.
                var nextIsUnit = i + 1 < tokens.Length && IsBareUnitToken(tokens[i + 1].Trim());
                if (digits.Length <= 2 && previousIsWord && !nextIsUnit)
                {
                    // "iPhone 12" and "OnePlus 9 Pro" both keep their number; the loop continues so a
                    // suffix after it ("Pro") can still join the series name.
                    kept.Add(token);
                    continue;
                }
                break;
            }

            var letters = LettersOnly(token);
            if (letters.Length == 0) continue;
            if (brandWords.Contains(letters)) continue;

            // A single letter is a size or a shape qualifier, not part of a series name.
            if (token.Length == 1 && char.IsLetter(token[0])) continue;

            if (IsUnitToken(token) || AttributeTokens.Contains(token)) continue;

            // "A52", "N10", "Y70C", "3D8": a model number ends the series name.
            if (Regex.IsMatch(token, @"^[A-Za-z]*\d+[A-Za-z0-9]*$") && letters.Length > 0)
            {
                kept.Add(NormaliseCase(token));
                break;
            }

            kept.Add(NormaliseCase(token));
            if (kept.Count == 4) break;
        }

        if (kept.Count == 0) return null;
        if (kept.All(t => !t.Any(char.IsLetter))) return null;

        var name = string.Join(' ', kept);
        var nameLetters = LettersOnly(name.Replace(" ", ""));
        if (nameLetters.Equals(LettersOnly(brandName.Replace(" ", "")), StringComparison.OrdinalIgnoreCase)) return null;

        // A one-word "series" that is only a misspelling of the brand ("quekar" for Quaker) is noise.
        if (kept.Count == 1 && DistanceWithin(nameLetters, LettersOnly(brandName.Replace(" ", "")), 2)) return null;

        return name.Length < 2 ? null : name;
    }

    /// <summary>"900g", "45ml", "1.5 l" style tokens are measurements, not model numbers.</summary>
    private static bool IsUnitToken(string token) =>
        Regex.IsMatch(token, @"^\d+(?:[.,]\d+)?\s?(?:g|kg|mg|ml|l|litre|liter|oz|pcs|pc|ah|w|gb|tb|mb|mah|inch|in|ft|feet|fl)$",
            RegexOptions.IgnoreCase)
        || AttributeTokens.Contains(token);

    /// <summary>A unit written on its own, so the number in front of it is a measurement.</summary>
    private static bool IsBareUnitToken(string token) =>
        Regex.IsMatch(token, @"^(?:g|kg|mg|ml|l|litre|litres|liter|oz|pcs|pc|pack|ah|w|wat|watts|volt|gb|tb|mb|mah|inch|in|ft|feet|fl|seater|sitter)$",
            RegexOptions.IgnoreCase);

    private static string LettersOnly(string value) =>
        new(value.Where(char.IsLetter).ToArray());

    private static string Slugify(string value)
    {
        var slug = new string(value.Trim().ToLowerInvariant().Select(ch => char.IsLetterOrDigit(ch) ? ch : '-').ToArray());
        slug = Regex.Replace(slug, "-+", "-").Trim('-');
        if (slug.Length == 0) slug = "series";
        return slug.Length > 120 ? slug[..120].Trim('-') : slug;
    }

    /// <summary>Acronyms (NEXG, GT, WFC) stay uppercase; everything else is written as a name.</summary>
    private static string NormaliseCase(string token)
    {
        if (token.Length <= 4 && token.Any(char.IsUpper) && token == token.ToUpperInvariant()) return token;
        if (token == token.ToUpperInvariant() || token == token.ToLowerInvariant())
            return char.ToUpperInvariant(token[0]) + token[1..].ToLowerInvariant();
        return token;
    }

    private static bool DistanceWithin(string a, string b, int maximum)
    {
        if (Math.Abs(a.Length - b.Length) > maximum) return false;

        var previous = Enumerable.Range(0, b.Length + 1).ToArray();
        for (var i = 1; i <= a.Length; i++)
        {
            var current = new int[b.Length + 1];
            current[0] = i;
            for (var j = 1; j <= b.Length; j++)
            {
                var cost = char.ToUpperInvariant(a[i - 1]) == char.ToUpperInvariant(b[j - 1]) ? 0 : 1;
                current[j] = Math.Min(Math.Min(current[j - 1] + 1, previous[j] + 1), previous[j - 1] + cost);
            }
            previous = current;
        }

        return previous[b.Length] <= maximum;
    }
}
