"""Extract factual names, prices and identifiers; never copy descriptions/images."""
import html
import json
import re
from collections import Counter
from common import RAW, CLEAN, save_json

def plain(text):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", text))).strip()

def decoded_html(text):
    parts = [text]
    for script in re.findall(r"<script[^>]*>(.*?)</script>", text, re.S):
        if script.startswith("self.__next_f.push("):
            try:
                value = json.loads(script[len("self.__next_f.push("):-1])
                if len(value)>1 and isinstance(value[1], str): parts.append(value[1])
            except (ValueError, IndexError): pass
    return "\n".join(parts)

def objects(text):
    text = decoded_html(text)
    decoder = json.JSONDecoder()
    for match in re.finditer(r'\{"(?:name|Name|Id|id)"\s*:', text):
        try:
            value, _ = decoder.raw_decode(text, match.start())
            yield value
        except ValueError: pass

def main():
    manifest = json.loads((RAW / "manifest.json").read_text(encoding="utf-8"))
    result = []
    seen = set()
    def add(brand, name, category, price, url, filename, specs=None, reasons=None):
        if not price or float(price) <= 0 or (brand, name) in seen: return
        seen.add((brand, name))
        evidence = next((m for m in reversed(manifest) if m.get("file")==filename and m.get("status")=="ok"), None)
        if not evidence: return
        result.append(dict(name=name, brand=brand, primaryCategorySlug=category, price=float(price),
            specs=specs or {}, source_name=brand+" official catalogue", source_url=url,
            source_license="Official factual product identity and listed price; images/text excluded",
            price_basis="Official listed BDT price; variant and tax conditions apply",
            price_verified_at=evidence["fetched_at"], review_reasons=reasons or []))
    for filename, brand, category in [
        ("walton-catalogue.txt","Walton","smartphones"),
        ("walton-refrigerators.html","Walton","refrigerators"),
        ("walton-led.html","Walton","led-lighting"),
        ("walton-lighting.html","Walton","led-lighting")]:
        path=RAW/filename
        if not path.exists(): continue
        text=path.read_text(encoding="utf-8")
        for tile in re.split(r'class="single-category-area"',text)[1:]:
            name=re.search(r'<h6[^>]*>\s*<a href="([^"]+)">(.*?)</a>',tile,re.S)
            price=re.search(r'class="price-style"[^>]*>(.*?)</p>',tile,re.S)
            if not (name and price): continue
            if re.search(r'ribbon-text">UPCOMING',tile): continue
            listed=plain(price[1]); amount=re.search(r"(?:MSRP|BDT|Tk)\.?\s*([\d,]+(?:\.\d+)?)",listed)
            if amount: add(brand,brand+" "+plain(name[2]),category,amount[1].replace(',',''),name[1],filename,
                reasons=["Listed price excludes VAT; confirm tax-inclusive payable price"] if "+VAT" in listed else [])
    path=RAW/"bata-catalogue.txt"
    if path.exists():
        for p in json.loads(path.read_text(encoding="utf-8")).get("products",[]):
            variants=[v for v in p.get("variants",[]) if float(v.get("price") or 0)>0]
            if not variants:continue
            v=min(variants,key=lambda v:float(v['price']))
            name=p['title']; identifier=v.get('sku') or p['handle']
            add("Bata", "Bata "+name+" ("+identifier+")", "bags" if "bag" in name.lower() else "shoes",v['price'],
                "https://www.batabd.com/products/"+p['handle'],"bata-catalogue.txt",{"source_sku":identifier},
                ["Starting variant price; selected size/colour may differ"])
    for filename,brand,category in [("hatil-catalogue.txt","Hatil","chairs"),("hatil-beds.html","Hatil","beds"),("apex-catalogue.txt","Apex","shoes")]:
        path=RAW/filename
        if not path.exists():continue
        for p in objects(path.read_text(encoding="utf-8")):
            if brand=="Hatil" and 'product_price' in p:
                add(brand,brand+" "+p['name'],category,p['product_price'].get('price_value'),
                    "https://www.hatil.com/"+p['se_name'],filename,{"source_sku":p.get('sku')})
            elif brand=="Apex" and 'ProductPrice' in p:
                name=p['Name']; identifier=p['SeName'].split('-')[-1]
                cat="bags" if re.search('bag|wallet',name,re.I) else "shoes"
                add(brand,brand+" "+name+" ("+identifier+")",cat,p['ProductPrice'].get('Price'),
                    "https://www.apex4u.com/product/"+p['SeName'],filename,{"source_identifier":p['SeName']})
    for path in sorted(RAW.glob("walton-led-product-*.html")):
        text=path.read_text(encoding="utf-8",errors="replace")
        title=re.search(r"<title>(.*?)</title>",text,re.S)
        prices=[float(x.replace(",","")) for x in re.findall(r'class="price[^"]*"[^>]*>\s*(?:Tk\.?|BDT)\s*([\d,]+(?:\.\d+)?)',text)]
        if not title or not prices: continue
        label=title.group(1).strip()
        if not label or len(label)>70 or re.search(r"waltonbd|error|404",label,re.I): continue
        name="Walton "+label if re.search(r"\b(bulb|light|led|tube|panel)\b",label,re.I) else "Walton "+label+" LED Bulb"
        evidence=next((m for m in reversed(manifest) if m.get("file")==path.name and m.get("status")=="ok"), None)
        if not evidence: continue
        add("Walton",name,"led-lighting",min(prices),evidence["url"],path.name,
            {"series_page":True,"listed_variant_prices_bdt":sorted(set(prices))},
            ["Series page: shown price is the lowest listed variant; variant list retained in specs"])
    save_json(CLEAN/"official-records.json",result)
    print('Verified official price rows:',len(result),dict(Counter(p['source_name'] for p in result)))

if __name__ == '__main__':main()
