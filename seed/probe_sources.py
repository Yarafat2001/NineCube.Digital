"""Read official robots before public factual product catalogues."""
from urllib.parse import urlsplit
from urllib.robotparser import RobotFileParser
import json
from common import fetch, RAW, save_json, USER_AGENT

SOURCES = {
    "Bata": "https://www.batabd.com/products.json?limit=100",
    "Apex": "https://www.apex4u.com/",
    "Aarong": "https://www.aarong.com/default/men/panjabi",
    "Hatil": "https://www.hatil.com/office/swivel-chair?pageLimit=24",
    "Otobi": "https://otobi.com/",
    "Pran": "https://www.pranfoods.net/brands",
    "Square": "https://www.squarepharma.com.bd/products.php",
    "ACI": "https://www.aci-bd.com/our-businesses/consumer-brands.html",
    "Teer": "https://www.citygroup.com.bd/brand/teer",
    "Radhuni": "https://www.radhuni.com.bd/",
    "Rahimafrooz": "https://www.rahimafrooz.com/",
    "Berger": "https://www.bergerbd.com/products/",
    "Walton": "https://waltonbd.com/mobile/smart-phone",
}

def main():
    for brand, url in SOURCES.items():
        parsed = urlsplit(url)
        root = parsed.scheme + "://" + parsed.netloc
        filename = brand.lower()
        robots_data = fetch(root + "/robots.txt", filename + "-robots.txt", brand, "Robots access policy")
        robots = RobotFileParser()
        if robots_data is None:
            entries = json.loads((RAW / "manifest.json").read_text(encoding="utf-8"))
            entry = entries[-1]
            # RFC 9309: missing robots (404) means no rules. Access errors (403/5xx) stay blocked.
            if "404" not in entry.get("error", ""):
                print(brand, "skip: robots access unavailable")
                continue
            robots.parse([])
        else:
            robots.parse(robots_data.decode("utf-8", errors="replace").splitlines())
        if not robots.can_fetch(USER_AGENT, url):
            print(brand, "skip: robots disallows catalogue")
            continue
        fetch(url, filename + "-catalogue.txt", brand, "Official factual names/prices only; images and descriptions excluded")

if __name__ == "__main__":
    main()
