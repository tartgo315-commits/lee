import { jsonResponse, optionsResponse, getQueryParam } from '../_helpers.js';

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return optionsResponse('GET, OPTIONS');
  }
  if (request.method !== 'GET') {
    return jsonResponse({ error: 'method not allowed' }, 405);
  }

  const url = new URL(request.url);
  const rawSym = getQueryParam(url, 'symbol');
  if (rawSym == null || !String(rawSym).trim()) {
    return jsonResponse({ error: 'missing symbol' });
  }

  const symbols = String(rawSym)
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const uniqueSymbols = [...new Set(symbols)];
  if (!uniqueSymbols.length) {
    return jsonResponse({ error: 'missing symbol' });
  }
  const symbolStr = uniqueSymbols.join(',');

  const key =
    env.TWELVE_DATA_KEY ||
    env.TWELVE_DATA_API_KEY ||
    env.TWELVEDATA_API_KEY;
  if (!key || !String(key).trim()) {
    return jsonResponse({
      error: 'no api key',
      hint:
        '在 Vercel / Cloudflare Pages → Environment Variables 添加 TWELVE_DATA_KEY（值=Twelve Data 控制台里的 API Key），保存后重新部署。',
      expectedNames: ['TWELVE_DATA_KEY', 'TWELVE_DATA_API_KEY', 'TWELVEDATA_API_KEY'],
    });
  }

  try {
    const apiUrl = `https://api.twelvedata.com/price?symbol=${encodeURIComponent(symbolStr)}&apikey=${encodeURIComponent(String(key).trim())}`;
    const r = await fetch(apiUrl);
    const data = await r.json();

    if (
      data &&
      (data.status === 'error' || (typeof data.code === 'number' && data.code >= 400))
    ) {
      return jsonResponse({
        error: data.message || 'twelve data error',
        code: data.code,
      });
    }

    return jsonResponse(data);
  } catch (e) {
    return jsonResponse({ error: e && e.message ? e.message : String(e) });
  }
}
