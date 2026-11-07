"""Generate deterministic per-product images for the BD master seed catalog.

Reads data/bd-catalog/bd-catalog.json and renders one clean 800x800 product
card JPEG per product into web/public/products/bd/ (served as /products/bd/...).
Fully generated assets: no third-party material, license-free.

Run:  python seed/bd_master_seed/generate_bd_images.py [--force]
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

REPO = Path(__file__).resolve().parents[2]
CATALOG = REPO / "data" / "bd-catalog" / "bd-catalog.json"
OUT_DIR = REPO / "web" / "public" / "products" / "bd"

SIZE = 1600  # render at 2x, downscale to 800

BOLD_CANDIDATES = [
    "C:/Windows/Fonts/arialbd.ttf", "C:/Windows/Fonts/segoeuib.ttf",
    "C:/Windows/Fonts/calibrib.ttf",
]
REG_CANDIDATES = [
    "C:/Windows/Fonts/arial.ttf", "C:/Windows/Fonts/segoeui.ttf",
    "C:/Windows/Fonts/calibri.ttf",
]

PALETTES = [  # (page bg, accent) soft retail-friendly pairs
    ((238, 244, 240), (46, 125, 92)),   # sage green
    ((236, 242, 248), (30, 88, 158)),   # sky blue
    ((248, 242, 234), (156, 90, 26)),   # sand / caramel
    ((246, 238, 240), (156, 46, 82)),   # blush rose
    ((238, 240, 246), (66, 66, 138)),   # lavender slate
    ((240, 244, 244), (58, 110, 110)),  # teal mist
    ((248, 244, 234), (201, 143, 32)),  # warm gold
    ((238, 242, 250), (72, 96, 176)),   # periwinkle
    ((244, 240, 246), (128, 66, 158)),  # plum
    ((238, 246, 244), (36, 118, 96)),   # mint forest
    ((248, 238, 236), (190, 74, 46)),   # clay
    ((236, 244, 248), (26, 118, 148)),  # aqua
    ((244, 242, 236), (120, 110, 40)),  # olive gold
    ((242, 240, 250), (96, 78, 168)),   # violet
    ((240, 246, 240), (82, 140, 62)),   # leaf green
    ((246, 240, 242), (168, 84, 120)),  # rosewood
]


def font(kind: str, size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    paths = BOLD_CANDIDATES if kind == "bold" else REG_CANDIDATES
    for p in paths:
        try:
            return ImageFont.truetype(p, size)
        except OSError:
            continue
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def fmt_price(v: int) -> str:
    return f"{v:,.0f}"


def wrap(text: str, f: ImageFont.ImageFont, max_w: int, drawer: ImageDraw.ImageDraw,
         max_lines: int = 4) -> list[str]:
    words = text.split()
    lines: list[str] = []
    cur = ""
    for w in words:
        cand = f"{cur} {w}".strip()
        if drawer.textlength(cand, font=f) <= max_w or not cur:
            cur = cand
        else:
            lines.append(cur)
            cur = w
            if len(lines) == max_lines:
                break
    if cur and len(lines) < max_lines:
        lines.append(cur)
    # ellipsize overflow: remaining words dropped, mark last line
    if len(lines) == max_lines and words and " ".join(lines).split() != words:
        last = lines[-1]
        while last and drawer.textlength(last + "...", font=f) > max_w:
            last = last.rsplit(" ", 1)[0]
        lines[-1] = (last + " ...").strip()
    return lines


def render(product: dict, leaf_display: str, palette_idx: int) -> Image.Image:
    bg, accent = PALETTES[palette_idx % len(PALETTES)]
    img = Image.new("RGB", (SIZE, SIZE), bg)
    d = ImageDraw.Draw(img)
    # card
    inset = 90
    d.rounded_rectangle([inset, inset, SIZE - inset, SIZE - inset], 70,
                        fill=(255, 255, 255), outline=tuple(int(c * 0.82) for c in accent), width=6)
    # accent top bar inside card
    d.rounded_rectangle([inset + 4, inset + 4, SIZE - inset - 4, inset + 90], 60, fill=accent)
    # category pill text (on top bar)
    f_pill = font("bold", 52)
    pill = leaf_display.upper()
    tw = d.textlength(pill, font=f_pill)
    d.text(((SIZE - tw) / 2, inset + 47 - 52 * 0.36), pill, font=f_pill, fill=(255, 255, 255))

    cx = SIZE / 2
    max_w = SIZE - 2 * inset - 220
    # brand (small caps)
    f_brand = font("reg", 62)
    d.text((cx, 430), product["brand"].title() + "  •  BD", font=f_brand,
           fill=(90, 96, 100), anchor="ma")
    # product name
    f_name = font("bold", 104)
    lines = wrap(product["name"], f_name, max_w, d)
    y = 560
    line_h = 130
    for ln in lines:
        d.text((cx, y), ln, font=f_name, fill=(38, 42, 46), anchor="ma")
        y += line_h
    # divider
    d.line([cx - 180, y + 30, cx + 180, y + 30], fill=(225, 224, 220), width=5)
    # price
    f_price = font("bold", 118)
    f_cur = font("reg", 66)
    price_txt = fmt_price(product["price"])
    cur_w = d.textlength("BDT", font=f_cur)
    pr_w = d.textlength(price_txt, font=f_price)
    total = cur_w + 24 + pr_w
    x0 = (SIZE - total) / 2
    bp = y + 90
    d.text((x0, bp + 24), "BDT", font=f_cur, fill=(120, 126, 130), anchor="la")
    d.text((x0 + cur_w + 24, bp), price_txt, font=f_price, fill=accent)
    # footer
    f_foot = font("reg", 46)
    stock_txt = ("In Stock" if product["stockQuantity"] > 0 else "Currently Out of Stock")
    d.text((cx, SIZE - inset - 120), stock_txt, font=f_foot,
           fill=(46, 125, 92) if product["stockQuantity"] > 0 else (150, 90, 90), anchor="ma")
    return img.resize((800, 800), Image.LANCZOS)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="regenerate existing files")
    ap.add_argument("--limit", type=int, default=0, help="render at most N images (preview)")
    args = ap.parse_args()
    data = json.loads(CATALOG.read_text(encoding="utf-8"))
    if args.limit:
        data["products"] = data["products"][: args.limit]
    leaf_display = {c["slug"]: c["name"] for c in data["categories"]}
    leaf_idx = {c["slug"]: c["sortOrder"] for c in data["categories"]}
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    made = 0
    skipped = 0
    for p in data["products"]:
        out = OUT_DIR / f"{p['slug']}.jpg"
        if out.exists() and not args.force:
            skipped += 1
            continue
        img = render(p, leaf_display[p["category"]], leaf_idx[p["category"]])
        img.save(out, "JPEG", quality=72, optimize=True)
        made += 1
    print(f"images: created={made} skipped(existing)={skipped} -> {OUT_DIR}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
