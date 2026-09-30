import { createServer as covenant_createServer } from 'node:http';
import { readFile as covenant_readFile, mkdir as covenant_mkdir } from 'node:fs/promises';
import { handleChat as covenant_handlePrayer } from '../server/chat.mjs';
import { handleModels as covenant_handleScriptures } from '../server/models.mjs';
import { handleUsage as covenant_handleUsage } from '../server/quota.mjs';
import { localDatabase as covenant_localDatabase } from './sqlite.mjs';
await covenant_mkdir('.nova-data', { recursive: true });
const covenant_env = { ...process.env, NOVA_DB: covenant_localDatabase('.nova-data/usage.sqlite') };
const covenant_port = Number(process.env.PORT || 8788);
const covenant_assets = { '/': ['Index.html', 'text/html'], '/Index.html': ['Index.html', 'text/html'], '/assets/ai.js': ['assets/ai.js', 'text/javascript'], '/assets/media.js': ['assets/media.js', 'text/javascript'], '/assets/ai.css': ['assets/ai.css', 'text/css'] };
covenant_createServer(async (covenant_req, covenant_res) => {
  try {
    const covenant_url = new URL(covenant_req.url, `http://localhost:${covenant_port}`);
    if (['/api/models', '/api/usage'].includes(covenant_url.pathname)) {
      const covenant_handler = covenant_url.pathname.endsWith('/usage') ? covenant_handleUsage : covenant_handleScriptures;
      const covenant_response = await covenant_handler(new Request(covenant_url, { method: covenant_req.method, headers: covenant_req.headers }), covenant_env);
      covenant_res.writeHead(covenant_response.status, Object.fromEntries(covenant_response.headers));covenant_res.end(await covenant_response.text());return;
    }
    if (['/api/chat', '/api/memory'].includes(covenant_url.pathname)) {
      const covenant_request = new Request(covenant_url, { method: covenant_req.method, headers: covenant_req.headers, ...(!['GET', 'HEAD'].includes(covenant_req.method) ? { body: covenant_req, duplex: 'half' } : {}) });
      const covenant_response = await covenant_handlePrayer(covenant_request, covenant_env, fetch, covenant_url.pathname.endsWith('/memory') ? 'memory' : 'chat');
      covenant_res.writeHead(covenant_response.status, Object.fromEntries(covenant_response.headers));covenant_res.end(await covenant_response.text());return;
    }
    const covenant_asset = covenant_assets[covenant_url.pathname];
    if (!covenant_asset) {covenant_res.writeHead(404);covenant_res.end('Not found');return;}
    covenant_res.writeHead(200, { 'Content-Type': `${covenant_asset[1]}; charset=utf-8` });covenant_res.end(await covenant_readFile(covenant_asset[0]));
  } catch {covenant_res.writeHead(500);covenant_res.end('Server error');}
}).listen(covenant_port, '127.0.0.1', () => console.log(`Nova: http://localhost:${covenant_port}`));
