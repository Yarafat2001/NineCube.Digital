from urllib.parse import urlsplit
from urllib.robotparser import RobotFileParser
import json
from common import RAW, fetch, USER_AGENT

URLS = {
    "walton-refrigerators": "https://waltonbd.com/refrigerator-freezer/direct-cool-refrigerator",
    "walton-lighting": "https://waltonbd.com/led-light/led-bulb",
    "hatil-beds": "https://www.hatil.com/collections/queen-beds",
    "otobi-beds": "https://otobi.com/otobi-full-sitemap.html",
    "aarong-panjabi": "https://mcprod.aarong.com/women/panjabi",
    "aarong-shirts": "https://www.aarong.com/default/men/shirts",
    "aarong-sarees": "https://www.aarong.com/default/women/saree",
    "square-generics": "https://www.squarepharma.com.bd/products-by-generic.php",
    "aci-products": "https://www.aci-bd.com/",
    "berger-products": "https://www.bergerbd.com/",
    "rahimafrooz-batteries": "https://www.rahimafrooz.com/storage-power/",
    "radhuni-products": "https://www.radhuni.com/",
    "teer-products": "https://www.citygroup.com.bd/",
    "dgda": "https://dgda.gov.bd/",
    "otobi-bed-list": "https://otobi.com/ProductCategory.aspx?pc=157",
    "rahimafrooz-product-list": "https://www.rahimafrooz.com/our-products/",
    "square-trade": "https://www.squarepharma.com.bd/products-by-tradename.php",
    "teer-brand-list": "https://www.citygroup.com.bd/brand",
    "walton-led": "https://waltonbd.com/led-bulb",
}

def main():
    for name, url in URLS.items():
        parsed = urlsplit(url)
        root = parsed.scheme + "://" + parsed.netloc
        data = fetch(root + "/robots.txt", parsed.netloc.replace('.', '-') + "-robots.txt", name, "Robots access policy")
        robot = RobotFileParser()
        if data is None:
            last = json.loads((RAW / "manifest.json").read_text(encoding="utf-8"))[-1]
            if "404" not in last.get("error", ""):
                continue
            robot.parse([])
        else:
            robot.parse(data.decode("utf-8", errors="replace").splitlines())
        if robot.can_fetch(USER_AGENT, url):
            fetch(url, name + ".html", name, "Official factual names/prices; no image or description reuse")

if __name__ == "__main__":
    main()
