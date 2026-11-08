import urllib.request
import re
import json

headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}

req = urllib.request.Request('https://chaldal.com/cooking', headers=headers)
with urllib.request.urlopen(req, timeout=10) as resp:
    html = resp.read().decode('utf-8', errors='ignore')

idx = html.find('window.__serviceState')
if idx != -1:
    print("Found window.__serviceState at index", idx)
    end_idx = html.find('</script>', idx)
    content = html[idx:end_idx].strip()
    print("Content length:", len(content))
    # It might start with window.__serviceState =
    json_str = content[content.find('=') + 1:].strip()
    if json_str.endswith(';'):
        json_str = json_str[:-1].strip()
    try:
        data = json.loads(json_str)
        print("JSON loaded successfully! Keys:", list(data.keys()))
        for k in data.keys():
            print(f"Key: {k} -> {type(data[k])}")
            if isinstance(data[k], dict):
                print(f"  Subkeys: {list(data[k].keys())}")
        with open('scratch/chaldal_service_state.json', 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2)
        print("Wrote scratch/chaldal_service_state.json")
    except Exception as e:
        print("JSON load failed:", e)
        with open('scratch/service_state_raw.txt', 'w', encoding='utf-8') as f:
            f.write(json_str[:2000])
else:
    print("Not found")
