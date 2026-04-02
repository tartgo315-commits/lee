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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'method not allowed' });
  }

  const rawSym = Array.isArray(req.query.symbol) ? req.query.symbol[0] : req.query.symbol;
  const rawSyms = Array.isArray(req.query.symbols) ? req.query.symbols[0] : req.query.symbols;

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
    return res.status(200).json({ error: 'missing symbol' });
  }

  const key =
    process.env.TWELVE_DATA_KEY ||
    process.env.TWELVE_DATA_API_KEY ||
    process.env.TWELVEDATA_API_KEY;
  if (!key || !String(key).trim()) {
    return res.status(200).json({
      error: 'no api key',
      hint:
        '在 Vercel → 本项目 → Settings → Environment Variables 添加 TWELVE_DATA_KEY（值=Twelve Data 控制台里的 API Key），务必勾选 Production，保存后 Deployments → Redeploy。',
      expectedNames: ['TWELVE_DATA_KEY', 'TWELVE_DATA_API_KEY', 'TWELVEDATA_API_KEY'],
    });
  }

  try {
    const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbolStr)}&apikey=${encodeURIComponent(String(key).trim())}&dp=2&prepost=true`;
    const r = await fetch(url);
    const data = await r.json();

    if (
      data &&
      (data.status === 'error' || (typeof data.code === 'number' && data.code >= 400))
    ) {
      return res.status(200).json({
        error: data.message || 'twelve data error',
        code: data.code,
      });
    }

    if (isBatch) {
      const reqList = symbolStr.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
      const quotes = parseMultiQuoteResponse(data, reqList);
      return res.status(200).json({ quotes });
    }

    return res.status(200).json(data);
  } catch (e) {
    return res.status(200).json({ error: e && e.message ? e.message : String(e) });
  }
}
