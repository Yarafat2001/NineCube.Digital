import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const all = JSON.parse(readFileSync(join(here, '..', '..', 'scratch', 'r39-products-all.json'), 'utf8'));
const items = Array.isArray(all) ? all : (all.items ?? []);
console.log('total', items.length);

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9\u0980-\u09FF]+/g, ' ').replace(/\s+/g, ' ').trim();
const normTight = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9\u0980-\u09FF]/g, '');

// 1. Exact tight-normalized name groups
const byName = new Map();
for (const p of items) {
  const k = normTight(p.name);
  (byName.get(k) ?? byName.set(k, []).get(k)).push(p);
}
const nameDups = [...byName.values()].filter(g => g.length > 1);
console.log('exact-tight name dup groups:', nameDups.length, 'products involved:', nameDups.reduce((a, g) => a + g.length, 0));

// 2. Same image URL groups
const byImage = new Map();
for (const p of items) {
  const img = (p.imageUrl || p.image || '').trim();
  if (!img) continue;
  (byImage.get(img) ?? byImage.set(img, []).get(img)).push(p);
}
const imageDups = [...byImage.values()].filter(g => g.length > 1).sort((a, b) => b.length - a.length);
console.log('image groups with >1 product:', imageDups.length, 'products involved:', imageDups.reduce((a, g) => a + g.length, 0));

// 3. Near-name groups: same brand + price, name differs only by suffix tokens (Plus, Pro, Pack of..)
const byBrandPrice = new Map();
for (const p of items) {
  const k = `${normTight(p.brand)}|${p.price}`;
  (byBrandPrice.get(k) ?? byBrandPrice.set(k, []).get(k)).push(p);
}
let nearGroups = [];
for (const g of byBrandPrice.values()) {
  if (g.length < 2) continue;
  const seen = new Set();
  for (const p of g) {
    if (seen.has(p.id)) continue;
    const cluster = g.filter(q => {
      if (q.id === p.id) return true;
      const a = norm(p.name).split(' ').sort().join(' ');
      const b = norm(q.name).split(' ').sort().join(' ');
      // same multiset of words, or one contains the other
      return a === b || a.includes(b) || b.includes(a);
    });
    if (cluster.length > 1) {
      cluster.forEach(c => seen.add(c.id));
      nearGroups.push(cluster);
    }
  }
}
nearGroups = nearGroups.sort((a, b) => b.length - a.length);
console.log('near-name (same brand+price, token-overlap) groups:', nearGroups.length, 'products involved:', nearGroups.reduce((a, g) => a + g.length, 0));

// 4. Same image across DIFFERENT names (perception check)
let sameImageDiffName = 0;
const imageGroupsSample = [];
for (const g of imageDups) {
  const names = new Set(g.map(p => normTight(p.name)));
  if (names.size > 1) sameImageDiffName++;
  if (g.length >= 3) imageGroupsSample.push({ count: g.length, names: [...new Set(g.map(p => p.name))].slice(0, 4) });
}
console.log('image groups shared across different names:', sameImageDiffName);

const report = {
  total: items.length,
  exactTightNameDupGroups: nameDups.length,
  exactTightNameProducts: nameDups.reduce((a, g) => a + g.length, 0),
  imageGroupsMulti: imageDups.length,
  imageProducts: imageDups.reduce((a, g) => a + g.length, 0),
  imageGroupsSharedAcrossNames: sameImageDiffName,
  topImageGroups: imageGroupsSample.slice(0, 15),
  nearNameGroups: nearGroups.length,
  nearNameProducts: nearGroups.reduce((a, g) => a + g.length, 0),
  topNearName: nearGroups.slice(0, 15).map(g => ({ count: g.length, ids: g.map(p => p.id), names: g.map(p => p.name), price: g[0].price })),
  nameDupSample: nameDups.slice(0, 10).map(g => ({ count: g.length, ids: g.map(p => p.id), name: g[0].name }))
};
writeFileSync(join(here, '..', '..', 'scratch', 'r39-duplicate-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 1).slice(0, 4000));
