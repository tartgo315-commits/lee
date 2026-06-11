import { jsonResponse, optionsResponse, getQueryParam } from '../_helpers.js';

/** Twelve Data 多标的 quote 响应可能是数组、单对象或按 ticker 分键的对象 */
function parseMultiQuoteResponse(data, requestedUpper) {
  if (!data || typeof data !== 'object') return [];
  if (Array.isArray(data)) return data;
  if (typeof data.symbol === 'string' && requestedUpper.length <= 1) return [data];
  const want = new Set(requestedUpper);
  const out = [];
  for (const sym of requestedUpper) {
    const block = data[sym];
    if (block && typeof block === 'object' && !Array.isArray(block)) {
      if (typeof block.symbol === 'string' || block.close != null || block.open != null)
        out.push(block);
    }
  }
  if (out.length) return out;
  for (const k of Object.keys(data)) {
    if (k === 'symbol' || k === 'code' || k === 'message' || k === 'status') continue;
    const v = data[k];
    if (
      v &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      typeof v.symbol === 'string' &&
      want.has(String(v.symbol).trim().toUpperCase())
    ) {
      out.push(v);
    }
  }
  if (out.length) return out;
  if (typeof data.symbol === 'string') return [data];
  return [];
}

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
  const rawSyms = getQueryParam(url, 'symbols');

  let symbolStr = '';
  let isBatch = false;
  if (rawSyms != null && String(rawSyms).trim()) {
    isBatch = true;
    const parts = String(rawSyms)
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    symbolStr = [...new Set(parts)].join(',');
  } else if (rawSym != null && String(rawSym).trim()) {
    symbolStr = String(rawSym).trim();
  }

  if (!symbolStr) {
    return jsonResponse({ error: 'missing symbol' });
  }

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
    const apiUrl = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbolStr)}&apikey=${encodeURIComponent(String(key).trim())}&dp=2&prepost=true`;
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

    if (isBatch) {
      const reqList = symbolStr.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
      const quotes = parseMultiQuoteResponse(data, reqList);
      return jsonResponse({ quotes });
    }

    return jsonResponse(data);
  } catch (e) {
    return jsonResponse({ error: e && e.message ? e.message : String(e) });
  }
}
