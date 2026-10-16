"""Validate every database product image through the running application's real asset route."""
import io
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent/'.deps'))
from concurrent.futures import ThreadPoolExecutor
from urllib.request import urlopen
from PIL import Image
from common import sql_json, CLEAN, save_json

rows=sql_json('''SELECT p.Id,p.Name,p.ImageUrl,
 (SELECT COUNT(*) FROM dbo.ProductImages i WHERE i.ProductId=p.Id AND i.IsPrimary=1) AS PrimaryImages
 FROM dbo.Products p ORDER BY p.Id''')
def check(row):
    try:
        stored=row.get('ImageUrl')
        if not stored:raise ValueError('Missing database image URL')
        url=stored if stored.startswith('http') else ('http://127.0.0.1:5080' if stored.startswith('/uploads/') else 'http://127.0.0.1:5173')+stored
        with urlopen(url,timeout=30) as response:
            mime=response.headers.get('Content-Type','');data=response.read()
        if not mime.startswith('image/'):raise ValueError('Response is not an image: '+mime)
        with Image.open(io.BytesIO(data)) as image:
            image.verify()
        if row['PrimaryImages']>1:raise ValueError('Multiple primary gallery images')
        return dict(id=row['Id'],name=row['Name'],url=stored,status='ok',bytes=len(data))
    except Exception as error:return dict(id=row['Id'],name=row['Name'],status='failed',error=str(error))
with ThreadPoolExecutor(max_workers=6) as pool:results=list(pool.map(check,rows))
report=dict(total=len(results),loaded=sum(r['status']=='ok' for r in results),failures=[r for r in results if r['status']!='ok'],products=results)
save_json(CLEAN/'image-backfill-verification.json',report)
print({k:v for k,v in report.items() if k!='products'})
if report['failures']:raise SystemExit(1)
