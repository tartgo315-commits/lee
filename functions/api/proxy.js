import { textResponse, optionsResponse, getQueryParam } from '../_helpers.js';

/**
 * GET/HEAD `?url=` 服务端 fetch 目标 URL，原样返回正文，CORS `Access-Control-Allow-Origin: *`。
 * 勿对非 2xx 抛错：Yahoo 等常返回 401/403/429，抛错会被 catch 成 502，前端误以为代理坏了。
 */
export async function onRequest(context) {
  const { request } = context;

  if (request.method === 'OPTIONS') {
    return optionsResponse('GET, HEAD, OPTIONS');
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return textResponse('Method not allowed', 405);
  }

  const url = new URL(request.url);
  let target = getQueryParam(url, 'url');
  if (typeof target !== 'string' || !target.trim()) {
    return textResponse('missing url', 400);
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
    return textResponse('Bad url', 400);
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
      method: request.method === 'HEAD' ? 'HEAD' : 'GET',
      signal: ac.signal,
      redirect: 'follow',
      headers,
    });
    clearTimeout(t);

    const body = request.method === 'HEAD' ? '' : await r.text();

    const code = r.status >= 100 && r.status < 600 ? r.status : 502;
    let outCode = code;
    let outBody = body;
    /* Yahoo 常对机房 IP 返回 401/403/429；把状态改成 200 + 空正文，避免浏览器控制台刷红字（前端解析不到数据即放弃）。 */
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

    return textResponse(outBody, outCode, { 'Cache-Control': 'no-store' });
  } catch (e) {
    return textResponse(
      'Proxy error: ' + (e && e.message ? e.message : String(e)),
      200,
      { 'Cache-Control': 'no-store' }
    );
  }
}
