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
        ["কফি"] = ["coffee"], ["টি-শার্ট"] = ["t-shirt", "tee"]
    };

    public static IEnumerable<string[]> Terms(string search)
    {
        var normalized = search.Trim().ToLowerInvariant().Normalize(NormalizationForm.FormC);
        normalized = string.Concat(normalized.Select(c => c is >= '\u09e6' and <= '\u09ef' ? (char)('0' + c - '\u09e6') : c));
        foreach (var word in normalized.Split(' ', StringSplitOptions.RemoveEmptyEntries).Take(12))
            yield return Aliases.TryGetValue(word, out var aliases) ? aliases.Append(word).ToArray() : [word];
    }
}
