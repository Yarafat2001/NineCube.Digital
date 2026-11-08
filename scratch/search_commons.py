import urllib.request
import json

def search_commons(query):
    url = f"https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch={urllib.parse.quote(query)}&gsrnamespace=6&prop=imageinfo&iiprop=url|mime|dimensions&format=json"
    req = urllib.request.Request(url, headers={'User-Agent': 'NineCubeEcommerceBot/1.0 (contact@ninecube.digital)'})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            data = json.load(r)
            pages = data.get('query', {}).get('pages', {})
            print(f"=== Results for: {query} ({len(pages)} items) ===")
            for pid, p in list(pages.items())[:6]:
                ii = p.get('imageinfo', [{}])[0]
                print(f"{p.get('title')}: {ii.get('url')}")
    except Exception as e:
        print(f"Error for {query}: {e}")

if __name__ == '__main__':
    search_commons('anklet payal bells')
    search_commons('silver anklet')
    search_commons('mustard oil')
    search_commons('olive oil bowl olives')
    search_commons('baby knit sweater')
