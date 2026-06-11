import { jsonResponse, optionsResponse, getQueryParam } from '../_helpers.js';

/**
 * 服务端拉取基金净值（天天基金估算/净值 + 东财历史净值兜底），供 /api/fund-price 同源调用。
 */
export async function onRequest(context) {
  const { request } = context;

  if (request.method === 'OPTIONS') {
    return optionsResponse('GET, OPTIONS');
  }
  if (request.method !== 'GET') {
    return jsonResponse({ error: 'method not allowed' }, 405);
  }

  const url = new URL(request.url);
  const code = String(getQueryParam(url, 'code') || '')
    .trim()
    .replace(/\D/g, '')
    .slice(0, 6);
  if (!code) return jsonResponse({ error: 'missing code' }, 400);

  try {
    const r = await fetch(
      `https://fundgz.1234567.com.cn/js/${code}.js?callback=X&v=${Date.now()}`,
      { headers: { Referer: 'https://fund.eastmoney.com/' } }
    );
    if (r.ok) {
      const txt = await r.text();
      const m = txt.match(/X\((\{.*?\})\)/s);
      if (m) {
        const d = JSON.parse(m[1]);
        const gsz = parseFloat(d.gsz);
        const dwjz = parseFloat(d.dwjz);
        const price = gsz > 0 ? gsz : dwjz > 0 ? dwjz : 0;
        if (price > 0) {
          return jsonResponse(
            {
              price,
              name: d.name || code,
              date: d.gztime || d.jzrq || '',
              type: gsz > 0 ? 'estimate' : 'official',
            },
            200,
            { 'Cache-Control': 'no-store, max-age=0' }
          );
        }
      }
    }
  } catch (e) {}

  try {
    const r2 = await fetch(
      `https://api.fund.eastmoney.com/f10/lsjz?fundCode=${code}&pageIndex=1&pageSize=1&_=${Date.now()}`,
      {
        headers: {
          Referer: 'https://fund.eastmoney.com/',
          Accept: 'application/json',
        },
      }
    );
    if (r2.ok) {
      const o = await r2.json();
      const item = o?.Data?.LSJZList?.[0];
      if (item) {
        const price = parseFloat(item.DWJZ);
        if (price > 0) {
          return jsonResponse(
            {
              price,
              name: code,
              date: item.FSRQ || '',
              type: 'official',
            },
            200,
            { 'Cache-Control': 'no-store, max-age=0' }
          );
        }
      }
    }
  } catch (e) {}

  return jsonResponse({ error: 'fund price unavailable' }, 502);
}
