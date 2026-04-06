/**
 * 服务端拉取国内 AU9999 参考价（元/克），供前端同源 /api/gold-price 调用，绕开浏览器 CORS。
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'method not allowed' });
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
          return res.json({ price, source: 'eastmoney_AU9999', unit: 'CNY/g' });
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
            return res.json({ price: n, source: 'sina', unit: 'CNY/g' });
          }
        }
      }
    }
  } catch (e) {}

  return res.status(502).json({ error: 'gold price unavailable' });
}
