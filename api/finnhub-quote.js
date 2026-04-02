/**
 * 服务端代拉 Finnhub quote，密钥来自 Vercel 环境变量 FINNHUB_TOKEN（勿写入 index.html）。
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = process.env.FINNHUB_TOKEN;
  if (!token || !String(token).trim()) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(503).json({ error: 'FINNHUB_TOKEN not configured' });
  }

  let symbol = req.query.symbol;
  if (Array.isArray(symbol)) symbol = symbol[0];
  symbol = String(symbol || '')
    .trim()
    .toUpperCase();
  if (!symbol || !/^[A-Z0-9.\-]{1,24}$/.test(symbol)) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(400).json({ error: 'missing or invalid symbol' });
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
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    const code = r.status >= 100 && r.status < 600 ? r.status : 502;
    return res.status(code).send(text);
  } catch (e) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(502).json({
      error: e && e.message ? e.message : String(e),
    });
  }
}
