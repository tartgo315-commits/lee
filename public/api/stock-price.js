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

  const { symbol } = req.query;
  const sym = Array.isArray(symbol) ? symbol[0] : symbol;
  if (!sym || !String(sym).trim()) {
    return res.status(400).json({ error: 'missing symbol' });
  }

  const key =
    process.env.TWELVE_DATA_KEY ||
    process.env.TWELVE_DATA_API_KEY ||
    process.env.TWELVEDATA_API_KEY;
  if (!key || !String(key).trim()) {
    return res.status(500).json({
      error: 'no api key',
      hint:
        '在 Vercel → 本项目 → Settings → Environment Variables 添加 TWELVE_DATA_KEY（值=Twelve Data 控制台里的 API Key），务必勾选 Production，保存后 Deployments → Redeploy。',
      expectedNames: ['TWELVE_DATA_KEY', 'TWELVE_DATA_API_KEY', 'TWELVEDATA_API_KEY'],
    });
  }

  try {
    const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(String(sym).trim())}&apikey=${encodeURIComponent(String(key).trim())}&dp=2&prepost=true`;
    const r = await fetch(url);
    const data = await r.json();

    if (
      data &&
      (data.status === 'error' || (typeof data.code === 'number' && data.code >= 400))
    ) {
      return res.status(502).json({
        error: data.message || 'twelve data error',
        code: data.code,
      });
    }

    return res.status(200).json(data);
  } catch (e) {
    return res.status(502).json({ error: e && e.message ? e.message : String(e) });
  }
}
