"""Read-only master-brief category gate. Never creates aliases or taxonomy."""
import csv
import json
from pathlib import Path
from common import ROOT, CLEAN, categories, save_json

ROOTS = 'electronics fashion-apparel home-furniture beauty-personal-care health-wellness grocery-food toys-kids-baby sports-outdoors automotive books-stationery jewelry-accessories pet-supplies tools-hardware garden-outdoor digital-products uncategorized'.split()

def main():
    tree = categories()
    existing = {c['Slug'] for c in tree}
    rows = list(csv.DictReader((ROOT / 'brands_input.csv').open(encoding='utf-8')))
    targets = set(ROOTS) | {r['categorySlug'] for r in rows}
    required = ROOT / 'required_categories.csv'
    if required.exists():
        targets |= {r['slug'] for r in csv.DictReader(required.open(encoding='utf-8'))}
    missing = sorted(targets - existing)
    result = dict(existing_categories=len(tree), required_slugs=len(targets), missing_slugs=missing,
                  passed=not missing, action='Proceed with existing slugs only' if not missing else 'STOP: no imports, schema or taxonomy changes permitted by the master brief')
    save_json(CLEAN / 'master-preflight.json', result)
    lines = ['# Master brief preflight', '', 'The master brief requires stopping when a requested category slug is missing.', '',
             f'Existing SQL categories: {len(tree)}. Required root/brand-input slugs: {len(targets)}.', '',
             '**Result: ' + ('PASS' if not missing else 'STOP — missing category slugs') + '**', '',
             'No categories, application schema, products, orders or stock were changed by this check.', '',
             'Missing slugs:', '', *['- ' + s for s in missing], '',
             'The previous report and existing 145 clean seed rows remain historical evidence. The new master brief does not authorize inventing aliases or creating its missing taxonomy. Existing database slugs are preserved.']
    (ROOT.parent / 'MASTER_SEED_PREFLIGHT.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')
    print(json.dumps(result, indent=2))
    if missing:
        raise SystemExit(2)

if __name__ == '__main__':
    main()
