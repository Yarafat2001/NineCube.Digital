#!/usr/bin/env node
/**
 * Writes public/assets/assets.json - the filename-ordered list of card artwork for the helix.
 *
 * The helix reads its nine images from web/public/assets, and Vite does not let application code
 * enumerate a public directory. Rather than hard-coding filenames (which would silently ignore
 * artwork the user drops in), the list is generated here and refreshed by the `predev`/`prebuild`
 * hooks, so `npm run dev` and `npm run build` always see the current directory.
 *
 * Run it on its own with:  npm run assets
 */
import { readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SUPPORTED_EXTENSIONS = new Set(['.svg', '.jpg', '.jpeg', '.png', '.webp']);

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetsDirectory = path.join(projectRoot, 'public', 'assets');
const manifestPath = path.join(assetsDirectory, 'assets.json');

const entries = await readdir(assetsDirectory, { withFileTypes: true });

const files = entries
  .filter((entry) => entry.isFile() && entry.name !== 'assets.json')
  .map((entry) => entry.name)
  .filter((name) => SUPPORTED_EXTENSIONS.has(path.extname(name).toLowerCase()))
  // Filename order, with numeric runs compared as numbers so work-2 sorts before work-10.
  .sort((a, b) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' }));

const manifest = {
  generatedBy: 'scripts/asset-manifest.mjs',
  supportedExtensions: [...SUPPORTED_EXTENSIONS],
  count: files.length,
  files
};

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

console.log(
  `assets.json: ${files.length} card image${files.length === 1 ? '' : 's'} in filename order` +
    (files.length < 9 ? ' (fewer than nine, so the helix will repeat them)' : '')
);
