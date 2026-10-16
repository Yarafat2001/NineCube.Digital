"""Resolve Wikipedia reference pages for generic fallback items (brief section 4).
Stores the canonical URL returned by the API; URLs are never guessed locally.
CC BY-SA 4.0 applies to article summaries; only page identity is reused.
"""
import json
from common import RAW, CLEAN, fetch, save_json

TITLES = {
    "rice": ["Rice", "Basmati"],
    "cooking-oil": ["Soybean oil", "Coconut oil"],
    "shirts": ["Dress shirt", "Shirt"],
    "panjabi": ["Panjabi (clothing)", "Kurta"],
    "sarees": ["Saree", "Jamdani"],
    "cosmetics": ["Cosmetics", "Lipstick"],
    "fragrances": ["Perfume", "Deodorant"],
    "medicines": ["Oral rehydration therapy", "Paracetamol"],
    "sports-accessories": ["Cricket bat", "Badminton"],
    "watches": ["Watch"],
    "auto-accessories": ["Helmet", "Car wash"],
    "motorbikes": ["Motorcycle"],
    "wall-paint": ["Paint", "Interior decoration"],
    "ips-batteries": ["Deep cycle battery", "Lead–acid battery"],
    "laptops": ["Laptop"],
}

def main():
    resolved = {}
    for leaf, candidates in TITLES.items():
        entry = resolved.setdefault(leaf, [])
        for title in candidates:
            if len(entry) >= (2 if leaf not in {"motorbikes", "watches", "laptops"} else 1):
                break
            if any(e["title"].replace(" ", "_") == title.replace(" ", "_") for e in entry):
                continue
            slug = title.replace(" ", "_").replace("–", "-").lower()
            path = RAW / f"wiki-{slug}.json"
            url = "https://en.wikipedia.org/api/rest_v1/page/summary/" + title.replace(" ", "_").replace("–", "-")
            data = fetch(url, f"wiki-{slug}.json", "Wikipedia summary API", "CC BY-SA 4.0")
            if data is None or not path.exists():
                continue
            try:
                value = json.loads(path.read_text(encoding="utf-8"))
            except ValueError:
                path.unlink(missing_ok=True)
                continue
            if value.get("type") == "disambiguation" or "content_urls" not in value:
                continue
            entry.append(dict(title=title, url=value["content_urls"]["desktop"]["page"],
                              summary=(value.get("extract") or "")[:280], license="CC BY-SA 4.0"))
        if not entry:
            raise SystemExit(f"No resolvable Wikipedia reference for leaf '{leaf}'; refusing guessed URLs.")
    save_json(CLEAN / "reference-docs.json", resolved)
    total = sum(len(v) for v in resolved.values())
    print(f"Resolved {total} reference pages across {len(resolved)} leaves.")

if __name__ == "__main__":
    main()
