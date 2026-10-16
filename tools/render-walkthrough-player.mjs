/**
 * Re-renders docs/walkthrough/index.html from the existing scenes.json.
 *
 *   node tools/render-walkthrough-player.mjs
 *
 * The player is the page that runs the picture and the voice together, so it can be corrected and
 * re-rendered as often as needed without filming a new take.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { player } from '../web/scripts/walkthrough-player.mjs';

const folder = join(resolve(fileURLToPath(import.meta.url), '..', '..'), 'docs', 'walkthrough');
const manifest = JSON.parse(readFileSync(join(folder, 'scenes.json'), 'utf8'));

writeFileSync(join(folder, 'index.html'), player(manifest));
console.log(
  `index.html re-rendered for ${(manifest.totalMs / 1000).toFixed(1)}s over ${manifest.scenes.length} scenes` +
    ` (${manifest.scenes.filter(scene => scene.error).length} blocked)`
);
