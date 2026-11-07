import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { build } from './build.mjs';
await build();
const html = new URL('../dist/index.html', import.meta.url);
const port = Number(process.env.PORT || 4173);
createServer(async (req, res) => {
  if (!['/', '/index.html', '/favicon.ico'].includes(new URL(req.url, 'http://localhost').pathname)) { res.writeHead(404); res.end('Not found'); return; }
  if (req.url === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); res.end(await readFile(html));
}).listen(port, '127.0.0.1', () => console.log(`Local: http://127.0.0.1:${port}`));
