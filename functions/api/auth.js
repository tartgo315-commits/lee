import {
  htmlResponse,
  redirectResponse,
  hmacSha256Base64Url,
  isSecureRequest,
} from '../_helpers.js';

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

export async function onRequest(context) {
  const { request, env } = context;
  const pwd = env.SITE_PASSWORD;
  const secret = env.SITE_AUTH_SECRET;

  if (!pwd || !secret) {
    return htmlResponse('<p>未配置 SITE_PASSWORD / SITE_AUTH_SECRET，门禁未启用。</p>', 503);
  }

  if (request.method === 'GET') {
    return redirectResponse('/', 302);
  }

  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', {
      status: 405,
      headers: { Allow: 'POST, GET', 'Access-Control-Allow-Origin': '*' },
    });
  }

  const raw = await request.text();
  const password = parseBody(raw);

  if (password !== pwd) {
    return htmlResponse(
      `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>密码错误</title></head><body style="font-family:system-ui;padding:24px;background:#080c14;color:#f87171"><p>密码错误。</p><p><a href="/" style="color:#7cb4fc">返回重试</a></p></body></html>`,
      401
    );
  }

  const token = await hmacSha256Base64Url(secret, pwd);
  const secure = isSecureRequest(request);
  const maxAge = 60 * 60 * 24 * 30;
  const cookie = `wealth_gate=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;

  return redirectResponse('/', 302, { 'Set-Cookie': cookie });
}
