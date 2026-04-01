import crypto from 'crypto';

function parseBody(raw) {
  let password = '';
  const t = (raw || '').trim();
  if (!t) return password;
  try {
    const j = JSON.parse(t);
    password = typeof j.password === 'string' ? j.password : '';
  } catch {
    const params = new URLSearchParams(t);
    password = params.get('password') || '';
  }
  return password;
}

export default async function handler(req, res) {
  const pwd = process.env.SITE_PASSWORD;
  const secret = process.env.SITE_AUTH_SECRET;

  if (!pwd || !secret) {
    res.status(503).setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send('<p>未配置 SITE_PASSWORD / SITE_AUTH_SECRET，门禁未启用。</p>');
    return;
  }

  if (req.method === 'GET') {
    res.redirect(302, '/');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).setHeader('Allow', 'POST, GET');
    res.end('Method Not Allowed');
    return;
  }

  let password = '';
  if (req.body != null && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    const v = req.body.password;
    if (v != null) password = String(v);
  }
  if (!password) {
    const raw = await new Promise((resolve, reject) => {
      let d = '';
      req.on('data', (c) => {
        d += c;
      });
      req.on('end', () => resolve(d));
      req.on('error', reject);
    });
    password = parseBody(raw);
  }

  if (password !== pwd) {
    res.status(401).setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>密码错误</title></head><body style="font-family:system-ui;padding:24px;background:#080c14;color:#f87171"><p>密码错误。</p><p><a href="/" style="color:#7cb4fc">返回重试</a></p></body></html>`);
    return;
  }

  const token = crypto.createHmac('sha256', secret).update(pwd, 'utf8').digest('base64url');
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const secure = proto === 'https' || process.env.VERCEL === '1';
  const maxAge = 60 * 60 * 24 * 30;
  const cookie = `wealth_gate=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;

  res.setHeader('Set-Cookie', cookie);
  res.redirect(302, '/');
}
