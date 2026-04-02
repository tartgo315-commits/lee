/**
 * 站点门禁：在 Vercel 环境变量中同时设置 SITE_PASSWORD 与 SITE_AUTH_SECRET 后生效。
 * 未设置则直接放行（避免误锁站）。
 * 与仓库根目录 middleware.js 保持一致；仅当 Vercel Root Directory 为 public 时使用本文件。
 */
function getCookie(header, name) {
  if (!header) return '';
  const parts = header.split(';');
  for (const p of parts) {
    const [k, ...rest] = p.trim().split('=');
    if (k === name) return decodeURIComponent(rest.join('=').trim());
  }
  return '';
}

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function expectedGateToken(secret, password) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(password));
  const bytes = new Uint8Array(sig);
  let bin = '';
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export default async function middleware(request) {
  const url = new URL(request.url);
  const path = url.pathname;

  /* 行情同源代理：必须绕过站点密码，否则未带 Cookie 的 fetch 会 401，整页脚本拉行情失败 */
  if (
    path === '/proxy' ||
    path === '/_proxy' ||
    path === '/api/proxy' ||
    path.startsWith('/api/proxy/') ||
    path === '/api/finnhub-quote' ||
    path.startsWith('/api/finnhub-quote/') ||
    path === '/api/stock-price' ||
    path.startsWith('/api/stock-price/')
  ) {
    return fetch(request);
  }

  if (path === '/api/auth' || path.startsWith('/api/auth/') || path === '/api/logout' || path.startsWith('/api/logout/')) {
    return fetch(request);
  }

  const pwd = process.env.SITE_PASSWORD;
  const secret = process.env.SITE_AUTH_SECRET;
  if (!pwd || !secret) {
    return fetch(request);
  }

  const cookie = request.headers.get('cookie') || '';
  const gate = getCookie(cookie, 'wealth_gate');
  let ok = false;
  try {
    const expected = await expectedGateToken(secret, pwd);
    ok = gate && timingSafeEqual(gate, expected);
  } catch (e) {
    ok = false;
  }

  if (ok) {
    return fetch(request);
  }

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>登录 · LEE's Wealth</title>
<style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;background:#080c14;color:#eef3ff}
.card{width:100%;max-width:360px;padding:28px;border-radius:14px;border:1px solid rgba(55,78,120,.45);background:rgba(15,20,31,.95);box-shadow:0 16px 48px rgba(0,0,0,.5)}
h1{font-size:1.1rem;margin:0 0 6px;font-weight:600}
p{font-size:13px;color:#94a8cc;margin:0 0 18px;line-height:1.5}
label{display:block;font-size:12px;color:#5c6f94;margin-bottom:6px}
input{width:100%;box-sizing:border-box;padding:12px 14px;border-radius:8px;border:1px solid rgba(75,110,170,.4);background:#0f141f;color:#eef3ff;font-size:15px}
input:focus{outline:none;box-shadow:0 0 0 2px rgba(59,130,246,.35)}
button{margin-top:16px;width:100%;padding:12px;border:none;border-radius:8px;font-weight:600;font-size:15px;cursor:pointer;background:linear-gradient(180deg,#4f8fff,#2563eb);color:#fff}
.err{margin-top:12px;font-size:13px;color:#f87171}
</style>
</head>
<body>
<div class="card">
  <h1>LEE's Wealth</h1>
  <p>此站点已启用访问密码。请输入密码后继续（数据仍仅存于本机浏览器）。</p>
  <form method="POST" action="/api/auth">
    <label for="p">密码</label>
    <input id="p" type="password" name="password" required autocomplete="current-password" autofocus>
    <button type="submit">进入</button>
  </form>
</div>
</body>
</html>`;

  return new Response(html, {
    status: 401,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

export const config = {
  matcher: [
    '/',
    /*
     * 整段 /api/* 不跑门禁：避免只排除了 auth/logout 时，/api/proxy、/api/finnhub-quote 仍进 matcher 被误拦成 401。
     * /proxy、/_proxy 仍进 middleware，由上方白名单直接 fetch 放行。
     */
    '/((?!api/|_next/static|_next/image|favicon.ico).*)',
  ],
};
