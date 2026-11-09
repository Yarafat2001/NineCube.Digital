using System.Text;

namespace NineCube.Application.Services;

public static class CatalogSearch
{
    private static readonly Dictionary<string, string[]> Aliases = new(StringComparer.OrdinalIgnoreCase)
    {
        ["জুতা"] = ["shoe", "sneaker", "footwear", "sandal", "boot"],
        ["জুতো"] = ["shoe", "sneaker", "footwear", "sandal", "boot"],
        ["শার্ট"] = ["shirt"], ["প্যান্ট"] = ["pant", "trouser", "jeans"],
        ["ফোন"] = ["phone", "mobile"], ["মোবাইল"] = ["phone", "mobile"],
        ["ল্যাপটপ"] = ["laptop", "notebook"], ["ঘড়ি"] = ["watch"],
        ["ব্যাগ"] = ["bag", "backpack"], ["হেডফোন"] = ["headphone", "earbud"],
        ["নাইকি"] = ["nike"], ["অ্যাডিডাস"] = ["adidas"], ["স্যামসাং"] = ["samsung"],
        ["আপেল"] = ["apple"], ["অ্যাপল"] = ["apple"], ["আসুস"] = ["asus"],
        ["কফি"] = ["coffee"], ["টি-শার্ট"] = ["t-shirt", "tee"],
        ["sneakers"] = ["sneaker", "shoe", "footwear"],
        ["sneaker"] = ["sneakers", "shoe", "footwear"],
        ["shoes"] = ["shoe", "footwear", "sneaker"],
        ["headphones"] = ["headphone", "earphone", "wireless", "audio"],
        ["headphone"] = ["headphones", "earphone", "wireless", "audio"],
        ["laptops"] = ["laptop", "notebook"],
        ["phones"] = ["phone", "smartphone", "mobile"],
        ["smartphones"] = ["smartphone", "phone", "mobile"],
        ["books"] = ["book"],
        ["watches"] = ["watch"],
        ["technology"] = ["electronics", "tech"],
        ["tech"] = ["electronics", "technology"],
        ["living"] = ["furniture", "home"],
        ["plants"] = ["plant", "garden"]
    };

    public static IEnumerable<string[]> Terms(string search)
    {
        var normalized = search.Trim().ToLowerInvariant().Normalize(NormalizationForm.FormC);
        normalized = string.Concat(normalized.Select(c => c is >= '\u09e6' and <= '\u09ef' ? (char)('0' + c - '\u09e6') : c));
        foreach (var word in normalized.Split(' ', StringSplitOptions.RemoveEmptyEntries).Take(12))
            yield return Aliases.TryGetValue(word, out var aliases) ? aliases.Append(word).ToArray() : [word];
    }

    /// <summary>
    /// LIKE patterns for one word's alternatives. The wildcards in a shopper's own text are escaped so
    /// "100%" searches for the characters 100% instead of meaning "everything after 100".
    /// </summary>
    public static List<string> Patterns(IEnumerable<string> alternatives) => alternatives
        .Select(Like)
        .Where(pattern => pattern.Length > 0)
        .Distinct(StringComparer.Ordinal)
        .ToList();

    /// <summary>Every pattern in a query, used to rank name and SKU hits above the secondary pass.</summary>
    public static List<string> Patterns(string search) => Terms(search).SelectMany(Patterns).Distinct(StringComparer.Ordinal).ToList();

    private static string Like(string term) => term.Trim() switch
    {
        { Length: 0 } => string.Empty,
        var value => $"%{value.Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_")}%"
    };
}
