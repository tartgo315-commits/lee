/**
 * Twelve Data Quote 代理：密钥来自 process.env.TWELVE_DATA_KEY。
 * GET ?symbol=AAPL → 归一化 price / 盘前盘后 / 是否开市。
 */
function parseNum(v) {
  if (v == null || v === '') return null;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return n > 0 && isFinite(n) ? n : null;
}

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

  const apiKey = process.env.TWELVE_DATA_KEY;
  if (!apiKey || !String(apiKey).trim()) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(503).json({ error: 'TWELVE_DATA_KEY not configured' });
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

  const upstream = new URL('https://api.twelvedata.com/quote');
  upstream.searchParams.set('symbol', symbol);
  upstream.searchParams.set('apikey', String(apiKey).trim());
  upstream.searchParams.set('dp', '2');
  /* Pro 及以上才有扩展时段字段；免费 key 会忽略或仍返回常规 close */
  upstream.searchParams.set('prepost', 'true');

  try {
    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), 15000);
    const r = await fetch(upstream.toString(), {
      method: 'GET',
      signal: ac.signal,
      headers: { Accept: 'application/json' },
      redirect: 'follow',
    });
    clearTimeout(to);

    const text = await r.text();
    let j;
    try {
      j = JSON.parse(text);
    } catch (_) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(502).json({ error: 'invalid JSON from Twelve Data' });
    }

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    if (
      !r.ok ||
      j.status === 'error' ||
      (typeof j.code === 'number' && j.code >= 400)
    ) {
      const st = typeof j.code === 'number' && j.code >= 400 ? j.code : r.status || 502;
      return res.status(st >= 400 && st < 600 ? st : 502).json({
        error: j.message || String(j.status) || 'Twelve Data error',
        code: j.code,
      });
    }

    const ext = parseNum(j.extended_price);
    const regular =
      parseNum(j.close) ?? parseNum(j.open) ?? parseNum(j.high) ?? parseNum(j.low);
    /* 休市且 API 提供 extended 时，展示价用盘前/盘后；否则用常规 OHLC */
    const price =
      j.is_market_open === false && ext != null ? ext : (regular ?? ext);
    const out = {
      price,
      pre_or_post_market: ext,
      pre_or_post_market_change: parseNum(j.extended_change),
      is_market_open: Boolean(j.is_market_open),
      symbol: j.symbol || symbol,
    };

    if (out.price == null) {
      return res.status(404).json({ error: 'no price in Twelve Data response' });
    }

    return res.status(200).json(out);
  } catch (e) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(502).json({
      error: e && e.message ? e.message : String(e),
    });
  }
}
