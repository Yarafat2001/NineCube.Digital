"""Backfill only missing product media from recorded source evidence.
Downloads original bytes, validates decoding, records provenance, and applies guarded SQL.
Run discovery/download first; --apply updates image fields only.
"""
import argparse, hashlib, html, io, json, re, time, threading
from datetime import datetime, timezone
from urllib.parse import urlsplit
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parent/'.deps'))
from urllib.request import Request, urlopen
from urllib.parse import urljoin, quote
from concurrent.futures import ThreadPoolExecutor
from PIL import Image
from common import RAW, CLEAN, save_json, sql, sql_json
from parse_official import objects
ROOT=Path(__file__).resolve().parents[1]
DEST=ROOT/'web/public/products/sourced'
MANIFEST=CLEAN/'product-image-backfill.json'

_host_locks={}
_host_last={}
_host_guard=threading.Lock()
def get(url):
    host=urlsplit(url).netloc
    with _host_guard:lock=_host_locks.setdefault(host,threading.Lock())
    with lock:
        time.sleep(max(0,1.2-(time.monotonic()-_host_last.get(host,0))))
        _host_last[host]=time.monotonic()
    with urlopen(Request(quote(url,safe=':/?&=%+'),headers={'User-Agent':'NineCubeCatalogue/1.0 (product image attribution audit)'}),timeout=30) as r:return r.read()

def discover(rows):
    found={}
    def add(url,image,kind='exact product',rights='Manufacturer catalogue photo; copyright retained by source'):
        if image:found[url]={'imageSourceUrl':html.unescape(image),'match':kind,'rights':rights}
    for f in ['hatil-catalogue.txt','hatil-beds.html','apex-catalogue.txt']:
        for p in objects((RAW/f).read_text(encoding='utf-8')):
            if p.get('picture_models'):
                pictures=p['picture_models']
                matching=[i for i in pictures if p['name'].split(' ')[0].lower() in i['image_url'].lower() and '/master_image/' in i['image_url']]
                add('https://www.hatil.com/'+p['se_name'],(matching or pictures)[0]['image_url'])
            if p.get('FeaturedImageUrl'):add('https://www.apex4u.com/product/'+p['SeName'],p['FeaturedImageUrl'])
    for p in json.loads((RAW/'bata-catalogue.txt').read_text(encoding='utf-8')).get('products',[]):
        if p.get('images'):add('https://www.batabd.com/products/'+p['handle'],p['images'][0]['src'])
    for f in ['walton-catalogue.txt','walton-refrigerators.html']:
        s=(RAW/f).read_text(encoding='utf-8')
        for tile in re.split(r'class="single-category-area"',s)[1:]:
            name=re.search(r'<h6[^>]*>\s*<a href="([^"]+)">',tile,re.S)
            images=re.findall(r'<img[^>]+src="([^"]+)"',tile)
            images=[u for u in images if '/image/cache/catalog/' in u]
            if name and images:add(name[1],images[0])
    for r in rows:
        u=r.get('SourceUrl','')
        if u in found:continue
        if 'waltonbd.com/led-light/' in u:
            f=RAW/('walton-led-product-'+u.rsplit('/',1)[-1]+'.html')
            if f.exists():
                imgs=re.findall(r'<img[^>]+src="([^"]+)"',f.read_text(encoding='utf-8'))
                imgs=[v for v in imgs if '/image/cache/catalog/' in v and '-364x364.' in v]
                if imgs:add(u,imgs[0], 'official product series')
    overrides=CLEAN/'product-image-sources.json'
    if overrides.exists():found.update(json.loads(overrides.read_text(encoding='utf-8')))
    return found

def resolve(r,found):
    u=r.get('SourceUrl',''); entry=found.get(u+'#'+str(r['Id'])) or found.get(u)
    try:
        if not entry and 'openfoodfacts.org/product/' in u:
            code=u.rsplit('/',1)[-1]
            d=json.loads(get('https://world.openfoodfacts.org/api/v2/product/'+code+'.json?fields=image_front_url,image_url'))['product']
            image=d.get('image_front_url') or d.get('image_url')
            if image:entry={'imageSourceUrl':image,'match':'exact barcode packaging','rights':'Open Food Facts contributors; image CC BY-SA 3.0'}
        if entry:
            download=entry.get('deliveryUrl',entry['imageSourceUrl'])
            if 'storage.apex4u.com/' in download:
                download='https://www.apex4u.com/_next/image?url='+quote(download,safe='')+'&w=640&q=75'
            data=get(download)
            with Image.open(io.BytesIO(data)) as im:
                im.verify()
            with Image.open(io.BytesIO(data)) as im:
                width,height=im.size;fmt=im.format.lower()
            if min(width,height)<100:raise ValueError('Image too small')
            ext={'jpeg':'jpg'}.get(fmt,fmt)
            if ext not in ['jpg','png','webp','gif']:raise ValueError('Unsupported image format')
            digest=hashlib.sha256(data).hexdigest();filename=f"{r['Id']}-{digest[:12]}.{ext}"
            DEST.mkdir(parents=True,exist_ok=True);(DEST/filename).write_bytes(data)
            return dict(productId=r['Id'],name=r['Name'],sourcePage=u,**entry,url='/products/sourced/'+filename,sha256=digest,width=width,height=height,status='verified')
        return dict(productId=r['Id'],name=r['Name'],sourcePage=u,status='unresolved',error='No verified matching photo discovered')
    except Exception as e:return dict(productId=r['Id'],name=r['Name'],sourcePage=u,status='unresolved',error=str(e))

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--apply',action='store_true');parser.add_argument('--offline',action='store_true');args=parser.parse_args()
    rows=json.loads((CLEAN/'image-audit-before.json').read_text(encoding='utf-8-sig'));rows=[r for r in rows if not r.get('ImageUrl')]
    old=json.loads(MANIFEST.read_text(encoding='utf-8')) if MANIFEST.exists() else []
    existing={r['productId']:r for r in old if r['status']=='verified' and (ROOT/'web/public'/r['url'].lstrip('/')).exists() and hashlib.sha256((ROOT/'web/public'/r['url'].lstrip('/')).read_bytes()).hexdigest()==r['sha256']}
    found=discover(rows)
    if args.offline:results=old
    else:
        with ThreadPoolExecutor(max_workers=3) as pool:
            results=list(pool.map(lambda r:existing.get(r['Id']) or resolve(r,found),rows))
    for r in results:
        if r['status']=='verified':
            entry=found.get(r['sourcePage']+'#'+str(r['productId'])) or found.get(r['sourcePage'],{})
            for key in ['artist','rights','licenseUrl','photoPage','match']:
                if key in entry:r[key]=entry[key]
            r.setdefault('fetchedAt',datetime.now(timezone.utc).isoformat())
    save_json(MANIFEST,results)
    credited=[r for r in results if r['status']=='verified']
    laptop_path=CLEAN/'laptops.json'
    if laptop_path.exists():
        for laptop in json.loads(laptop_path.read_text(encoding='utf-8')):
            credited.append(dict(productId='laptop-'+laptop['slug'],name=laptop['name'],sourcePage=laptop['sourceUrl'],photoPage=laptop['sourceUrl'],rights=laptop['sourceLicense'],match='Retailer model listing photos',status='verified',url=laptop['imageUrl'],images=laptop['images']))
    save_json(ROOT/'web/public/products/image-credits.json',credited)
    credits=['<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Product image credits</title><body><h1>Product image credits</h1><p>Photos and illustrations are cached from the linked sources. Manufacturer rights remain with their owners. Generic items use representative images; packaging, capacity and colour may differ. No image backgrounds were edited.</p>']
    for r in credited:
        if r['status']!='verified':continue
        esc=lambda value:html.escape(str(value or ''))
        credits.append('<section id="product-'+str(r['productId'])+'"><h2>'+esc(r['name'])+'</h2><p>'+esc(r['match'])+' ? '+esc(re.sub('<[^>]+>','',r.get('artist') or ''))+' ? '+esc(r.get('rights'))+'</p><a href="'+esc(r.get('photoPage') or r['sourcePage'])+'">Source and attribution</a>')
        if r.get('licenseUrl'):credits.append(' ? <a href="'+esc(r['licenseUrl'])+'">License</a>')
        credits.append('</section>')
    credits.append('</body></html>')
    (ROOT/'web/public/products/image-credits.html').write_text('\n'.join(credits),encoding='utf-8')
    print('Verified',sum(r['status']=='verified' for r in results),'of',len(rows),flush=True)
    if args.apply:
        before=sql_json('SELECT Id,Sku,Price,StockQuantity,IsActive FROM dbo.Products ORDER BY Id')
        save_json(CLEAN/'image-backfill-business-before.json',before)
        verified=[r for r in results if r['status']=='verified']
        for r in verified:
            asset=ROOT/'web/public'/r['url'].lstrip('/')
            if hashlib.sha256(asset.read_bytes()).hexdigest()!=r['sha256']:raise ValueError('Image file checksum mismatch')
        identities={r['Id']:r for r in rows}
        # The reviewed SKU migration changes labels, while product IDs and media identities stay fixed.
        migration_path=CLEAN/'sku-migration.json'
        if migration_path.exists():
            for migration in json.loads(migration_path.read_text(encoding='utf-8')):
                identity=identities.get(migration['id'])
                if identity and identity['Sku']==migration['oldSku']:
                    identity['Sku']=migration['newSku']
        payload=json.dumps([{'id':r['productId'],'previous':r.get('previousUrl'),'name':identities[r['productId']]['Name'],'sku':identities[r['productId']]['Sku'],'url':r['url'],'alt':(('Representative image: ' if r['match'].startswith('representative') else '')+r['name'])[:200]} for r in verified])
        sql('''SET XACT_ABORT ON; BEGIN TRANSACTION;
        DECLARE @media TABLE(Id int,Name nvarchar(200),Sku nvarchar(100),Url nvarchar(2048),Alt nvarchar(200),Previous nvarchar(2048));
        INSERT @media SELECT Id,Name,Sku,Url,Alt,Previous FROM OPENJSON(?) WITH(Id int '$.id',Name nvarchar(200) '$.name',Sku nvarchar(100) '$.sku',Url nvarchar(2048) '$.url',Alt nvarchar(200) '$.alt',Previous nvarchar(2048) '$.previous');
        IF EXISTS(SELECT 1 FROM @media m LEFT JOIN dbo.Products p ON p.Id=m.Id WHERE p.Id IS NULL OR p.Name<>m.Name OR p.Sku<>m.Sku)
            THROW 51000, 'Product identity changed since image audit; review before applying.', 1;
        UPDATE p SET ImageUrl=m.Url FROM dbo.Products p JOIN @media m ON m.Id=p.Id WHERE NULLIF(LTRIM(RTRIM(p.ImageUrl)),'') IS NULL OR (m.Previous IS NOT NULL AND p.ImageUrl=m.Previous);
        UPDATE i SET Url=m.Url,AltText=m.Alt FROM dbo.ProductImages i JOIN @media m ON m.Id=i.ProductId
        JOIN dbo.Products p ON p.Id=m.Id AND p.ImageUrl=m.Url WHERE m.Previous IS NOT NULL AND i.Url=m.Previous;
        INSERT dbo.ProductImages(ProductId,Url,IsPrimary,SortOrder,AltText,CreatedAt)
        SELECT m.Id,m.Url,1,0,m.Alt,SYSUTCDATETIME() FROM @media m JOIN dbo.Products p ON p.Id=m.Id AND p.ImageUrl=m.Url
        WHERE NOT EXISTS(SELECT 1 FROM dbo.ProductImages i WHERE i.ProductId=m.Id);
        COMMIT;''',[payload])
        after=sql_json('SELECT Id,Sku,Price,StockQuantity,IsActive FROM dbo.Products ORDER BY Id')
        if before!=after:raise RuntimeError('Business data changed during backfill; inspect snapshot')
        print('Applied image-only update; prices, stock and availability unchanged.')
if __name__=='__main__':main()
