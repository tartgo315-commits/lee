import { jsonResponse, optionsResponse, getQueryParam, corsHeaders } from '../_helpers.js';

/**
 * 服务端代拉 Finnhub quote，密钥来自环境变量 FINNHUB_TOKEN（勿写入 index.html）。
 */
export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return optionsResponse('GET, OPTIONS');
  }

  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const token = env.FINNHUB_TOKEN;
  if (!token || !String(token).trim()) {
    return jsonResponse({ error: 'FINNHUB_TOKEN not configured' }, 503);
  }

  const url = new URL(request.url);
  let symbol = getQueryParam(url, 'symbol');
  symbol = String(symbol || '')
    .trim()
    .toUpperCase();
  if (!symbol || !/^[A-Z0-9.\-]{1,24}$/.test(symbol)) {
    return jsonResponse({ error: 'missing or invalid symbol' }, 400);
  }

  const upstream = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(String(token).trim())}`;

  try {
    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), 15000);
    const r = await fetch(upstream, {
      method: 'GET',
      signal: ac.signal,
      headers: { Accept: 'application/json' },
      redirect: 'follow',
    });
    clearTimeout(to);

    const text = await r.text();
    const code = r.status >= 100 && r.status < 600 ? r.status : 502;
    return new Response(text, {
      status: code,
      headers: corsHeaders({
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      }),
    });
  } catch (e) {
    return jsonResponse({
      error: e && e.message ? e.message : String(e),
    }, 502);
  }
}
