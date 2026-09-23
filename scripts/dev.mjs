import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { handleChat } from '../server/chat.mjs';
const port = Number(process.env.PORT || 8788);
const assets = { '/': ['Index.html', 'text/html'], '/Index.html': ['Index.html', 'text/html'], '/assets/ai.js': ['assets/ai.js', 'text/javascript'], '/assets/ai.css': ['assets/ai.css', 'text/css'] };
createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${port}`);
    if (['/api/chat', '/api/memory'].includes(url.pathname)) {
      const request = new Request(url, { method: req.method, headers: req.headers, ...(!['GET', 'HEAD'].includes(req.method) ? { body: req, duplex: 'half' } : {}) });
      const response = await handleChat(request, process.env, fetch, url.pathname.endsWith('/memory') ? 'memory' : 'chat');
      res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(await response.text()); return;
    }
    const asset = assets[url.pathname];
    if (!asset) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': `${asset[1]}; charset=utf-8` }); res.end(await readFile(asset[0]));
  } catch { res.writeHead(500); res.end('Server error'); }
}).listen(port, '127.0.0.1', () => console.log(`Nova: http://localhost:${port}`));
