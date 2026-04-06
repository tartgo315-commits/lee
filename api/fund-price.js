/**
 * 服务端拉取基金净值（天天基金估算/净值 + 东财历史净值兜底），供 /api/fund-price 同源调用。
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

  const code = String(req.query.code || '')
    .trim()
    .replace(/\D/g, '')
    .slice(0, 6);
  if (!code) return res.status(400).json({ error: 'missing code' });

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
          return res.json({
            price,
            name: d.name || code,
            date: d.gztime || d.jzrq || '',
            type: gsz > 0 ? 'estimate' : 'official',
          });
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
          return res.json({
            price,
            name: code,
            date: item.FSRQ || '',
            type: 'official',
          });
        }
      }
    }
  } catch (e) {}

  return res.status(502).json({ error: 'fund price unavailable' });
}
