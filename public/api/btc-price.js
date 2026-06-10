/**
 * 比特币实时报价（USD + 24h 涨跌），供前端 /api/btc-price 同源调用。
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
    const r = await fetch('https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT', {
      headers: { Accept: 'application/json' },
    });
    if (r.ok) {
      const d = await r.json();
      const usd = parseFloat(d.lastPrice);
      const change24hPct = parseFloat(d.priceChangePercent);
      if (usd > 1000 && usd < 10_000_000) {
        return res.json({
          usd,
          change24hPct: Number.isFinite(change24hPct) ? change24hPct : null,
          source: 'binance',
        });
      }
    }
  } catch (e) {}

  try {
    const r2 = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true',
      { headers: { Accept: 'application/json' } }
    );
    if (r2.ok) {
      const d = await r2.json();
      const usd = d?.bitcoin?.usd;
      const change24hPct = d?.bitcoin?.usd_24h_change;
      if (usd > 1000 && usd < 10_000_000) {
        return res.json({
          usd,
          change24hPct: Number.isFinite(change24hPct) ? change24hPct : null,
          source: 'coingecko',
        });
      }
    }
  } catch (e) {}

  return res.status(502).json({ error: 'btc price unavailable' });
}
