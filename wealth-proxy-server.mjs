/**
 * LEE Wealth 本地静态站 + /_proxy（同源转发 Yahoo / RSS / 新浪等，避免浏览器走公共 CORS 代理报 403/CORS）
 * 用法：在本文件夹执行  node wealth-proxy-server.mjs
 * 浏览器打开：http://localhost:5178/lee%20wealth.html
 * （默认用 5178，避免与 Vite 常用 5173 冲突；可 set PORT=xxxx 自定义）
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 5178;
const HOST = '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.txt': 'text/plain; charset=utf-8',
};

function ctype(p) {
  return MIME[path.extname(p).toLowerCase()] || 'application/octet-stream';
}

async function proxyFetch(targetUrl) {
  const r = await fetch(targetUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      Accept: '*/*',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    },
    redirect: 'follow',
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return await r.text();
}

function safeFileForUrl(pathname) {
  const root = path.resolve(__dirname);
  let rel = pathname === '/' || pathname === '' ? 'lee wealth.html' : pathname.replace(/^\/+/, '');
  try {
    rel = decodeURIComponent(rel);
  } catch {
    return null;
  }
  const full = path.resolve(root, rel);
  if (full !== root && !full.startsWith(root + path.sep)) return null;
  return full;
}

const server = http.createServer((req, res) => {
  (async () => {
    const url = new URL(req.url || '/', 'http://' + HOST);

    if (url.pathname === '/_proxy' || url.pathname === '/proxy') {
      const target = url.searchParams.get('url');
      if (!target || (!target.startsWith('http://') && !target.startsWith('https://'))) {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Bad url');
        return;
      }
      try {
        const body = await proxyFetch(target);
        res.writeHead(200, {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        res.end(body);
      } catch (e) {
        res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Proxy error: ' + (e && e.message ? e.message : String(e)));
      }
      return;
    }

    let full = safeFileForUrl(url.pathname);
    if (full && !fs.existsSync(full)) {
      const alt = full + '.html';
      if (fs.existsSync(alt)) full = alt;
    }
    if (!full || !fs.existsSync(full)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404');
      return;
    }
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      const idx = path.join(full, 'index.html');
      if (!fs.existsSync(idx)) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404');
        return;
      }
      full = idx;
    }
    fs.readFile(full, (err, data) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('read error');
        return;
      }
      res.writeHead(200, { 'Content-Type': ctype(full) });
      res.end(data);
    });
  })().catch((e) => {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(String(e));
  });
});

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  LEE Wealth — 静态页 + /_proxy（减少控制台 CORS/403）');
  console.log('  http://127.0.0.1:' + PORT + '/lee%20wealth.html');
  console.log('  按 Ctrl+C 停止');
  console.log('');
});
