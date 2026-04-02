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

  const key = process.env.TWELVE_DATA_KEY;
  if (!key || !String(key).trim()) {
    return res.status(500).json({ error: 'no api key' });
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
