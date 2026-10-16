import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Public photographs marked free under the Unsplash License on their source pages.
const photos = [
  ['fouOokGBWto', 'Coffee and handcrafted ceramic cups', 'KOUS9 STUDIO', 'photo-1645539817051-7d827b020c33'],
  ['PDX_a_82obo', 'Wireless headphones on a yellow background', 'C D-X', 'photo-1505740420928-5e560c06d30e'],
  ['https://unsplash.com/s/photos/sneakers-photography', 'White sneakers with peach detailing', null, 'photo-1622760808027-095ea611f657'],
  ['uyhrXEUdL8s', 'Skincare bottles on a marble tray', 'Aleksandrs Karevs', 'photo-1739950839930-ef45c078f316'],
  ['nclxfUKUHjo', 'A wristwatch and backpack ready for travel', 'Andreas Bentele', 'photo-1704782453615-aca6e455bfb6'],
  ['RsE_Jx8P-hE', 'A jade houseplant in a terracotta pot', 'Hannah Busing', 'photo-1736385388786-37a375bb6b2a'],
  ['RQxEV9l8pAE', 'A woven lounge chair with indoor greenery', 'tommao wang', 'photo-1616422271514-d7d86db67852'],
  ['cGGCg7quYn0', 'A notebook and writing supplies on a wooden desk', null, 'photo-1743385779392-cab22721fac6'],
  ['aGpQZKnZCFU', 'A ceramic bowl of fresh seasonal fruit', 'Qurratul Ayin Sadia', 'photo-1663422229883-9478ceb4363c']
];
const directory = fileURLToPath(new URL('../public/assets/', import.meta.url));
await mkdir(directory, { recursive: true });
const credits = [];
for (const [index, [id, alt, photographer, imageId]] of photos.entries()) {
  const pageUrl = id.startsWith('https://') ? id : `https://unsplash.com/photos/${id}`;
  const url = new URL(`https://images.unsplash.com/${imageId}`);
  url.search = '?auto=format&fit=max&w=1600&q=82&fm=jpg';
  const photo = await fetch(url);
  if (!photo.ok) throw new Error(`Photo ${id}: ${photo.status}`);
  const filename = `photo-${String(index + 1).padStart(2, '0')}.jpg`;
  await writeFile(`${directory}${filename}`, new Uint8Array(await photo.arrayBuffer()));
  credits.push({ filename, alt, photographer, source: pageUrl, image: url.toString(), license: 'https://unsplash.com/license' });
  console.log(`Downloaded ${filename}: ${alt}`);
}
await writeFile(`${directory}photo-credits.json`, JSON.stringify(credits, null, 2) + '\n');
