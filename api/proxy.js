export default async function handler(req, res) {
  const target = req.query.url;

  if (!target || (!target.startsWith('http://') && !target.startsWith('https://'))) {
    res.status(400).send('Bad url');
    return;
  }

  try {
    const r = await fetch(target, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Accept: '*/*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
      redirect: 'follow',
    });

    if (!r.ok) throw new Error('HTTP ' + r.status);
    const body = await r.text();

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.status(200).send(body);
  } catch (e) {
    res.status(502).send('Proxy error: ' + (e && e.message ? e.message : String(e)));
  }
}
