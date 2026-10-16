import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Subject-matched illustrations for the original demo inventory, not manufacturer photos.
const photos = [
  ['NC-1001', 'Espresso Machine Pro', '9rTEwV_G0Do', 'Crew', 'photo-1461988091159-192b6df7054f'],
  ['NC-1002', 'Milk Frother', '4F15y143dIs', 'Ashkan Forouzani', 'photo-1604946326876-e8cdb157ec59'],
  ['NC-1003', 'Burr Coffee Grinder', 'qxwTns6lGpw', 'Dinker Gulati', 'photo-1594379264803-4abcc0fbdee5'],
  ['NC-1004', 'Pour Over Kettle', 'AQTgvFfwOcg', 'syahmi syahir', 'photo-1774294536061-1a5dd16437d2'],
  ['NC-1005', 'Paper Filters (100 pack)', 'Smjhc_mXIt8', 'Ryan Wallace', 'photo-1749467737893-21ae7ea75f6c'],
  ['NC-1006', 'Ceramic Mug Set', 'INY4JowWde4', 'Tom Crew', 'photo-1525972757199-cf2ad7cc4f4b'],
  ['NC-1007', 'Single Origin Beans 1kg', 'vIKHx-ewFFg', 'engin akyurt', 'photo-1634250530142-9f100192b8c8'],
  ['NC-1008', 'Cold Brew Carafe', 'vggj7D4Ns1E', 'Anshu A', 'photo-1564759913726-da6f4c234e63'],
  ['NC-1009', 'Tamper & Mat Bundle', 'xqSkOUl3V7U', 'Babak Eshaghian', 'photo-1758887255513-9752751dfd4c'],
  ['NC-1010', 'Reusable Cup', 'vB6rYZ9rZ6g', 'Globelet Reusable', 'photo-1557344229-de2faa179661']
];
const directory = fileURLToPath(new URL('../public/products/', import.meta.url));
await mkdir(directory, { recursive: true });
const credits = [];
for (const [sku, name, id, photographer, photo] of photos) {
  const url = `https://images.unsplash.com/${photo}?auto=format&fit=max&w=960&q=82&fm=jpg`;
  const response = await fetch(url);
  if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) throw new Error(`${sku}: invalid image response ${response.status}`);
  const filename = `${sku.toLowerCase()}.jpg`;
  await writeFile(`${directory}${filename}`, new Uint8Array(await response.arrayBuffer()));
  credits.push({ sku, name, filename, photographer, source: `https://unsplash.com/photos/${id}`, image: url, license: 'https://unsplash.com/license', usage: 'Illustrative photo matched to demo product type' });
  console.log(`Downloaded ${sku}: ${name}`);
}
await writeFile(`${directory}coffee-photo-credits.json`, JSON.stringify(credits, null, 2) + '\n');
