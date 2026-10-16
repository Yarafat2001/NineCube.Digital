"""Fetch Walton LED bulb product pages listed on the already-cached category pages.
Robots policy was checked by fetch_more_official.py (waltonbd.com serves no
robots.txt; the 404 was recorded, and requests stay at one per second.
"""
import re
from urllib.parse import urlsplit
from common import RAW, fetch

def main():
    urls = []
    for filename in ["walton-lighting.html", "walton-led.html"]:
        path = RAW / filename
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        for url in re.findall(r'href="(https://waltonbd\.com/led-light/[^"]+/[^"]+)"', text):
            if url.count("/") >= 5 and url not in urls:
                urls.append(url)
    if not urls:
        raise SystemExit("No cached Walton LED category pages found; run fetch_more_official.py first.")
    for url in urls:
        slug = urlsplit(url).path.rstrip("/").split("/")[-1]
        fetch(url, f"walton-led-product-{slug}.html", "Walton LED product page",
              "Official factual name and listed price; images/description excluded")

if __name__ == "__main__":
    main()
