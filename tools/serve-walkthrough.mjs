/**
 * Serves the walkthrough folder for local viewing.
 *
 *   node tools/serve-walkthrough.mjs           # http://127.0.0.1:8089/
 *
 * A browser opened straight on docs/walkthrough/index.html can refuse to read the media sitting
 * next to it. This server answers Range requests, which is what the video element needs in order to
 * stream and seek a 50 MB recording. It binds to loopback and will only ever read files from
 * docs/walkthrough.
 */
import { createServer } from 'node:http';
import { extname, join, relative, resolve, sep } from 'node:path';
import { createReadStream, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const FOLDER = resolve(fileURLToPath(import.meta.url), '..', '..', 'docs', 'walkthrough');
const PORT = Number(process.env.WALKTHROUGH_PORT ?? 8089);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.srt': 'application/x-subrip; charset=utf-8',
  '.wav': 'audio/wav',
  '.md': 'text/markdown; charset=utf-8'
};

const server = createServer((request, response) => {
  const path = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
  const wanted = resolve(join(FOLDER, path === '/' ? 'index.html' : path.replace(/^\/+/, '')));
  const inside = relative(FOLDER, wanted);

  if (inside.startsWith('..') || inside.startsWith(sep)) {
    response.writeHead(403, { 'content-type': 'text/plain' }).end('outside the walkthrough folder');
    return;
  }

  let size;
  try {
    size = statSync(wanted).size;
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain' }).end(`nothing at ${path}`);
    return;
  }

  const type = TYPES[extname(wanted).toLowerCase()] ?? 'application/octet-stream';
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range ?? '');

  if (range) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (Number.isNaN(start) || start > end || end >= size) {
      response.writeHead(416, { 'content-range': `bytes */${size}` }).end();
      return;
    }
    response.writeHead(206, {
      'content-type': type,
      'accept-ranges': 'bytes',
      'content-range': `bytes ${start}-${end}/${size}`,
      'content-length': end - start + 1
    });
    createReadStream(wanted, { start, end }).pipe(response);
    return;
  }

  response.writeHead(200, { 'content-type': type, 'accept-ranges': 'bytes', 'content-length': size });
  createReadStream(wanted).pipe(response);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`walkthrough -> http://127.0.0.1:${PORT}/   serving ${FOLDER}`);
});
