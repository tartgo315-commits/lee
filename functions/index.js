/**
 * GET /proxy?url=https%3A%2F%2F...  — 仅允许白名单主机，避免开放代理被滥用
 * 需 Blaze 计划（对外网 GET 一般会产生极少费用）
 */
const {onRequest} = require('firebase-functions/v2/https');

const ALLOW = new Set([
  'query1.finance.yahoo.com',
  'query2.finance.yahoo.com',
  'stooq.com',
  'www.stooq.com',
  'feeds.bbci.co.uk',
  'api.mymemory.translated.net',
  'hq.sinajs.cn',
  'latest.currency-api.pages.dev',
  'cdn.jsdelivr.net',
  'data.jsdelivr.com',
  'open.er-api.com',
  'api.frankfurter.app',
  'api.exchangerate.host',
  'translate.googleapis.com',
  'lingva.ml',
  'lingva.garudalinux.org',
]);

function hostAllowed(host) {
  const h = String(host || '')
    .toLowerCase()
    .replace(/\.$/, '');
  if (ALLOW.has(h)) return true;
  if (h.endsWith('.bbc.co.uk') && h.startsWith('feeds.')) return true;
  return false;
}

exports.apiProxy = onRequest(
  {
    cors: true,
    region: 'asia-east1',
    memory: '256MiB',
    timeoutSeconds: 60,
    invoker: 'public',
  },
  async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'GET') {
      res.status(405).set('Allow', 'GET').send('Method Not Allowed');
      return;
    }
    const raw = req.query.url;
    if (!raw || typeof raw !== 'string') {
      res.status(400).type('text/plain').send('missing url');
      return;
    }
    let target;
    try {
      target = new URL(decodeURIComponent(raw));
    } catch {
      try {
        target = new URL(raw);
      } catch {
        res.status(400).type('text/plain').send('invalid url');
        return;
      }
    }
    if (target.protocol !== 'http:' && target.protocol !== 'https:') {
      res.status(400).type('text/plain').send('bad protocol');
      return;
    }
    if (!hostAllowed(target.hostname)) {
      res.status(403).type('text/plain').send('host not allowed');
      return;
    }
    const urlStr = target.toString();
    const ac = new AbortController();
    const kill = setTimeout(() => ac.abort(), 55000);
    try {
      const r = await fetch(urlStr, {
        redirect: 'follow',
        signal: ac.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; LeeWealthProxy/1)',
          Accept: '*/*',
        },
      });
      const text = await r.text();
      res.status(r.status);
      res.set('Content-Type', 'text/plain; charset=utf-8');
      res.set('Cache-Control', 'no-store');
      res.send(text);
    } catch (e) {
      res.status(502).type('text/plain').send('Proxy error: ' + (e && e.message ? e.message : String(e)));
    } finally {
      clearTimeout(kill);
    }
  },
);
