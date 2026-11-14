import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.PORT || 4173);
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.txt': 'text/plain', '.pdf': 'application/pdf' };
const server = createServer(async (req, res) => {
  try {
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405, { Allow: 'GET, HEAD' }); res.end('Method not allowed'); return;
    }
    const pathname = decodeURIComponent(new URL(req.url, `http://localhost:${port}`).pathname);
    const asset = pathname === '/' ? 'index.html' : pathname === '/api/prices' ? 'data/prices.json' : pathname === '/api/catalog' ? 'data/price-catalog.json' : pathname.slice(1);
    if (!/^(index\.html|styles\.css|app\.js|favicon\.svg|robots\.txt|lib\/[\w.-]+\.js|data\/[\w-]+\.json|output\/pdf\/compute-price-methodology\.pdf)$/.test(asset)) {
      res.writeHead(404); res.end('Not found'); return;
    }
    const body = await readFile(path.join(root, asset));
    const type = mime[path.extname(asset)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type === 'application/pdf' ? type : `${type}; charset=utf-8`, 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(404); res.end('Not found');
  }
});
server.listen(port, '127.0.0.1', () => console.log(`Compute Price preview: http://localhost:${port}`));
