// Tiny static server: node tools/serve.mjs [port] [--lan]  (--lan also serves to phones on your Wi-Fi)
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };
// the GM's local model: /ollama/api/... -> http://127.0.0.1:11434/api/... (Ollama's own port, never exposed itself)
function proxy(req, res, path) {
  if (!/^\/api\/(tags|chat)$/.test(path)) { res.writeHead(403); return res.end(); }
  const up = http.request({ host: '127.0.0.1', port: 11434, path, method: req.method, headers: { 'content-type': 'application/json' } }, r => { res.writeHead(r.statusCode, { 'content-type': 'application/json' }); r.pipe(res); });
  up.on('error', () => { res.writeHead(502); res.end('{"error":"ollama not running"}'); });
  req.pipe(up);
}
export function serve(port = 0, host = '127.0.0.1') {
  const srv = http.createServer(async (req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.startsWith('/ollama/')) return proxy(req, res, p.slice(7));
    if (p.endsWith('/')) p += 'index.html';
    // token pictures: GeezSheets' tokens/ folder beside this repo (one copy for both apps)
    const sheets = normalize(join(root, '..', 'GeezSheets'));
    let file = normalize(join(root, p));
    if (p.startsWith('/tokens/') && !existsSync(file)) file = normalize(join(sheets, p));
    if (p.startsWith('/battlemap/') && !existsSync(file)) file = normalize(join(sheets, p)); // GeezSheets' .dd2vtt maps
    if (!file.startsWith(normalize(root)) && !file.startsWith(sheets)) { res.writeHead(403); return res.end(); }
    try { const b = await readFile(file); res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(b); }
    catch { res.writeHead(404); res.end('not found'); }
  });
  return new Promise(r => srv.listen(port, host, () => r(srv)));
}
if (process.argv[1] && fileURLToPath(import.meta.url) === normalize(process.argv[1])) {
  const lan = process.argv.includes('--lan'), s = await serve(+process.argv[2] || 8123, lan ? '0.0.0.0' : '127.0.0.1'), port = s.address().port;
  console.log('http://127.0.0.1:' + port + '/');
  if (lan) for (const list of Object.values((await import('node:os')).networkInterfaces())) for (const a of list) if (a.family === 'IPv4' && !a.internal) console.log('http://' + a.address + ':' + port + '/');
}
