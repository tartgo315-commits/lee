import { jsonResponse, optionsResponse } from '../_helpers.js';

/**
 * 比特币实时报价（USD + 24h 涨跌），供前端 /api/btc-price 同源调用。
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
    const r = await fetch('https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT', {
      headers: { Accept: 'application/json' },
    });
    if (r.ok) {
      const d = await r.json();
      const usd = parseFloat(d.lastPrice);
      const change24hPct = parseFloat(d.priceChangePercent);
      if (usd > 1000 && usd < 10_000_000) {
        return jsonResponse(
          {
            usd,
            change24hPct: Number.isFinite(change24hPct) ? change24hPct : null,
            source: 'binance',
          },
          200,
          { 'Cache-Control': 'no-store, max-age=0' }
        );
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
        return jsonResponse(
          {
            usd,
            change24hPct: Number.isFinite(change24hPct) ? change24hPct : null,
            source: 'coingecko',
          },
          200,
          { 'Cache-Control': 'no-store, max-age=0' }
        );
      }
    }
  } catch (e) {}

  return jsonResponse({ error: 'btc price unavailable' }, 502);
}
