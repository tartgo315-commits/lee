/**
 * 同源代理：?url=https%3A%2F%2F... → 服务端 fetch 后原样返回（绕 CORS）。
 * 勿对非 2xx 抛错：Yahoo 等常返回 401/403/429，抛错会被 catch 成 502，前端误以为代理坏了。
 */
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(405).send('Method not allowed');
  }

  let target = req.query.url;
  if (Array.isArray(target)) target = target[0];
  if (typeof target !== 'string' || !target.trim()) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(400).send('missing url');
  }
  target = target.trim();
  if (target.includes('%')) {
    try {
      target = decodeURIComponent(target);
    } catch (_) {
      /* 已是解码后的 URL 时忽略 */
    }
  }
  if (!target.startsWith('http://') && !target.startsWith('https://')) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(400).send('Bad url');
  }

  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 25000);
    const headers = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      Accept: '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
    };
    try {
      const h = new URL(target).hostname;
      if (/yahoo\.com$/i.test(h) || h.endsWith('.yahoo.com') || /yimg\.com$/i.test(h)) {
        headers['Referer'] = 'https://finance.yahoo.com/';
        headers['Origin'] = 'https://finance.yahoo.com';
      } else if (/eastmoney\.com$/i.test(h) || h.endsWith('.eastmoney.com')) {
        headers['Referer'] = 'https://quote.eastmoney.com/';
        headers['Origin'] = 'https://quote.eastmoney.com';
      }
    } catch (_) {}
    const r = await fetch(target, {
      method: req.method === 'HEAD' ? 'HEAD' : 'GET',
      signal: ac.signal,
      redirect: 'follow',
      headers,
    });
    clearTimeout(t);

    const body = req.method === 'HEAD' ? '' : await r.text();

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');

    const code = r.status >= 100 && r.status < 600 ? r.status : 502;
    let outCode = code;
    let outBody = body;
    try {
      const host = new URL(target).hostname;
      const yh =
        /yahoo\.com$/i.test(host) ||
        host.endsWith('.yahoo.com') ||
        /yimg\.com$/i.test(host);
      if (yh && (code === 401 || code === 403 || code === 429)) {
        outCode = 200;
        outBody = '';
      }
    } catch (_) {}

    return res.status(outCode).send(outBody);
  } catch (e) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res
      .status(200)
      .send('Proxy error: ' + (e && e.message ? e.message : String(e)));
  }
}
