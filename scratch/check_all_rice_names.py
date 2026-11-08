import json, re

with open('scratch/chaldal_service_state.json', encoding='utf-8') as f:
    text = f.read()

matches = re.findall(r'"name"\s*:\s*"([^"]*(?:rice|chal|miniket|najirshail|nazirshail|kalijeera|kalijira|atap|chinigura)[^"]*)"', text, re.I)
print(f"Total rice-related names found: {len(matches)}")
for m in sorted(set(matches)):
    print(" ", m)
