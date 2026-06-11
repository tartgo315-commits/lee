import { jsonResponse, optionsResponse } from '../_helpers.js';

/**
 * 服务端拉取国内 AU9999 参考价（元/克），供前端同源 /api/gold-price 调用，绕开浏览器 CORS。
 */
export async function onRequest(context) {
  const { request } = context;

  if (request.method === 'OPTIONS') {
    return optionsResponse('GET, OPTIONS');
  }
  if (request.method !== 'GET') {
    return jsonResponse({ error: 'method not allowed' }, 405);
  }

  try {
    const r = await fetch(
      'https://push2.eastmoney.com/api/qt/stock/get?secid=118.AU9999&fields=f43,f57,f58',
      {
        headers: {
          Referer: 'https://finance.eastmoney.com/',
          'User-Agent': 'Mozilla/5.0',
        },
      }
    );
    if (r.ok) {
      const o = await r.json();
      if (o?.rc === 0 && o?.data?.f43 != null) {
        const price = Math.round(o.data.f43) / 100;
        if (price > 100 && price < 20000) {
          return jsonResponse(
            { price, source: 'eastmoney_AU9999', unit: 'CNY/g' },
            200,
            { 'Cache-Control': 'no-store, max-age=0' }
          );
        }
      }
    }
  } catch (e) {}

  try {
    const r2 = await fetch('https://hq.sinajs.cn/list=Au9999', {
      headers: { Referer: 'https://finance.sina.com.cn/' },
    });
    if (r2.ok) {
      const txt = await r2.text();
      const m = txt.match(/hq_str_Au9999="([^"]*)"/);
      if (m) {
        const parts = m[1].split(',');
        for (const i of [7, 8, 6, 5, 4, 3]) {
          const n = parseFloat(parts[i]);
          if (n > 100 && n < 20000) {
            return jsonResponse(
              { price: n, source: 'sina', unit: 'CNY/g' },
              200,
              { 'Cache-Control': 'no-store, max-age=0' }
            );
          }
        }
      }
    }
  } catch (e) {}

  return jsonResponse({ error: 'gold price unavailable' }, 502);
}
