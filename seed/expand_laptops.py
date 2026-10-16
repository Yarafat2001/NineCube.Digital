"""Reviewed laptop catalogue expansion and compact SKU migration.
No existing stock, prices, product IDs or order snapshots are changed.
New sourced products start with zero stock: receive stock through Inventory.
"""
import argparse, hashlib, io, json, re
from datetime import datetime,timezone
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parent/'.deps'))
from PIL import Image
from bs4 import BeautifulSoup
from common import RAW,CLEAN,save_json,sql,sql_json,sku
from backfill_product_images import get
ROOT=Path(__file__).resolve().parents[1]
MODELS={
0:('Apple','MacBook Air','Apple MacBook Air M5 13 (16GB/512GB)','Apple M5','16GB','512GB','13.6-inch Liquid Retina'),
1:('MSI','Raider','MSI Raider 18 HX AI (32GB/2TB)','Core Ultra 9 285HX','32GB','2TB','18-inch UHD+ MiniLED 120Hz'),
2:('Walton','Prelude','Walton Prelude N41 Pro (8GB/256GB)','Celeron N4120','8GB','256GB','14-inch FHD'),
9:('Acer','Aspire 3','Acer Aspire 3 A325-42-V2 (8GB/256GB)','Ryzen 3 5300U','8GB','256GB','15.6-inch FHD IPS'),
14:('Lenovo','IdeaPad','Lenovo IdeaPad 1 15AMN7 (16GB/512GB)','Ryzen 3 7320U','16GB','512GB','15.6-inch FHD IPS'),
15:('Dell','Pro','Dell Pro 15 PV15250 (8GB/512GB)','Core 3 100U','8GB','512GB','15.6-inch FHD 120Hz'),
16:('Acer','Aspire Lite','Acer Aspire Lite AL15-41 (16GB/512GB)','Ryzen 5 5625U','16GB','512GB','15.6-inch FHD'),
17:('HP','15','HP 15-fc0634AU (8GB/512GB)','Ryzen 5 7520U','8GB','512GB','15.6-inch FHD'),
53:('ASUS','Vivobook','ASUS Vivobook 14 A1404VA (16GB/512GB)','Core 5 120U','16GB','512GB','14-inch FHD IPS'),
55:('MSI','Modern','MSI Modern 15 F1MG (16GB/512GB)','Core 5 120U','16GB','512GB','15.6-inch FHD IPS'),
67:('Dell','Inspiron','Dell Inspiron 3530 i7 (16GB/512GB)','Core i7-1355U','16GB','512GB','15.6-inch FHD'),
68:('Lenovo','IdeaPad Slim','Lenovo IdeaPad Slim 3 15AMN8 (16GB/512GB)','Ryzen 5 40','16GB','512GB','15.6-inch FHD IPS'),
}
def slug(value):return re.sub(r'[^a-z0-9]+','-',value.lower()).strip('-')
def prepare():
    result=[]
    for row in json.loads((CLEAN/'laptop-source-records.json').read_text(encoding='utf-8')):
        brand,line,name,cpu,ram,storage,display=MODELS[row['tile']]
        soup=BeautifulSoup((RAW/('laptop-'+row['url'].rsplit('/',1)[-1]+'.html')).read_bytes(),'html.parser')
        price=float(re.search(r'[\d,]+',soup.select_one('.product-price').get_text(' ',strip=True))[0].replace(',',''))
        identifier=slug(name)
        record=dict(name=name,slug=identifier,sku=sku(identifier),brand=brand,brandSlug=slug(brand),line=line,lineSlug=slug(line),price=price,currency='BDT',stockQuantity=0,
            description=f'{cpu} processor; {ram} RAM; {storage} SSD; {display} display.',
            specsJson=json.dumps(dict(processor=cpu,ram=ram,storage=storage,display=display)),
            sourceUrl=row['url'],sourceName='Star Tech Bangladesh',sourceLicense='Retailer/manufacturer photograph copyright retained; sourced factual specifications and listed price',
            priceBasis='Star Tech listed cash/online BDT price at collection; not a live supplier quote.',images=[],
            tags=['Brand: '+brand,ram+' RAM',storage+' SSD','Gaming' if row['tile']==1 else 'Everyday Computing','Premium' if price>=150000 else 'Mid-range' if price>=50000 else 'Budget'])
        if row['tile']==1:
            specs=json.loads(record['specsJson']);specs['graphics']='NVIDIA RTX 5090 24GB';record['specsJson']=json.dumps(specs)
            record['description']+=' NVIDIA RTX 5090 24GB graphics.'
        urls=list(dict.fromkeys(a['href'] for a in soup.select('a.thumbnail[href]') if '/image/' in a['href']))[:2]
        for index,url in enumerate(urls):
            folder=ROOT/'web/public/products/laptops';folder.mkdir(parents=True,exist_ok=True)
            cache=next(folder.glob(identifier+'-'+str(index)+'-*'),None)
            data=cache.read_bytes() if cache else get(url)
            with Image.open(io.BytesIO(data)) as im:
                width,height=im.size;fmt=im.format.lower();im.verify()
            if min(width,height)<250:raise ValueError('Product photo is too small')
            ext={'jpeg':'jpg'}.get(fmt,fmt);digest=hashlib.sha256(data).hexdigest();filename=f'{identifier}-{index}-{digest[:10]}.{ext}'
            (folder/filename).write_bytes(data)
            record['images'].append(dict(url='/products/laptops/'+filename,sourceUrl=url,sha256=digest,width=width,height=height))
        if len(record['images'])<2:raise ValueError('Missing matching laptop gallery')
        record['imageUrl']=record['images'][0]['url'];result.append(record)
        print('Prepared',name,flush=True)
    if len(result)!=12:raise ValueError('Expected twelve reviewed laptop configurations')
    save_json(CLEAN/'laptops.json',result)
    return result

def apply(records):
    before=sql_json('SELECT Id,Sku,Name,Slug,Price,StockQuantity,IsActive,ImageUrl FROM dbo.Products ORDER BY Id')
    orders=sql_json('SELECT Id,ProductId,ProductName,PrimaryCategoryName,Quantity,UnitPrice,LineTotal FROM dbo.OrderItems ORDER BY Id')
    categories=sql_json('SELECT Id,Name,Slug,ParentId,Path,Depth FROM dbo.Categories ORDER BY Id')
    mapfile=CLEAN/'sku-migration.json'
    mapping=json.loads(mapfile.read_text(encoding='utf-8')) if mapfile.exists() else [dict(id=p['Id'],slug=p['Slug'],oldSku=p['Sku'],newSku=sku(p['Slug'])) for p in before if len(p['Sku'])>24]
    by_id={p['Id']:p for p in before}
    for m in mapping:
        p=by_id[m['id']]
        if p['Slug']!=m['slug'] or p['Sku'] not in [m['oldSku'],m['newSku']]:raise ValueError('SKU identity changed; review migration')
    planned={m['id']:m['newSku'] for m in mapping};codes=[planned.get(p['Id'],p['Sku']) for p in before]
    if len(set(codes))!=len(codes):raise ValueError('SKU collision')
    for p in records:
        if len(p['name'])>55 or len(p['sku'])>24:raise ValueError('Oversized display identity')
        for im in p['images']:
            if hashlib.sha256((ROOT/'web/public'/im['url'].lstrip('/')).read_bytes()).hexdigest()!=im['sha256']:raise ValueError('Photo checksum mismatch')
    save_json(mapfile,mapping)
    sql(SQL,[json.dumps(mapping),json.dumps(records)])
    after=sql_json('SELECT Id,Sku,Name,Slug,Price,StockQuantity,IsActive,ImageUrl FROM dbo.Products ORDER BY Id')
    old={p['Id']:{k:v for k,v in p.items() if k!='Sku'} for p in before}
    assert all({k:v for k,v in p.items() if k!='Sku'}==old[p['Id']] for p in after if p['Id'] in old),'Existing product data changed'
    assert orders==sql_json('SELECT Id,ProductId,ProductName,PrimaryCategoryName,Quantity,UnitPrice,LineTotal FROM dbo.OrderItems ORDER BY Id'),'Order history changed'
    assert categories==sql_json('SELECT Id,Name,Slug,ParentId,Path,Depth FROM dbo.Categories ORDER BY Id'),'Category tree changed'
    evidence=dict(at=datetime.now(timezone.utc).isoformat(),before=len(before),after=len(after),added=len(after)-len(before),shortenedSkus=len(mapping),maxSkuLength=max(len(p['Sku']) for p in after),existingProductsPreserved=True,ordersPreserved=True,categoriesPreserved=True)
    report_path=CLEAN/'laptop-expansion-result.json'
    history_path=CLEAN/'laptop-expansion-runs.json'
    history=json.loads(history_path.read_text(encoding='utf-8')) if history_path.exists() else ([json.loads(report_path.read_text(encoding='utf-8'))] if report_path.exists() else [])
    history.append(evidence)
    save_json(history_path,history)
    save_json(report_path,evidence)
    print('Database products:',len(after),'New:',len(after)-len(before),'Compact SKU migration:',len(mapping),flush=True)

SQL='''SET XACT_ABORT ON; SET TRANSACTION ISOLATION LEVEL SERIALIZABLE; BEGIN TRANSACTION;
SELECT * INTO #Map FROM OPENJSON(?) WITH(id int,slug nvarchar(200),oldSku nvarchar(64),newSku nvarchar(64));
SELECT * INTO #Laptops FROM OPENJSON(?) WITH(name nvarchar(200),slug nvarchar(200),sku nvarchar(64),brand nvarchar(120),brandSlug nvarchar(120),line nvarchar(120),lineSlug nvarchar(120),price decimal(18,2),description nvarchar(2000),specsJson nvarchar(max),sourceUrl nvarchar(2048),sourceName nvarchar(200),sourceLicense nvarchar(200),priceBasis nvarchar(300),imageUrl nvarchar(2048),images nvarchar(max) AS JSON,tags nvarchar(max) AS JSON);
IF EXISTS(SELECT 1 FROM #Map m LEFT JOIN Products p ON p.Id=m.id WHERE p.Id IS NULL OR p.Slug<>m.slug OR p.Sku NOT IN(m.oldSku,m.newSku)) THROW 51000,'SKU migration identity conflict',1;
UPDATE p SET Sku=m.newSku FROM Products p JOIN #Map m ON m.id=p.Id WHERE p.Sku=m.oldSku AND m.oldSku<>m.newSku;
DECLARE @Category int=(SELECT Id FROM Categories WHERE Slug='laptops' AND IsActive=1);
IF @Category IS NULL THROW 51000,'Active Laptops category required',1;
INSERT Brands(Name,Slug,IsActive,CreatedAt) SELECT DISTINCT l.brand,l.brandSlug,1,SYSUTCDATETIME() FROM #Laptops l WHERE NOT EXISTS(SELECT 1 FROM Brands b WHERE b.Slug=l.brandSlug);
INSERT ProductLines(BrandId,Name,Slug,SortOrder,IsActive) SELECT DISTINCT b.Id,l.line,l.lineSlug,0,1 FROM #Laptops l JOIN Brands b ON b.Slug=l.brandSlug WHERE NOT EXISTS(SELECT 1 FROM ProductLines s WHERE s.BrandId=b.Id AND s.Slug=l.lineSlug);
IF EXISTS(SELECT 1 FROM #Laptops l JOIN Products p ON p.Slug=l.slug WHERE p.Sku<>l.sku) THROW 51000,'Laptop slug/SKU conflict',1;
DECLARE @New TABLE(Id int,Slug nvarchar(200));
INSERT Products(Name,Slug,Sku,Price,Currency,StockQuantity,IsActive,Description,SpecsJson,ImageUrl,BrandId,ProductLineId,SourceUrl,SourceName,SourceLicense,NeedsReview,PriceBasis,PriceVerifiedAt,CreatedAt,UpdatedAt)
OUTPUT inserted.Id,inserted.Slug INTO @New
SELECT l.name,l.slug,l.sku,l.price,'BDT',0,1,l.description,l.specsJson,l.imageUrl,b.Id,s.Id,l.sourceUrl,l.sourceName,l.sourceLicense,0,l.priceBasis,SYSUTCDATETIME(),SYSUTCDATETIME(),SYSUTCDATETIME() FROM #Laptops l JOIN Brands b ON b.Slug=l.brandSlug JOIN ProductLines s ON s.BrandId=b.Id AND s.Slug=l.lineSlug
WHERE NOT EXISTS(SELECT 1 FROM Products p WHERE p.Slug=l.slug);
INSERT ProductCategories(ProductId,CategoryId,IsPrimary) SELECT Id,@Category,1 FROM @New;
INSERT Tags(Name) SELECT DISTINCT CONVERT(nvarchar(80),t.value) FROM #Laptops l CROSS APPLY OPENJSON(l.tags) t WHERE NOT EXISTS(SELECT 1 FROM Tags x WHERE x.Name=t.value);
INSERT ProductTags(ProductId,TagId) SELECT n.Id,t.Id FROM @New n JOIN #Laptops l ON l.slug=n.Slug CROSS APPLY OPENJSON(l.tags) j JOIN Tags t ON t.Name=j.value;
INSERT ProductImages(ProductId,Url,IsPrimary,SortOrder,AltText,CreatedAt)
SELECT n.Id,JSON_VALUE(j.value,'$.url'),CASE WHEN j.[key]='0' THEN 1 ELSE 0 END,CONVERT(int,j.[key]),l.name,SYSUTCDATETIME() FROM @New n JOIN #Laptops l ON l.slug=n.Slug CROSS APPLY OPENJSON(l.images) j;
COMMIT;'''

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--prepare',action='store_true');parser.add_argument('--apply',action='store_true');args=parser.parse_args()
    if args.prepare:prepare()
    if args.apply:apply(json.loads((CLEAN/'laptops.json').read_text(encoding='utf-8')))
    if not args.prepare and not args.apply:parser.print_help()
